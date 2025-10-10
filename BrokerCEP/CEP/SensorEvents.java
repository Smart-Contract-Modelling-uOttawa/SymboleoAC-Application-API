 

public class SensorEvents {
    private String sensorId;
    private double value;

    public SensorEvents(String sensorId, double value) {
        this.sensorId = sensorId;
        this.value = value;
    }

    public String getSensorId() {
        return sensorId;
    }

    public double getValue() {
        return value;
    }

    @Override
    public String toString() {
        return "{sensorId=" + sensorId + ", value=" + value + "}";
    }
}

