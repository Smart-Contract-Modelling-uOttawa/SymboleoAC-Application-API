import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.io.ByteArrayInputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

public class CertificateUtil {
    public static PrivateKey loadPrivateKey(String keyPath) throws Exception {
        String keyPem = new String(Files.readAllBytes(Paths.get(keyPath)))
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s+", "");
        byte[] keyBytes = Base64.getDecoder().decode(keyPem);
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        KeyFactory kf = KeyFactory.getInstance("EC"); // or "RSA" if your CA uses RSA
        return kf.generatePrivate(spec);
    }

      public static boolean verifySensorBinding(String certPem, String sensorId) throws Exception {
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        X509Certificate cert = (X509Certificate) cf.generateCertificate(
                new ByteArrayInputStream(certPem.getBytes()));

        String dn = cert.getSubjectX500Principal().getName();
        // Expect CN=sensorId somewhere in DN
        return dn.contains("CN=" + sensorId);
    }
}


/* 


public class CertificateUtil {
    public static boolean verifySensorBinding(String certPem, String sensorId) throws Exception {
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        X509Certificate cert = (X509Certificate) cf.generateCertificate(
                new ByteArrayInputStream(certPem.getBytes()));

        String dn = cert.getSubjectX500Principal().getName();
        // Expect CN=sensorId somewhere in DN
        return dn.contains("CN=" + sensorId);
    }
}
*/