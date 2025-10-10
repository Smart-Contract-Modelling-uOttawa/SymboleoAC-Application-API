const { getContract } = require('./gateway');
const { publish } = require('./rabbitMQ-Publish');

async function startEventListeners() {
  const contract = await getContract();

  // General-purpose listener
  const listener = async (event) => {
    try {
      const payload = event.payload?.toString();
      const message = JSON.parse(payload);

      console.log(`📡 Event received: ${event.eventName} - ${payload}`);

      // Get transaction and block info
      const eventTx = event.getTransactionEvent();
      const block = eventTx.getBlockEvent();

      console.log(`🔗 Transaction: ${eventTx.transactionId} | Status: ${eventTx.status}`);
      console.log(`🧱 Block: ${block.blockNumber.toString()}`);

      // Extract useful fields from asset (payload)
      //const { eventType, contractId, message, timestamp } = message;
      
      //console.log("message***********")
      //console.log(message.event.roles)

      const targetRoles =  message.event.roles
      //const finalMessage = message 
      //|| `[${event.eventName}] ${eventType || ''} on contract ${contractId} at ${timestamp || new Date().toISOString()}`;

      if (targetRoles.length > 0) {
        await publish(message.event, targetRoles);
      } else {
        console.warn(`⚠️ No roles defined in event: ${event.eventName}`);
      }

    } catch (err) {
      console.error(`❌ Error handling event: ${event.eventName} -`, err.message);
    }
  };

  console.log('🔄 Starting general Fabric event listener...');
  await contract.addContractListener(listener);
}

module.exports = { startEventListeners };






/*const { getContract } = require('./gateway');
const { publish } = require('./rabbitMQ-Publish');

async function startEventListeners() {
  const contract = await getContract();

  await contract.addContractListener('unified-listener', 'MeatSale', async (err, event) => {
    if (err) {
      console.error('❌ Event listener error:', err);
      return;
    }

    const payload = JSON.parse(event.payload.toString());
    const { eventType, role, contractId, timestamp, message, roles } = payload;

    console.log(`📡 [Fabric Event] Type: ${eventType} | Role(s): ${role || roles} | Contract: ${contractId}`);

    // Determine target roles
    const targetRoles = roles || [role];
    const msg = message || `[${eventType}] on contract ${contractId} at ${timestamp}`;

    await publish(msg, targetRoles);
  });

  console.log('🟢 Unified Fabric event listener running...');
}

module.exports = { startEventListeners };
*/