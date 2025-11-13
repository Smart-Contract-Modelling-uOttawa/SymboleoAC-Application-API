
const amqp = require('amqplib');

const exchangeName = 'eventExchange';

// List of roles to listen for MeatSale Conract
// change it to the list of roles name
const roles = ['buyer name', 'seller name', 'supplier', 'assessor', 'regulator', 'shipper', 'admin'];

// List of roles to listen for Vaccine Conract
//

async function startPerRoleSubscribers() {
  try {

    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();

    await channel.assertExchange(exchangeName, 'direct', { durable: false });
    

    for (const role of roles) {
      const queueName = `queue.role.${role}`;

      // Declare a dedicated queue for this role
      await channel.assertQueue(queueName, { durable: false });

      // Bind the queue to the exchange using routing key `role.<role>`
      await channel.bindQueue(queueName, exchangeName, `role.${role}`);

      // Start consuming from this role-specific queue
      channel.consume(queueName, (msg) => {
        if (msg?.content) {
          try {
            const payload = msg.content.toString();
            console.log(`📩 [${role.toUpperCase()} Subscriber] Received:`, payload);
          } catch (e) {
            console.error(`❌ Failed to parse message for role ${role}:`, e.message);
          }
        }
      }, { noAck: true });

      console.log(`🟢 Subscriber started for role: ${role}`);
    }

  } catch (err) {
    console.error('❌ Error in per-role subscriber:', err.message);
  }
}

module.exports = { startPerRoleSubscribers };



