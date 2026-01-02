const { getContract } = require('./gateway');
const { publish } = require('./rabbitMQ-Publish');
const { getRuleDetailsBySensorId } = require('./util');

async function startEventListeners() {
  //console.log("I am inside Event Listeners")
  const { contractId, chaincodeFunction, chaincodeName} = await getRuleDetailsBySensorId("",false)
  const contract = await getContract(chaincodeName, true);

  // General-purpose listener
  const listener = async (event) => {
    try {
      //console.log("I am in Listener")
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





