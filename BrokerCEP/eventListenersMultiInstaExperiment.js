const { getContract } = require('./gateway');
const { publish } = require('./rabbitMQ-Publish');
const { getRuleDetailsBySensorId } = require('./utilMultiInstaExperiment');
const fs = require("fs");
const path = require("path");

async function startEventListeners() {

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


// Loop through contractIds ONLY
for (const contractId of contractIds) {

  //console.log("I am inside Event Listeners")
  const {chaincodeFunction, chaincodeName} = await getRuleDetailsBySensorId("",false, `rules${contractId}.json`)
  const contract = await getContract(chaincodeName, true);

  // General-purpose listener
  const listener = async (event) => {
    try {
      //console.log("I am in Listener")
      const payload = event.payload?.toString();
      const message = JSON.parse(payload);

      console.log(`📡 Notification event received: ${event.eventName} - ${payload}`);

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
  }//for
}

module.exports = { startEventListeners };





