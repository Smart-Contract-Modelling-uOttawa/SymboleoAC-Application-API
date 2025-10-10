// Secure End-to-End IoT Sensor to Smart Contract Flow
// Architecture: Sensor -> RabbitMQ (sensor_data) -> CEP -> RabbitMQ (alerts) -> Node Subscriber -> Fabric


// === 1. Sensor Publisher (sensorPublisher.js) ===
const amqp = require('amqplib');
const sensorExchange = 'sensor_data';


async function publishSensorData(sensorId, temperature) {
const conn = await amqp.connect('amqps://localhost'); // TLS enabled
const channel = await conn.createChannel();
await channel.assertExchange(sensorExchange, 'fanout', { durable: true });


const payload = JSON.stringify({
sensorId,
temperature,
timestamp: new Date().toISOString(),
signature: 'signed-payload', // optional cryptographic signature
});


channel.publish(sensorExchange, '', Buffer.from(payload));
console.log(`📡 Sensor sent: ${payload}`);


await channel.close();
await conn.close();
}


// Simulated data
setInterval(() => {
const temp = Math.floor(Math.random() * 40);
publishSensorData('sensor-123', temp);
}, 2000);