process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // for dev, set true in prod
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');

// === Configuration ===
const RABBIT_HOST = 'rabbitmq-server';
const RABBIT_PORT = 5671;
const SENSOR_QUEUE = 'sensor_data';

// === Helper: Load sensor identity from Fabric wallet ===
function loadSensorIdentity(sensorId) {
  const walletPath = path.join(__dirname, '..', '..', 'wallet', `${sensorId}.id`);
  //console.log(walletPath)
  if (!fs.existsSync(walletPath)) {
    throw new Error(`❌ Identity file not found: ${walletPath}`);
  }

  const data = fs.readFileSync(walletPath, 'utf8');
  const json = JSON.parse(data);

  const cert = json.credentials.certificate.replace(/\\n/g, '\n').trim();
  const key = json.credentials.privateKey.replace(/\\n/g, '\n').trim();

  //console.log('🔍 Using cert snippet:', cert.slice(0, 100));
  //console.log('🔍 Using key snippet:', key.slice(0, 100));


  //return true;
}

// === Load CA Certificate for TLS encryption ===
function loadCA() {
  const caPath = path.resolve(__dirname, '..', '..', 'certs', 'ca-cert.pem');
  if (!fs.existsSync(caPath)) {
    throw new Error(`❌ Missing CA certificate: ${caPath}`);
  }
  return fs.readFileSync(caPath);
}

async function publishSensorData(sensorId, value, username, password) {
  try {
    loadSensorIdentity(sensorId);
    
    const caCert = loadCA();

    // TLS connection + username/password (PLAIN)
    const connection = await amqp.connect({
      protocol: 'amqps',
      hostname: RABBIT_HOST,
      port: RABBIT_PORT,
      ca: [caCert],
      rejectUnauthorized: true,
      credentials: amqp.credentials.plain(username, password)
    });

    const channel = await connection.createChannel();
    await channel.assertQueue(SENSOR_QUEUE, { durable: true });

    //const payload = JSON.stringify({ sensorId, value });
    const timestamp = new Date().toISOString(); // e.g., "2025-10-29T21:14:32.456Z"

    const payload = JSON.stringify({
      sensorId,
      value,
      timestamp
    });

    channel.sendToQueue(SENSOR_QUEUE, Buffer.from(payload));

    console.log(`✅ [${sensorId}] Published securely via TLS + password auth: ${payload}`);

    await channel.close();
    await connection.close();
  } catch (err) {
    console.error(`❌ [${sensorId}] Publish failed: ${err.message}`);
  }
}
//-20 v 2
// === Test Sensors === for meatsale case study
/*const sensors = [
  { id: 'temperature_sensor_temperatureRule', base: 2, variation: 1.5, username: 'temperature_sensor_tempRule', password: 'sensorpass' },
  { id: 'humidity_sensor_humidityRule', base: 88, variation: 3, username: 'humidity_sensor_humidityRule', password: 'sensorpass' },
  { id: 'vibration_sensor_demo', base: 5, variation: 3, username: 'vibration_sensor_demo', password: 'wrongpass' }, // unauthorized
];*/

// === Test Sensors === for vaccine case study
const sensors = [
  { id: 'temperature_sensor_temperatureRule', base: -95, variation: 10, username: 'temperature_sensor_tempRule', password: 'sensorpass' },
  { id: 'humidity_sensor_humidityRule', base: 65, variation: 20, username: 'humidity_sensor_humidityRule', password: 'sensorpass' },
  { id: 'shock_sensor_shockRule', base: 1, variation: 3, username: 'shock_sensor_shockRule', password: 'sensorpass' },
  { id: 'lightExposure_sensor_lightExposureRule', base: 0, variation: 1, username: 'lightExposure_sensor_lightExposureRule', password: 'sensorpass' },
  { id: 'sealOpen_sensor_sealOpenRule', base: 0, variation: 1, username: 'sealOpen_sensor_sealOpenRule', password: 'sensorpass' },
];


// Publish values periodically
setInterval(() => {
  sensors.forEach(sensor => {
    const value = sensor.base + Math.floor(Math.random() * sensor.variation);
    publishSensorData(sensor.id, value, sensor.username, sensor.password);
  });
}, 5000);
