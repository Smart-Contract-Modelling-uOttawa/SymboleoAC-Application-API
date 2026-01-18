// appAlert.js
// Test IoT data stream with smart contract, IoT, CEP and broker
const express = require('express');
const app = express();

const routes = require('./routes');
const { startEventListeners } = require('./eventListeners');
const { startPerRoleSubscribers } = require('./roleSubscriber');
const { getRuleDetailsBySensorId } = require('./util');
const { getContract } = require('./gateway');


app.use(express.json());
app.use('/api', routes);

// === Start listeners ===
startEventListeners();
startPerRoleSubscribers();

/**
 * Execute a transaction on the smart contract.
 * - Calls "init" first
 * - Then calls the provided transaction name
 * @param {string} alert - the exact name of the chaincode transaction to execute
 */
let cachedContractId = null;
let txnName = null;
async function executeTransaction(alert) {
  
  try {
     // parsing
      const {sensorId, avgValue, sensorTime, alertTime} = parseAlret(alert);
      console.log(sensorId,avgValue, sensorTime, alertTime)

      // Get contract id from rules.json to send alret event back to smart contract
      const { contractId, chaincodeFunction, chaincodeName} = await getRuleDetailsBySensorId(sensorId,true)
      //console.log("contractId, txnName, chaincodeName")
      //console.log(contractId, chaincodeFunction, chaincodeName)
      txnName = chaincodeFunction;
    
    const contract = await getContract(chaincodeName, true);

    //console.log("cachedContractId: " + cachedContractId);


    // 1️⃣ Initialize contract only once
    let res = null;
    while (cachedContractId == null) {

    //if (cachedContractId == null && chaincodeName != undefined ) {
    console.log(`--> Submitting transaction: init`);
    //parameters meatsale
    /*
    const initParams = JSON.stringify({
        buyerP: { warehouse: "70 Glouxter", name: "buyer name", org: "Canada Import Inc", dept: "finance" },
        sellerP: { returnAddress: "51 Riduea", name: "seller name", org: "Argentina Export Inc", dept: "finance" },
        transportCoP: { returnAddress: "60 Orleans", name: "transportCo name", org: "Argentina Export Inc", dept: "finance"},
        assessorP: { returnAddress: "11 copper", name: "assessor name", org: "Food Inspection Agency", dept: "finance" },
        regulatorP: { name: "regulator", org: "Canada Import Inc", dept: "finance" },
        storageP: { address: "55 Riduea", name:"John", org: "Canada Import Inc", dept: "finance"},
        shipperP: { name: "shipper name", org: "Argentina Export Inc", dept: "finance" },
        adminP: { name: "admin", org: "org1", dept: "finance", org: "Blockcahin", dept: "finance"},
        barcodeP: {},
        qnt: 2,
        qlt: 3,
        amt: 3,
        curr: 1,
        payDueDate: "2024-10-28T17:49:41.422Z",
        delAdd: "delAdd",
        effDate: "2026-08-28T17:49:41.422Z",
        delDueDateDays: 3,
        interestRate: 2
    });*/

     //parameters vaccine
     const initParams = JSON.stringify({
      "pfizerP":  {name:"pfizer", org:"pfizer Company", dept: "finance"},
      "mcdcP":  {name:"mcdc", org:"Government of Canada", dept: "finance"},
      "regulatorP": {name: "regulator", org: "Canada Import Inc", dept: "finance"},
      "adminP": {name: "admin", org: "org1", dept: "finance"},
      "fdaP": {name:"fda", org:"FDA", dept: "finance"},
      "worldcourierP":{name:"worldcourier", org:"worldcourier Company", dept: "finance"},
      "approval": true,
      "unitPrice": 19.50,
       "minQuantity": 100,
       "maxQuantity" : 500,
       "temperature":-80
      });

    const initTxn = contract.createTransaction('init');
    let initRes = await initTxn.submit(initParams);
    initRes = JSON.parse(initRes.toString());
    cachedContractId = initRes.contractId; // ✅ store for reuse
    console.log(`✅ Init successful: ${initRes.contractId}`);

  //}if
}


    // 2️⃣ Call the provided transaction name
    console.log(`--> Submitting transaction: ${txnName}`);
    

    // For most transactions, pass the contractId as parameter
    res = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      
  try {
    // Create a fresh transaction on each retry
    const txn = contract.createTransaction(txnName);
   res = await txn.submit(JSON.stringify({ contractId: cachedContractId, event: {sensorId: sensorId, value: avgValue, sensorTimestamp: sensorTime} }));

   break; // ✅ success, exit retry loop
    //return res;
  } catch (err) {
    if (err.message.includes('MVCC_READ_CONFLICT') && attempt < 3) {
      console.warn(`⚠️ Retry ${attempt}/3 due to MVCC conflict`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    throw err;
  }
}
    //const txnResponse = await txn.submit(JSON.stringify({ contractId: cachedContractId, event: {} }));
    const result = JSON.parse(res.toString());

    console.log(`✅ Transaction "${txnName}" successful:`, result);
    return result;
  } catch (err) {
    console.error(`❌ Error executing transaction "${txnName}": ${err.message}`);
    throw err;
  }
}

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
        //console.log('✅ Extracted sensorId:', sensorId);
      } else {
        console.log('❌ sensorId not found in alert');
      }
      // Use regex to find value=...
       const match2 = alert.raw.match(/avgValue=([^\s,}]+)/);

      if (match2) {
        avgValue = match2[1];
        //console.log('✅ Extracted avgValue:', avgValue);
      } else {
        console.log('❌ avgValue not found in alert');
      }

      // Use regex to find sensorTime=...
      const match3 = alert.raw.match(/sensorTimestamp=([^\s,}]+)/);

      if (match3) {
        sensorTime = match3[1];
        //console.log('✅ Extracted sensorTime:', sensorTime);
      } else {
        console.log('❌ sensorTime not found in alert');
      }

      // Use regex to find alertTime=...
      const match4 = alert.raw.match(/alertTimestamp=([^\s,}]+)/);

      if (match4) {
        alertTime = match4[1];
        //console.log('✅ Extracted alertTime:', alertTime);
      } else {
        console.log('❌ alertTime not found in alert');
      }

      return { sensorId, avgValue, sensorTime, alertTime};

    }

// === Export function for external modules ===
module.exports = { app, executeTransaction };

// === Start Express app only when running standalone ===
if (require.main === module) {
  app.listen(3000, () => {
    console.log('🚀 Node.js app running on port 3000');
  });
}
