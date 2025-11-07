// Esper imports
import com.espertech.esper.common.client.configuration.Configuration;
import com.espertech.esper.common.client.EPCompiled;
import com.espertech.esper.compiler.client.EPCompiler;
import com.espertech.esper.compiler.client.EPCompilerProvider;
import com.espertech.esper.compiler.client.CompilerArguments;
import com.espertech.esper.runtime.client.EPRuntime;
import com.espertech.esper.runtime.client.EPRuntimeProvider;
import com.espertech.esper.runtime.client.EPDeployment;
import com.espertech.esper.runtime.client.EPStatement;

// JSON + RabbitMQ
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.*;
import com.rabbitmq.client.ConnectionFactory;

// Java core
import java.io.File;
import java.io.FileInputStream;
import java.nio.channels.Channel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.sql.Connection;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.KeyManagerFactory;

import java.util.List;
import java.util.Map;

public class EsperBridge {
    private static final String ALERTS_EXCHANGE = "alerts";
    private static final String SENSOR_QUEUE = "sensor_data";

    // === Global TLS paths (like Node.js constants) ===
    private static final Path __dirname = Paths.get(System.getProperty("user.dir"));
    
    private static final Path CA_PATH = __dirname
            .getParent() // goes up from BrokerCEP/CEP → BrokerCEP
            .getParent() // goes up from BrokerCEP → symboleoAC-app
            .resolveSibling("fabric-network-2.2.2/organizations/fabric-ca/org1/ca-cert.pem");

    private static final Path P12_PATH = __dirname
            .getParent() // CEP → BrokerCEP
            .resolveSibling("certs/cep_bridge.p12");  // PKCS#12 keystore

    private static final char[] P12_PASSWORD = "changeit".toCharArray(); // same password used in openssl export

    // === RabbitMQ constants ===
    private static final String RABBIT_HOST = "rabbitmq-server";
    private static final int RABBIT_PORT = 5671;

