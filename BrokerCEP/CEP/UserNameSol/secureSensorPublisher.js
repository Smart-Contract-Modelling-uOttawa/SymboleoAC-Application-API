// secureSensorPublisher.js
// Publishes signed sensor data with contractId

'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; 
process.env.NODE_DEBUG = 'tls';

const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
const tls = require('tls');


// === Load Fabric wallet identity (sensor cert + key) ===
// === Publish Sensor Data Securely over TLS ===
async function publishSensorData(sensorId, value) {
    const walletPath = path.join(__dirname, '..', '..', 'wallet', `${sensorId}.id`);
    console.log("Wallet path:", walletPath);

    if (!fs.existsSync(walletPath)) {
        throw new Error(`❌ Identity file not found: ${walletPath}`);
    }

    const data = fs.readFileSync(walletPath, 'utf8');
    const json = JSON.parse(data);

    // ✅ Convert escaped newlines to actual line breaks
    const cert = json.credentials.certificate.replace(/\\n/g, '\n').trim();
    //console.log("cert");
    //console.log(cert);
    const key  = json.credentials.privateKey.replace(/\\n/g, '\n').trim();
    //console.log("key");
    //console.log(key);

    // Path to Fabric CA root certificate (trusted CA)
    //const caPath = path.resolve(__dirname, '..', '..', '..', 'fabric-network-2.2.2', 'organizations', 'fabric-ca', 'org1', 'ca-cert.pem');
    
    //console.log("caPath")
    //console.log(caPath)
   const caCert = fs.readFileSync('/Users/sfuhaid/RunBlockchain/app-meatsale/certs/ca-cert.pem');

    process.env.NODE_EXTRA_CA_CERTS = caCert;

    // Build AMQPS connection
    const connection = await amqp.connect({
      protocol: 'amqps',
      hostname: 'rabbitmq-server',
      port: 5671,
      ca: [caCert],
      cert:cert,
      key:key,
      servername: 'rabbitmq-server', // must match CN in RabbitMQ server cert
      rejectUnauthorized: true
    });
    
    const channel = await connection.createChannel();
    await channel.assertQueue('sensor_data', { durable: true });

    const payload = JSON.stringify({ sensorId, value });
    channel.sendToQueue('sensor_data', Buffer.from(payload));

    console.log(`✅ [${sensorId}] Published event: ${payload}`);

    await channel.close();
    await connection.close();
}

// === Test Harness for Multiple Sensors ===
const sensors = [
    { id: 'temperature_sensor_tempRule', base: 27, variation: 10 },
    { id: 'humidity_sensor_humidityRule', base: 50, variation: 20 },
    { id: 'vibration_sensor_demo', base: 5, variation: 3 } // test unauthorized sensor
];

// Publish values periodically every 5 seconds
setInterval(() => {
    sensors.forEach(sensor => {
        const value = sensor.base + Math.floor(Math.random() * sensor.variation);
        publishSensorData(sensor.id, value)
            .catch(err => console.error(`❌ [${sensor.id}] Publish failed:`, err.message));
    });
}, 5000);


