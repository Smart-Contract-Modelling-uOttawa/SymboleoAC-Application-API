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
import java.util.List;
import java.util.Map;

public class EsperBridgeMutualTLS {
    private static final String ALERTS_EXCHANGE = "alerts";
    private static final String SENSOR_QUEUE = "sensor_data";

    // === Global TLS paths (like Node.js constants) ===
    private static final Path __dirname = Paths.get(System.getProperty("user.dir"));
    
    private static final Path CA_PATH = __dirname
            .getParent() // goes up from BrokerCEP/CEP → BrokerCEP
            .getParent() // goes up from BrokerCEP → app-meatsale
            .resolveSibling("fabric-network-2.2.2/organizations/fabric-ca/org1/ca-cert.pem");

    private static final Path CERT_PATH = __dirname.getParent().resolveSibling("certs/rabbitmq-server.crt");
    private static final Path KEY_PATH = __dirname.getParent().resolveSibling("certs/rabbitmq-server.key");

    // === RabbitMQ constants ===
    private static final String RABBIT_HOST = "rabbitmq-server";
    private static final int RABBIT_PORT = 5671;

    public static void main(String[] args) throws Exception {
        // 1. Load rules.json (downloaded from Fabric via EnrollSensors.js)
        ObjectMapper mapper = new ObjectMapper();
        Map<?, ?> rulesConfig = mapper.readValue(new File("rules.json"), Map.class);
        List<Map<String, Object>> rules = (List<Map<String, Object>>) rulesConfig.get("rules");

        // 2. Setup Esper runtime
        Configuration config = new Configuration();
        config.getCommon().addEventType("SensorEvents", SensorEvents.class);
        EPRuntime runtime = EPRuntimeProvider.getDefaultRuntime(config);

        EPCompiler compiler = EPCompilerProvider.getCompiler();

        // Deploy EPL rules dynamically from rules.json
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

            for (EPStatement stmt : deployment.getStatements()) {
                stmt.addListener((newData, oldData, s, r) -> {
                    String alert = "ALERT " + rule.get("id") + ": " + newData[0].getUnderlying();
                    System.out.println(alert);

                    // Publish alerts back to RabbitMQ
                    try (com.rabbitmq.client.Connection conn = getRabbitConnection();
                         com.rabbitmq.client.Channel channel = conn.createChannel()) {
                        channel.exchangeDeclare(ALERTS_EXCHANGE, "fanout", true);
                        channel.basicPublish(ALERTS_EXCHANGE, "", null,
                                alert.getBytes(StandardCharsets.UTF_8));
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                });
            }
        }

        // 3. Subscribe to RabbitMQ sensor data
        try (com.rabbitmq.client.Connection conn = getRabbitConnection();
             com.rabbitmq.client.Channel channel = conn.createChannel()) {
            channel.queueDeclare(SENSOR_QUEUE, true, false, false, null);

            channel.basicConsume(SENSOR_QUEUE, true, (consumerTag, message) -> {
                String msg = new String(message.getBody(), StandardCharsets.UTF_8);
                Map<String, Object> sensorData = mapper.readValue(msg, Map.class);

                String sensorId = (String) sensorData.get("sensorId");
                Double value = Double.valueOf(sensorData.get("value").toString());

                // Step 1: check sensor is enrolled in wallet
                if (!WalletUtil.isSensorRegistered(sensorId)) {
                    System.err.println("⚠️ Unauthorized sensorId (not in wallet): " + sensorId);
                    return;
                }

                // Step 2: verify sensor cert CN matches sensorId
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

                // Step 3: inject into Esper
                runtime.getEventService().sendEventBean(
                    new SensorEvents(sensorId, value), "SensorEvents");
            }, consumerTag -> {});
        }
    }

    // Build a secure TLS connection to RabbitMQ using Fabric CA and client certs
      private static com.rabbitmq.client.Connection getRabbitConnection() throws Exception {
        System.out.println("📁 CA Path: " + CA_PATH.toAbsolutePath());
        System.out.println("📁 Server Cert: " + CERT_PATH.toAbsolutePath());
        System.out.println("📁 Server Key: " + KEY_PATH.toAbsolutePath());

        // Load certificates
        CertificateFactory cf = CertificateFactory.getInstance("X.509");

        X509Certificate caCert;
        try (FileInputStream fis = new FileInputStream(CA_PATH.toFile())) {
            caCert = (X509Certificate) cf.generateCertificate(fis);
        }

        X509Certificate clientCert;
        try (FileInputStream fis = new FileInputStream(CERT_PATH.toFile())) {
            clientCert = (X509Certificate) cf.generateCertificate(fis);
        }

        // Load private key (via your existing CertificateUtil)
        java.security.PrivateKey clientKey = CertificateUtil.loadPrivateKey(KEY_PATH.toString());

        // Build trust/key stores
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        ks.setKeyEntry("client-key", clientKey, "".toCharArray(), new java.security.cert.Certificate[]{clientCert});
        ks.setCertificateEntry("fabric-ca", caCert);

        // Init SSL context
        javax.net.ssl.KeyManagerFactory kmf = javax.net.ssl.KeyManagerFactory.getInstance(
                javax.net.ssl.KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, "".toCharArray());

        TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(ks);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(kmf.getKeyManagers(), tmf.getTrustManagers(), new SecureRandom());

        // Connect to RabbitMQ securely
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(RABBIT_HOST);
        factory.setPort(RABBIT_PORT);
        factory.useSslProtocol(sslContext);
        factory.enableHostnameVerification();

        // 🔑 Tell the client to use EXTERNAL auth via TLS cert
        factory.setSaslConfig(DefaultSaslConfig.EXTERNAL);

        System.out.println("🔐 Secure RabbitMQ TLS connection configured.");
        return factory.newConnection();
    }

