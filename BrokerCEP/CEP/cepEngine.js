// === 2. CEP Filter (cepEngine.js) ===
const fs = require('fs');
const path = require('path');
const amqp = require('amqplib');

const sensorExchange = 'sensor_data';
const alertExchange = 'alerts';

let cepRules = [];
const ruleBuffers = {}; // ruleName -> value buffer

// 🔄 Load rules from file
function loadCepRules() {
  const rulesPath = path.join(__dirname, 'cep-rules.json');
  try {
    const data = fs.readFileSync(rulesPath, 'utf-8');
    cepRules = JSON.parse(data);
    console.log('✅ CEP Rules loaded:', cepRules.map(r => r.name));
  } catch (err) {
    console.error('❌ Failed to load CEP rules:', err.message);
  }
}

// 🔁 Filter evaluation per rule
function evaluateRule(rule, sensorData) {
  if (rule.sensorType !== 'temperature') return false;

  if (!ruleBuffers[rule.name]) ruleBuffers[rule.name] = [];
  const buffer = ruleBuffers[rule.name];

  buffer.push(sensorData.temperature);
  if (buffer.length > rule.count) buffer.shift();

  return buffer.length === rule.count && buffer.every(v => v > rule.threshold);
}

async function startCEP() {
  loadCepRules();

  const conn = await amqp.connect('amqps://localhost');
  const channel = await conn.createChannel();
  await channel.assertExchange(sensorExchange, 'fanout', { durable: true });
  await channel.assertExchange(alertExchange, 'direct', { durable: true });

  const { queue } = await channel.assertQueue('', {
    exclusive: true,
    autoDelete: true,
    durable: false,
  });

  await channel.bindQueue(queue, sensorExchange, '');

  channel.consume(queue, async (msg) => {
    try {
      const data = JSON.parse(msg.content.toString());

      for (const rule of cepRules) {
        if (evaluateRule(rule, data)) {
          const alert = {
            contractId: rule.contractId,
            eventType: rule.eventType,
            roles: rule.roles.map(r => ({ _value: r })),
            message: `🚨 [${rule.name}] Matched values: [${ruleBuffers[rule.name].join(', ')}]`,
            timestamp: new Date().toISOString(),
            chaincodeFunction: rule.chaincodeFunction
          };

          channel.publish(
            alertExchange,
            rule.eventType,
            Buffer.from(JSON.stringify(alert))
          );

          console.log(`🚨 Rule triggered: ${rule.name}`);
          ruleBuffers[rule.name] = []; // reset after triggering
        }
      }
    } catch (e) {
      console.error('❌ CEP Error:', e.message);
    }
  }, { noAck: true });

  console.log('🔄 CEP engine started with external rules');
}

startCEP();


/*
const alertExchange = 'alerts';
let tempBuffer = [];


async function startCEP() {
const conn = await amqp.connect('amqps://localhost');
const channel = await conn.createChannel();
await channel.assertExchange(sensorExchange, 'fanout', { durable: true });
await channel.assertExchange(alertExchange, 'direct', { durable: true });


// Temporary, auto-cleanup queue for sensor data
const { queue } = await channel.assertQueue('', {
exclusive: true,
autoDelete: true,
durable: false
});
await channel.bindQueue(queue, sensorExchange, '');


channel.consume(queue, async (msg) => {
try {
const data = JSON.parse(msg.content.toString());


// Buffer and detect pattern
tempBuffer.push(data.temperature);
if (tempBuffer.length > 3) tempBuffer.shift();


if (tempBuffer.every(t => t > 25)) {
const alert = {
contractId: 'MeatSale_202581716Create',
eventType: 'violation',
roles: [{ _value: 'buyer' }, { _value: 'seller' }],
message: `🔥 Alert: temp > 25 = [${tempBuffer.join(', ')}]`,
timestamp: new Date().toISOString()
};
channel.publish(alertExchange, 'violation', Buffer.from(JSON.stringify(alert)));
console.log('🚨 CEP Triggered Alert:', alert.message);
tempBuffer = [];
}
} catch (e) {
console.error('❌ CEP Error:', e.message);
}
}, { noAck: true });
}
startCEP();
*/