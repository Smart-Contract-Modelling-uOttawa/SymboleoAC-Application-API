process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // for dev, set true in prod
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


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
/*
// === Test Sensors === 
const sensors = [
  // ===== Vaccine Procurement =====
  {
    id: 'humidity_VaccineProcurementSharedParty_20260126230520661',
    base: 60,
    variation: 20,
    username: 'humidityVaccine20260126230520661',
    password: 'sensorpass'
  },
  {
    id: 'humidityRule_VaccineProcurementSharedParty_20260126230456957',
    base: 60,
    variation: 20,
    username: 'humidityRuleVaccine20260126230456957',
    password: 'sensorpass'
  },
  {
    id: 'lightExposure_VaccineProcurementSharedParty_20260126230456957',
    base: 0,
    variation: 1,
    username: 'lightVaccine20260126230456957',
    password: 'sensorpass'
  },
  {
    id: 'lightExposure_VaccineProcurementSharedParty_20260126230520661',
    base: 0,
    variation: 1,
    username: 'lightVaccine20260126230520661',
    password: 'sensorpass'
  },
  {
    id: 'sealOpen_VaccineProcurementSharedParty_20260126230456957',
    base: 0,
    variation: 1,
    username: 'sealOpenVaccine20260126230456957',
    password: 'sensorpass'
  },
  {
    id: 'sealOpen_VaccineProcurementSharedParty_20260126230520661',
    base: 0,
    variation: 1,
    username: 'sealOpenVaccine20260126230520661',
    password: 'sensorpass'
  },
  {
    id: 'shock_VaccineProcurementSharedParty_20260126230520661',
    base: 1,
    variation: 3,
    username: 'shockVaccine20260126230520661',
    password: 'sensorpass'
  },
  {
    id: 'shockRule_VaccineProcurementSharedParty_20260126230456957',
    base: 1,
    variation: 3,
    username: 'shockRuleVaccine20260126230456957',
    password: 'sensorpass'
  },
  {
    id: 'temperature_VaccineProcurementSharedParty_20260126230520661',
    base: -95,
    variation: 10,
    username: 'tempVaccine20260126230520661',
    password: 'sensorpass'
  },
  {
    id: 'temperatureRule_VaccineProcurementSharedParty_20260126230456957',
    base: -95,
    variation: 10,
    username: 'tempRuleVaccine20260126230456957',
    password: 'sensorpass'
  },

  // ===== Meat Sale =====
  {
    id: 'temperatureRule_MeatSaleSharedParty_20260126230509416',
    base: 2,
    variation: 1.5,
    username: 'tempMeat20260126230509416',
    password: 'sensorpass'
  },
  {
    id: 'temperatureRule_MeatSaleSharedParty_20260126230531127',
    base: 2,
    variation: 1.5,
    username: 'tempMeat20260126230531127',
    password: 'sensorpass'
  },
  {
    id: 'humidityRule_MeatSaleSharedParty_20260126230509416',
    base: 85,
    variation: 20,
    username: 'humidityMeat20260126230509416',
    password: 'sensorpass'
  },
  {
    id: 'humidityRule_MeatSaleSharedParty_20260126230531127',
    base: 85,
    variation: 20,
    username: 'humidityMeat20260126230531127',
    password: 'sensorpass'
  }
];*/

// === Test Sensors === 
const sensors = [
  // ===== Vaccine Procurement =====
 
  {
    id: 'lightExposure_VaccineProcurementSharedParty_20260126230456957',
    base: 0,
    variation: 2,
    username: 'lightVaccine20260126230456957',
    password: 'sensorpass'
  }
];

/*
// Publish values periodically
setInterval(() => {
  sensors.forEach(sensor => {
    const value = sensor.base + Math.floor(Math.random() * sensor.variation);
    publishSensorData(sensor.id, value, sensor.username, sensor.password);
    await sleep(1100);
  });
}, 10000); // every 10 seconds
*/
async function publishSensors() {
  let value = 0;
  while (value == 0) { //while (true)
    for (const sensor of sensors) {
      value = sensor.base + Math.floor(Math.random() * sensor.variation); //const
      publishSensorData(sensor.id, value, sensor.username, sensor.password);

      console.log(`📡 Sent ${sensor.id}, waiting 10s...`);
      await sleep(10_000); // wait 10 seconds BETWEEN sensors
    }
  }
}

publishSensors();