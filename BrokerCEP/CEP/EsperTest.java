import com.espertech.esper.common.client.configuration.Configuration;
import com.espertech.esper.common.client.EPCompiled;
import com.espertech.esper.compiler.client.*;
import com.espertech.esper.runtime.client.*;

public class EsperTest {
    public static void main(String[] args) {
        try {
            // Configure Esper
            Configuration config = new Configuration();
            config.getCommon().addEventType(SensorEvent.class);

            // Runtime
            //Starts an Esper runtime instance with our configuration.
            EPRuntime runtime = EPRuntimeProvider.getDefaultRuntime(config);

            // EPL rule
            String epl = "select sensorId, temperature from SensorEvent where temperature > 25";

            // Step 1: Compile
            EPCompiler compiler = EPCompilerProvider.getCompiler();
            CompilerArguments cargs = new CompilerArguments(config);
            EPCompiled compiled = compiler.compile(epl, cargs);

            // Step 2: Deploy
            EPDeployment deployment = runtime.getDeploymentService().deploy(compiled);

            // Attach listener
            for (EPStatement stmt : deployment.getStatements()) {
                stmt.addListener((newData, oldData, s, rt) -> {
                    System.out.println("ALERT: " +
                        newData[0].get("sensorId") + " temp=" + newData[0].get("temperature"));
                });
            }

            // Send test events
            runtime.getEventService().sendEventBean(new SensorEvent("s1", 22), "SensorEvent");
            runtime.getEventService().sendEventBean(new SensorEvent("s2", 28), "SensorEvent");

        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }

    // Event POJO
    public static class SensorEvent {
        private String sensorId;
        private int temperature;

        public SensorEvent(String sensorId, int temperature) {
            this.sensorId = sensorId;
            this.temperature = temperature;
        }

        public String getSensorId() { return sensorId; }
        public int getTemperature() { return temperature; }
    }
}
