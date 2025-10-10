// === 3. Secure Alert Subscriber (alertSubscriber.js) ===

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



/*
'use strict';

const amqp = require('amqplib');
const { getContract } = require('../gateway');
const fs = require('fs');

const ALERTS_EXCHANGE = 'alerts';

async function startAlertSubscriber() {
    // TLS connection to RabbitMQ
    const conn = await amqp.connect({
        protocol: 'amqps',
        hostname: 'localhost',
        port: 5671,
        ca: [fs.readFileSync('certs/ca.pem')],
        cert: fs.readFileSync('wallet/subscriber.id', 'utf8') // optional identity for subscriber
    });

    const channel = await conn.createChannel();
    await channel.assertExchange(ALERTS_EXCHANGE, 'fanout', { durable: true });

    // Ephemeral queue bound to alerts exchange
    const { queue } = await channel.assertQueue('', {
        exclusive: true,
        autoDelete: true,
        durable: false
    });
    await channel.bindQueue(queue, ALERTS_EXCHANGE, '');

    console.log(`📡 Listening for alerts on exchange "${ALERTS_EXCHANGE}" ...`);

    channel.consume(queue, async (msg) => {
        try {
            const alertMsg = msg.content.toString();
            console.log('📩 Alert received:', alertMsg);

            // Try to parse JSON body if EsperBridge sends structured JSON
            let alert;
            try {
                alert = JSON.parse(alertMsg);
            } catch {
                // fallback: wrap raw string
                alert = { raw: alertMsg };
            }

            // Extract chaincode function and contractId
            const contractId = alert.contractId || "MeatSale_202581716"; // fallback for testing
            const chaincodeFn = alert.chaincodeFunction || "violateObligation_delivery";

            // Submit transaction
            const contract = await getContract('Regulator2'); // use regulator or admin identity
            const txn = contract.createTransaction(chaincodeFn);

            const result = await txn.submit(contractId);
            console.log(`✅ Smart Contract Submitted: fn=${chaincodeFn}, contract=${contractId}, result=${result.toString()}`);

        } catch (err) {
            console.error('❌ Submission Error:', err.message);
        }
    }, { noAck: true });
}

// Start
startAlertSubscriber().catch(console.error);

*/



/*
const { getContract } = require('../gateway');


async function startAlertSubscriber() {
const conn = await amqp.connect('amqps://localhost');
const channel = await conn.createChannel();
await channel.assertExchange(alertExchange, 'direct', { durable: true });


// Temporary, auto-cleanup queue for alert subscription
const { queue } = await channel.assertQueue('', {
exclusive: true,
autoDelete: true,
durable: false
});
await channel.bindQueue(queue, alertExchange, 'violation');


channel.consume(queue, async (msg) => {
try {
const alert = JSON.parse(msg.content.toString());
console.log('📩 Alert received:', alert);


const contract = await getContract();
const txn = contract.createTransaction('violateObligation_delivery');
const result = await txn.submit(alert.contractId);
console.log('✅ Smart Contract Submitted:', result.toString());


} catch (err) {
console.error('❌ Submission Error:', err.message);
}
}, { noAck: true });
}
startAlertSubscriber();
*/