import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class WalletUtil {

    private static final Path __dirname = Paths.get(System.getProperty("user.dir")).toAbsolutePath();

    // Now navigate up and over, just like your CA_PATH example
    private static final Path WALLET_PATH = __dirname
            .getParent()       // CEP → BrokerCEP
            .getParent()       // BrokerCEP → app-meatsale
            .resolve("wallet") // into the wallet directory
            .normalize();

    private static Path getIdentityPath(String sensorId) {
        return WALLET_PATH.resolve(sensorId + ".id");
    }

    public static boolean isSensorRegistered(String sensorId) {
        return Files.exists(getIdentityPath(sensorId));
    }

    public static String getSensorCert(String sensorId) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(new FileInputStream(getIdentityPath(sensorId).toFile()));
        return node.get("credentials").get("certificate").asText();
    }

    public static String getSensorKey(String sensorId) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(new FileInputStream(getIdentityPath(sensorId).toFile()));
        return node.get("credentials").get("privateKey").asText();
    }
}
