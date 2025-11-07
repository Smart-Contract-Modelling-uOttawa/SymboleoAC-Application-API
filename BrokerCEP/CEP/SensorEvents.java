 

public class SensorEvents {
    private String sensorId;
    private double value;
    private String sensorTimestamp;

    public SensorEvents(String sensorId, double value, String sensorTimestamp) {
        this.sensorId = sensorId;
        this.value = value;
        this.sensorTimestamp = sensorTimestamp;
    }

    public String getSensorId() {
        return sensorId;
    }

    public double getValue() {
        return value;
    }

    public String getSensorTimestamp() {
        return sensorTimestamp;
    }

    @Override
    public String toString() {
        return "{sensorId=" + sensorId + ", value=" + value + ",sensorTimestamp=" + sensorTimestamp + "}";
    }
}

