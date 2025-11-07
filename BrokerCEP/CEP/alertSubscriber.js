// === 3. Secure Alert Subscriber (alertSubscriber.js) ===
'use strict';

/**
 * alertSubscriber.js
 * ----------------------------------------------------------
 * Listens securely for alerts published by EsperBridge (via RabbitMQ)
 * using Mutual TLS (EXTERNAL). Each subscriber authenticates with its
 * Fabric CA-issued X.509 identity (e.g., buyer, regulator).
 *
 * Flow:
 *   RabbitMQ (server cert)
 *        ⇄
 *   Subscriber (client cert from wallet)
 * ----------------------------------------------------------
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; 

const amqp = require('amqplib');
const { getContract } = require('../gateway');
const fs = require('fs');
const path = require('path');
const { executeTransaction } = require('../appAlert');
const { getRuleDetailsBySensorId } = require('../util');



// === Exchange for alerts published by EsperBridge ===
const ALERTS_EXCHANGE = 'alerts';
const ALERTS_QUEUE = 'alert_events'; // fixed, durable queue

// === Helper: Load subscriber identity from Fabric wallet ===
function loadIdentity(identityFile) {
  if (!fs.existsSync(identityFile)) {
    throw new Error(`❌ Identity file not found: ${identityFile}`);
  }

  const data = fs.readFileSync(identityFile, 'utf8');
  const json = JSON.parse(data);

  const cert = json.credentials.certificate.replace(/\\n/g, '\n').trim();
  const key = json.credentials.privateKey.replace(/\\n/g, '\n').trim();

  return { cert, key };
}

// === Helper: Load trusted CA certificate ===
function loadCA() {
  const caPath = path.resolve(
    __dirname,
    '..',
    '..',
    'certs',
    'ca-cert.pem'
  );
  if (!fs.existsSync(caPath)) {
    throw new Error(`❌ Missing CA certificate: ${caPath}`);
  }
  return fs.readFileSync(caPath);
}
  /*
  // === Helper: Get contract id from rules.json  ===
  function getRuleDetailsBySensorId(sensorId) {
    // Read and parse rules.json
    const data = fs.readFileSync('rules.json', 'utf8');
    const rulesConfig = JSON.parse(data);

    // Find the rule with the matching sensorId
    const rule = rulesConfig.rules.find(r => r.sensorId === sensorId);

    if (!rule) {
      console.log(`❌ No rule found for sensorId: ${sensorId}`);
      return null;
    }

    // Return the relevant fields
    const { contractId, chaincodeFunction } = rule;
    return { contractId, chaincodeFunction };
            
    }*/
    /*
    // === Helper : to parse sensorId and sensor value 
    function parseAlret(alert){
      let sensorId = null;
      let avgValue = null;
      let sensorTime = null;
      let alertTime = null;
      //Temperature isA DataTransfer with Env sensorId: String, Env value: Number, Env sensorTimestamp:String, controller:Seller;
      // Use regex to find sensorId=...
      const match = alert.raw.match(/sensorId=([^\s,}]+)/);

      if (match) {
        sensorId = match[1];
        console.log('✅ Extracted sensorId:', sensorId);
      } else {
        console.log('❌ sensorId not found in alert');
      }
      // Use regex to find value=...
       const match2 = alert.raw.match(/avgValue=([^\s,}]+)/);

      if (match2) {
        avgValue = match2[1];
        console.log('✅ Extracted avgValue:', avgValue);
      } else {
        console.log('❌ avgValue not found in alert');
      }

      // Use regex to find sensorTime=...
      const match3 = alert.raw.match(/sensorTimestamp=([^\s,}]+)/);

      if (match3) {
        sensorTime = match3[1];
        console.log('✅ Extracted sensorTime:', sensorTime);
      } else {
        console.log('❌ sensorTime not found in alert');
      }

      // Use regex to find alertTime=...
      const match4 = alert.raw.match(/alertTimestamp=([^\s,}]+)/);

      if (match4) {
        alertTime = match4[1];
        console.log('✅ Extracted alertTime:', alertTime);
      } else {
        console.log('❌ alertTime not found in alert');
      }

      return { sensorId, avgValue, sensorTime, alertTime};

    }*/


async function startAlertSubscriber() {
  // === Paths ===
  const walletDir = path.resolve(__dirname, '..', '..', 'wallet');
  const subscriberFile = path.join(walletDir, 'buyer_Buyer.id'); // change to 'regulator_Regulator.id' if needed
  const { cert, key } = loadIdentity(subscriberFile);
  const caCert = loadCA();

  console.log('🔐 Starting secure alert subscriber (mutual TLS)...');

  // === Establish secure AMQPS connection (Mutual TLS) ===
  const conn = await amqp.connect({
    protocol: 'amqps',
    hostname: 'rabbitmq-server',       // must match CN in RabbitMQ cert
    port: 5671,
    ca: [caCert],
    cert,
    key,
    servername: 'rabbitmq-server',     // enforce hostname verification
    rejectUnauthorized: true           // require trusted certs only
  });

  const channel = await conn.createChannel();
  await channel.assertExchange(ALERTS_EXCHANGE, 'fanout', { durable: true });

  // Ephemeral queue for receiving alerts
  const { queue } = await channel.assertQueue('', {
    exclusive: true,
    autoDelete: false,
    durable: false
  });

  await channel.bindQueue(queue, ALERTS_EXCHANGE, '');
  console.log(`📡 Listening securely on exchange "${ALERTS_EXCHANGE}" via mutual TLS...`);

  // === Handle Incoming Alerts ===
  channel.consume(queue, async (msg) => {
    try {
      const alertMsg = msg.content.toString();
      console.log('📩 Alert received:', alertMsg);

      // Attempt to parse JSON payload
      let alert;
      try {
        alert = JSON.parse(alertMsg);
      } catch {
        alert = { raw: alertMsg };
      }
       /*
      // parsing
      const {sensorId, avgValue, sensorTime, alertTime} = parseAlret(alert);
      console.log(sensorId,avgValue, sensorTime, alertTime)

      // Get contract id from rules.json to send alret event back to smart contract
      const { contractId, chaincodeFunction} = getRuleDetailsBySensorId(sensorId)
      */
      const chaincodeFn = await executeTransaction(alert);

 
      // Default/fallback contract & function
      //const contractId = alert.contractId || 'MeatSale_202581716';
      //const chaincodeFn = alert.chaincodeFunction || 'violateObligation_delivery';

      // Submit transaction to Fabric network
      //const contract = await getContract('Regulator2');
      //const txn = contract.createTransaction(chaincodeFn);
      //const result = await txn.submit(contractId);
      console.log(`✅ Executed ${chaincodeFunction} successfully:`, chaincodeFn);

    } catch (err) {
      console.error(`❌ Failed to execute :`, err.message);
    }
  }, { noAck: true });

  // Graceful shutdown on exit
  process.on('SIGINT', async () => {
    console.log('\n🔻 Closing subscriber connection...');
    await conn.close();
    process.exit(0);
  });
}

// === Start Subscriber ===
startAlertSubscriber().catch(err => {
  console.error('❌ Fatal Error:', err.message);
});




