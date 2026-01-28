
const amqp = require('amqplib');
const { getRuleDetailsBySensorId } = require('./utilMultiInstaExperiment');
const fs = require("fs");
const path = require("path");


const exchangeName = 'eventExchange';


let roles;
async function startPerRoleSubscribers() {
  
// List of roles to listen for Conract notification
// change it to the list of roles name
// Read instances.json
  const instances = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'CEP', 'instances.json'), "utf8")
  );

  // Extract ONLY contractIds
const contractIds = instances.contractIds;


// Validate
if (!Array.isArray(contractIds) || contractIds.length === 0) {
  console.error("⚠️ No contractIds found in instances.json");
  process.exit(0);
}
    // ONE connection/channel/exchange
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertExchange(exchangeName, 'direct', { durable: false });

// Loop through contractIds ONLY
for (const contractId of contractIds) {

 roles = await getRuleDetailsBySensorId("100",false, `rules${contractId}.json`);
 console.log("**********************************")
 console.log(roles)

  try {

    for (const role of roles) {
      //console.log("I am in roleSubscriber")
      //console.log(role)

      const queueName = `queue.role.${role}`;
       //console.log("queueName")
       //console.log(queueName)

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
}//for contractId
}

module.exports = { startPerRoleSubscribers };