    public static void main(String[] args) throws Exception {
        System.out.println("🚀 Starting EsperBridge...");

        // 1️⃣ Load rules.json (downloaded from Fabric via EnrollSensors.js)
        ObjectMapper mapper = new ObjectMapper();
        Map<?, ?> rulesConfig = mapper.readValue(new File("rules.json"), Map.class);
        List<Map<String, Object>> rules = (List<Map<String, Object>>) rulesConfig.get("rules");

        // 2️⃣ Setup Esper runtime
        Configuration config = new Configuration();
        config.getCommon().addEventType("SensorEvents", SensorEvents.class);
        EPRuntime runtime = EPRuntimeProvider.getDefaultRuntime(config);
        EPCompiler compiler = EPCompilerProvider.getCompiler();

        // 3️⃣ Deploy EPL rules dynamically from rules.json
        for (Map<String, Object> rule : rules) {
            String condition = (String) rule.get("condition");
            String window = (String) rule.get("window");
            String having = (String) rule.get("having");
            String select = (String) rule.get("select");

            String epl = String.format(
                "select %s from SensorEvents(%s).win:%s having %s",
                select, condition, window, having
            );

            CompilerArguments cargs = new CompilerArguments(config);
            EPCompiled compiled = compiler.compile(epl, cargs);
            EPDeployment deployment = runtime.getDeploymentService().deploy(compiled);

            System.out.println("✅ Rule deployed: " + rule.get("id"));

            for (EPStatement stmt : deployment.getStatements()) {
                stmt.addListener((newData, oldData, s, r) -> {

                // Get current date and time
                String alertTimestamp = java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd-HH:mm:ss"));

                // Build alert string with timestamp
                /*String alert = String.format("🚨 ALERT %s [%s]: %s",
                        rule.get("id"),
                        alertTimestamp,
                        newData[0].getUnderlying());*/
                   String alert = String.format("🚨 ALERT %s: %s, alertTimestamp=%s}",
                        rule.get("id"),
                        newData[0].getUnderlying().toString().replaceAll("}$", ""),
                        alertTimestamp);


                    //String alert = "🚨 ALERT " + rule.get("id") + ": " + newData[0].getUnderlying();
                    System.out.println(alert);
                    System.out.println("*******" +newData[0].getUnderlying());
                    //System.out.println("-------" +newData[1].getUnderlying());



                    // Publish alerts back to RabbitMQ
                    try (com.rabbitmq.client.Connection conn = getRabbitConnection();
                         com.rabbitmq.client.Channel channel = conn.createChannel()) {
                        channel.exchangeDeclare(ALERTS_EXCHANGE, "fanout", true);
                        channel.basicPublish(ALERTS_EXCHANGE, "", null,
                                alert.getBytes(StandardCharsets.UTF_8));
                    } catch (Exception e) {
                        System.err.println("❌ Failed to publish alert: " + e.getMessage());
                        e.printStackTrace();
                    }
                });
            }
        }

        // 4️⃣ Subscribe to RabbitMQ sensor data (persistent)
        com.rabbitmq.client.Connection conn = getRabbitConnection();
        com.rabbitmq.client.Channel channel = conn.createChannel();

        channel.queueDeclare(SENSOR_QUEUE, true, false, false, null);

        channel.basicConsume(SENSOR_QUEUE, true, (consumerTag, message) -> {
            String msg = new String(message.getBody(), StandardCharsets.UTF_8);
            try {
                Map<String, Object> sensorData = mapper.readValue(msg, Map.class);
                String sensorId = (String) sensorData.get("sensorId");
                Double value = Double.valueOf(sensorData.get("value").toString());
                String sensorTimestamp = (String) sensorData.get("timestamp");
                System.out.println("Time------------" + sensorTimestamp);


                // ✅ Step 1: Check enrollment in wallet
                if (!WalletUtil.isSensorRegistered(sensorId)) {
                    System.err.println("⚠️ Unauthorized sensorId (not in wallet): " + sensorId);
                    return;
                }

                // ✅ Step 2: verify sensor cert CN matches sensorId
                try {
                    String certPem = WalletUtil.getSensorCert(sensorId);
                    if (!CertificateUtil.verifySensorBinding(certPem, sensorId)) {
                        System.err.println("⚠️ Certificate CN mismatch for sensorId: " + sensorId);
                        return;
                    }
                } catch (Exception e) {
                    System.err.println("⚠️ Error verifying certificate for " + sensorId);
                    e.printStackTrace();
                    return;
                }

                // ✅ Step 3: Send to Esper
                System.out.println("📡 " + sensorId + " value=" + value);
                runtime.getEventService().sendEventBean(
                    new SensorEvents(sensorId, value, sensorTimestamp), "SensorEvents");

            } catch (Exception e) {
                System.err.println("❌ Error processing message: " + e.getMessage());
                e.printStackTrace();
            }
        }, consumerTag -> {});

        // 5️⃣ Keep the bridge alive indefinitely
        System.out.println("🚀 EsperBridge running... waiting for sensor data...");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                System.out.println("🔻 Shutting down EsperBridge...");
                channel.close();
                conn.close();
            } catch (Exception ignored) {}
        }));

        Thread.currentThread().join(); // keep main thread alive
    }

    // === Build a TLS-encrypted connection to RabbitMQ using mutual TLS (EXTERNAL) ===
    private static com.rabbitmq.client.Connection getRabbitConnection() throws Exception {
        System.out.println("📁 CA Path: " + CA_PATH.toAbsolutePath());
        System.out.println("📁 PKCS12 Path: " + P12_PATH.toAbsolutePath());

        // Load CA certificate (trust store)
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        X509Certificate caCert;
        try (FileInputStream fis = new FileInputStream(CA_PATH.toFile())) {
            caCert = (X509Certificate) cf.generateCertificate(fis);
        }
        KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
        trustStore.load(null, null);
        trustStore.setCertificateEntry("fabric-ca", caCert);
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trustStore);

        // Load client key + certificate (from cep_bridge.p12)
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (FileInputStream ksFile = new FileInputStream(P12_PATH.toFile())) {
            keyStore.load(ksFile, P12_PASSWORD);
        }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, P12_PASSWORD);

        // Build SSL context for mutual TLS
        SSLContext sslContext = SSLContext.getInstance("TLS");//v1.2
        sslContext.init(kmf.getKeyManagers(), tmf.getTrustManagers(), new SecureRandom());

        // Connect to RabbitMQ
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(RABBIT_HOST);
        factory.setPort(RABBIT_PORT);
        factory.useSslProtocol(sslContext);
        factory.enableHostnameVerification();

        // Use EXTERNAL mechanism for mutual TLS (no username/password)
        factory.setSaslConfig(DefaultSaslConfig.EXTERNAL);

        System.out.println("🔐 Mutual TLS (EXTERNAL) authentication configured.");
        return factory.newConnection();
    }
}
