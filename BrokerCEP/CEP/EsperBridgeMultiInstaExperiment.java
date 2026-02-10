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

public class EsperBridgeMultiInstaExperiment {
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

    // 1️⃣ Read instances.json (same style as rules.json)
    ObjectMapper mapper = new ObjectMapper();
    Map<?, ?> instancesConfig = mapper.readValue(new File("instances.json"), Map.class);

    @SuppressWarnings("unchecked")
    List<String> contractIds = (List<String>) instancesConfig.get("contractIds");

    if (contractIds == null || contractIds.isEmpty()) {
        System.err.println("⚠️ instances.json has no contractIds. Nothing to deploy.");
        return;
    }

    System.out.println("📌 Found contract instances: " + contractIds);

    // 2️⃣ Setup Esper runtime (ONE runtime for all instances)
    Configuration config = new Configuration();
    config.getCommon().addEventType("SensorEventsMultiInstaExperiment", SensorEventsMultiInstaExperiment.class);
    EPRuntime runtime = EPRuntimeProvider.getDefaultRuntime(config);
    EPCompiler compiler = EPCompilerProvider.getCompiler();

    // 3️⃣ Deploy ALL rules for ALL instances BEFORE consuming from RabbitMQ
    for (String contractId : contractIds) {
        String rulesFile = "rules" + contractId + ".json";

        try {
            Map<?, ?> rulesConfig = mapper.readValue(new File(rulesFile), Map.class);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rules = (List<Map<String, Object>>) rulesConfig.get("rules");

            if (rules == null || rules.isEmpty()) {
                System.err.println("⚠️ No rules found in " + rulesFile + " (contractId=" + contractId + ")");
                continue;
            }

            for (Map<String, Object> rule : rules) {
                String condition = (String) rule.get("condition");
                String window = (String) rule.get("window");
                String having = (String) rule.get("having");
                String select = (String) rule.get("select");
                String ruleSensorId = (String) rule.get("sensorId");

                /* 
                String epl = String.format(
                        "select %s from SensorEventsMultiInstaExperiment(%s).win:%s having %s",
                        select, condition, window, having
                );*/
                /* 
                String epl = String.format(
                     "select %s from SensorEventsMultiInstaExperiment.win:%s where %s having %s",
                     select, window, condition, having
                );*/
                /* 
                String epl = String.format(
                        "select %s " +
                        "from SensorEventsMultiInstaExperiment.win:%s " +
                        "where %s " +
                        "group by sensorId " +
                        "having %s",
                        select, window, condition, having
                    );*/
                boolean hasAggregate =
                    select.contains("count(") ||
                    select.contains("avg(") ||
                    select.contains("sum(") ||
                    select.contains("max(") ||
                    select.contains("min(");

                boolean hasWindow = (window != null && !window.trim().isEmpty());
                boolean hasHaving = (having != null && !having.trim().isEmpty());

                // Force per-rule sensor filtering (prevents temperatureRule matching lightExposure, etc.)
                String safeSensorId = ruleSensorId.replace("'", "''");
                String whereClause = "sensorId = '" + safeSensorId + "' AND (" + condition + ")";

                String epl;

                if (hasWindow && hasAggregate) {
                    epl = String.format(
                        "select %s from SensorEventsMultiInstaExperiment.win:%s where %s group by sensorId",
                        select, window.trim(), whereClause
                    );
                } else if (hasWindow) {
                    epl = String.format(
                        "select %s from SensorEventsMultiInstaExperiment.win:%s where %s",
                        select, window.trim(), whereClause
                    );
                } else {
                    epl = String.format(
                        "select %s from SensorEventsMultiInstaExperiment where %s",
                        select, whereClause
                    );
                }

                if (hasHaving) {
                    epl += " having " + having.trim();
                }


                System.out.println("8888888888888888888888 epl:" + epl);

                CompilerArguments cargs = new CompilerArguments(config);
                EPCompiled compiled = compiler.compile(epl, cargs);
                EPDeployment deployment = runtime.getDeploymentService().deploy(compiled);

                System.out.println("✅ Rule deployed: contractId=" + contractId + ", ruleId=" + rule.get("id"));

                final String cid = contractId; // capture per listener

                for (EPStatement stmt : deployment.getStatements()) {
                    stmt.addListener((newData, oldData, s, r) -> {

                        String alertTimestamp = java.time.LocalDateTime.now()
                                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd-HH:mm:ss"));

                        String alert = String.format(
                                "🚨 ALERT: %s, alertTimestamp=%s}",
                                newData[0].getUnderlying().toString().replaceAll("}$", ""),
                                alertTimestamp
                        );

                        System.out.println(alert);

                        // Publish alerts back to RabbitMQ
                        try (com.rabbitmq.client.Connection conn = getRabbitConnection();
                             com.rabbitmq.client.Channel channel = conn.createChannel()) {

                            channel.exchangeDeclare(ALERTS_EXCHANGE, "fanout", true);
                            channel.basicPublish(
                                    ALERTS_EXCHANGE,
                                    "",
                                    null,
                                    alert.getBytes(StandardCharsets.UTF_8)
                            );

                        } catch (Exception e) {
                            System.err.println("❌ Failed to publish alert: " + e.getMessage());
                            e.printStackTrace();
                        }
                    });
                }
            }

        } catch (java.io.FileNotFoundException fnf) {
            System.err.println("⚠️ Missing rules file: " + rulesFile + " (skipping contractId=" + contractId + ")");
        } catch (Exception e) {
            System.err.println("❌ Failed deploying rules for contractId=" + contractId);
            e.printStackTrace();
        }
    }

    // 4️⃣ Subscribe to RabbitMQ sensor data (persistent)
    System.out.println("✅ All instance rules deployed. Now starting RabbitMQ consumer...");

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
                    new SensorEventsMultiInstaExperiment(sensorId, value, sensorTimestamp),
                    "SensorEventsMultiInstaExperiment"
            );

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
        //System.out.println("📁 CA Path: " + CA_PATH.toAbsolutePath());
        //System.out.println("📁 PKCS12 Path: " + P12_PATH.toAbsolutePath());

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

        //System.out.println("🔐 Mutual TLS (EXTERNAL) authentication configured.");
        return factory.newConnection();
    }
}