    /* 
    // Build a secure TLS connection to RabbitMQ, trusting Fabric CA cert
    private static com.rabbitmq.client.Connection getRabbitConnection() throws Exception {
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        FileInputStream fis = new FileInputStream("../../certs/rabbitmq-server.crt");
        X509Certificate caCert = (X509Certificate) cf.generateCertificate(fis);

        KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
        ks.load(null, null);
        ks.setCertificateEntry("fabric-ca", caCert);

        TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(ks);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, tmf.getTrustManagers(), new SecureRandom());

        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost("rabbitmq-server");
        factory.setPort(5671);
        factory.useSslProtocol(sslContext);
        factory.enableHostnameVerification();
        return factory.newConnection();
    }*/
}




/*import com.espertech.esper.compiler.client.*;
import com.espertech.esper.runtime.client.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

// Import our POJO
import Broker.CEP.SensorEvent;

public class EsperBridge {
    private static final String ALERTS_EXCHANGE = "alerts";
    private static final String SENSOR_QUEUE = "sensor_data";

    public static void main(String[] args) throws Exception {
        // 1. Load rules.json (downloaded from Fabric via EnrollSensors.js)
        ObjectMapper mapper = new ObjectMapper();
        Map<?, ?> rulesConfig = mapper.readValue(new File("rules.json"), Map.class);
        List<Map<String, Object>> rules = (List<Map<String, Object>>) rulesConfig.get("rules");

        // 2. Setup Esper runtime
        Configuration config = new Configuration();
        config.getCommon().addEventType("SensorEvent", SensorEvent.class);
        EPRuntime runtime = EPRuntimeProvider.getDefaultRuntime(config);
        EPCompiler compiler = EPCompilerProvider.getCompiler();

        for (Map<String, Object> rule : rules) {
            String condition = (String) rule.get("condition");
            String window = (String) rule.get("window");
            String having = (String) rule.get("having");
            String select = (String) rule.get("select");
            String epl = String.format(
                "select %s from SensorEvent(%s).win:%s having %s",
                select, condition, window, having
            );

            CompilerArguments cargs = new CompilerArguments(config);
            EPCompiled compiled = compiler.compile(epl, cargs);
            EPDeployment deployment = runtime.getDeploymentService().deploy(compiled);

            for (EPStatement stmt : deployment.getStatements()) {
                stmt.addListener((newData, oldData, s, r) -> {
                    String alert = "ALERT " + rule.get("id") + ": " + newData[0].getUnderlying();
                    System.out.println(alert);

                    try (Connection conn = getRabbitConnection();
                         Channel channel = conn.createChannel()) {
                        channel.exchangeDeclare(ALERTS_EXCHANGE, "fanout", true);
                        channel.basicPublish(ALERTS_EXCHANGE, "", null,
                                alert.getBytes(StandardCharsets.UTF_8));
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                });
            }
        }

        // 3. Subscribe to RabbitMQ sensor data
        try (Connection conn = getRabbitConnection();
             Channel channel = conn.createChannel()) {
            channel.queueDeclare(SENSOR_QUEUE, true, false, false, null);

            channel.basicConsume(SENSOR_QUEUE, true, (consumerTag, message) -> {
                String msg = new String(message.getBody(), StandardCharsets.UTF_8);
                Map<String, Object> sensorData = mapper.readValue(msg, Map.class);

                String sensorId = (String) sensorData.get("sensorId");
                Double value = Double.valueOf(sensorData.get("value").toString());

                // Step 1: check sensor is enrolled in wallet
                if (!WalletUtil.isSensorRegistered(sensorId)) {
                    System.err.println("⚠️ Unauthorized sensorId (not in wallet): " + sensorId);
                    return;
                }

                // Step 2: verify sensor cert CN matches sensorId
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

                // Step 3: inject into Esper
                runtime.getEventService().sendEventBean(
                    new SensorEvent(sensorId, value), "SensorEvent");
            }, consumerTag -> {});
        }
    }

    private static Connection getRabbitConnection() throws Exception {
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost("localhost");
        factory.useSslProtocol(); // TLS required
        return factory.newConnection();
    }
}
*/