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

const amqp = require('amqplib');
const { getContract } = require('../gateway');
const fs = require('fs');
const path = require('path');

// === Exchange for alerts published by EsperBridge ===
const ALERTS_EXCHANGE = 'alerts';

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
    autoDelete: true,
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

      // Default/fallback contract & function
      const contractId = alert.contractId || 'MeatSale_202581716';
      const chaincodeFn = alert.chaincodeFunction || 'violateObligation_delivery';

      // Submit transaction to Fabric network
      const contract = await getContract('Regulator2');
      const txn = contract.createTransaction(chaincodeFn);
      const result = await txn.submit(contractId);

      console.log(`✅ Smart Contract Triggered: fn=${chaincodeFn}, contract=${contractId}, result=${result.toString()}`);
    } catch (err) {
      console.error('❌ Submission Error:', err.message);
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


/*
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; 

const amqp = require('amqplib');
const { getContract } = require('../gateway');
const fs = require('fs');
const path = require('path');

// === Exchange for alerts published by EsperBridge ===
const ALERTS_EXCHANGE = 'alerts';

// === Load subscriber identity from Fabric wallet ===
function loadIdentity(idFile) {
    if (!fs.existsSync(idFile)) {
        throw new Error(`❌ Identity file not found: ${idFile}`);
    }
    const data = fs.readFileSync(idFile, 'utf8');
    const json = JSON.parse(data);
    return {
        cert: json.credentials.certificate,
        key: json.credentials.privateKey
    };
}

async function startAlertSubscriber() {
    // Resolve wallet and cert paths
    const walletDir = path.resolve(__dirname, '..', '..', 'wallet');
    const certsDir = path.resolve(__dirname, '..', '..', 'certs');
    const subscriberIdPath = path.join(walletDir, 'buyer_Buyer.id');

    const subscriberId = loadIdentity(subscriberIdPath);

    // === Fabric CA root cert (trusted CA for RabbitMQ) ===
    const caPath = path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'fabric-network-2.2.2',
        'organizations',
        'fabric-ca',
        'org1',
        'ca-cert.pem'
    );
    const caCert = fs.readFileSync(caPath);

    // === Establish secure AMQPS connection ===
    const conn = await amqp.connect({
        protocol: 'amqps',
        hostname: 'rabbitmq-server', // must match CN in rabbitmq-server.crt
        port: 5671,
        ca: [caCert],
        cert: subscriberId.cert,
        key: subscriberId.key,
        servername: 'rabbitmq-server', // enforce CN match
        rejectUnauthorized: true       // ensure trusted certificate only
    });

    const channel = await conn.createChannel();
    await channel.assertExchange(ALERTS_EXCHANGE, 'fanout', { durable: true });

    // Ephemeral queue for receiving alerts
    const { queue } = await channel.assertQueue('', {
        exclusive: true,
        autoDelete: true,
        durable: false
    });

    await channel.bindQueue(queue, ALERTS_EXCHANGE, '');

    console.log(`📡 Listening securely on exchange "${ALERTS_EXCHANGE}" (TLS active)`);

    // === Message Handler ===
    channel.consume(queue, async (msg) => {
        try {
            const alertMsg = msg.content.toString();
            console.log('📩 Alert received:', alertMsg);

            // Attempt to parse JSON alert
            let alert;
            try {
                alert = JSON.parse(alertMsg);
            } catch {
                alert = { raw: alertMsg };
            }

            // Default/fallback contract & function
            const contractId = alert.contractId || "MeatSale_202581716";
            const chaincodeFn = alert.chaincodeFunction || "violateObligation_delivery";

            // Submit Fabric transaction
            const contract = await getContract('Regulator2');
            const txn = contract.createTransaction(chaincodeFn);
            const result = await txn.submit(contractId);

            console.log(`✅ Smart Contract Triggered: fn=${chaincodeFn}, contract=${contractId}, result=${result.toString()}`);
        } catch (err) {
            console.error('❌ Submission Error:', err.message);
        }
    }, { noAck: true });
}

// === Start Subscriber ===
startAlertSubscriber().catch(console.error);
*/


