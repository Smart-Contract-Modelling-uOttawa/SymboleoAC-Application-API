// Test Notification 
// Test Two senarios 1) Scenario: payment is violated 2) delivery is violated

const express = require('express');
const app = express();

const routes = require('./routes');
const { startEventListeners } = require('./eventListenersMultiInstaExperiment');
const { startPerRoleSubscribers } = require('./roleSubscriberMultiInstaExperiment');
const { getContract } = require('./gateway');
const { getRuleDetailsBySensorId } = require('./utilMultiInstaExperiment');
const { getContractAs } = require('./gateway');



app.use(express.json());
app.use('/api', routes);

// Listen to smart contract events and publish to RabbitMQ
startEventListeners();     // Fabric event → RabbitMQ
(async () => {
  const { contractId, chaincodeFunction, chaincodeName} = await getRuleDetailsBySensorId("",false, 'rules.json')
  //const contract = await getContract(chaincodeName, true);
  const regulatorContract    = await getContractAs(chaincodeName, 'Regulator2', true);
  const buyerContract    = await getContractAs(chaincodeName, 'buyer_Buyer', true);
  const sellerContract   = await getContractAs(chaincodeName, 'seller_Seller', true);
  const assessorContract = await getContractAs(chaincodeName, 'assessor_Assessor', true);

  //const contract = await getContract();
  //parameters meatsale
  /*
  const parametersObject = {
         buyerP: { warehouse: "70 Glouxter", name: "buyer name", org: "Canada Import Inc", dept: "finance" },
        sellerP: { returnAddress: "51 Riduea", name: "seller name", org: "Argentina Export Inc", dept: "finance" },
        transportCoP: { returnAddress: "60 Orleans", name: "transportCo name", org: "Argentina Export Inc", dept: "finance"},
        assessorP: { returnAddress: "11 copper", name: "assessor name", org: "Food Inspection Agency", dept: "finance" },
        regulatorP: { name: "regulator", org: "Canada Import Inc", dept: "finance" },
        storageP: { address: "55 Riduea", name:"John", org: "Canada Import Inc", dept: "finance"},
        shipperP: { name: "shipper name", org: "Argentina Export Inc", dept: "finance" },
        adminP: { name: "admin", org: "org1", dept: "finance"},
        barcodeP: {},
        qnt: 2,
        qlt: 3,
        amt: 3,
        curr: 1,
        payDueDate: "2024-10-28T17:49:41.422Z",
        delAdd: "70 Glouxter",
        effDate: "2025-08-28T17:49:41.422Z",
        delDueDateDays: 3,
        interestRate: 2
    };*/

    //parameters vaccine
     const parametersObject = {
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
      }

  const parameters = JSON.stringify(parametersObject);

  try {
    /* we close it for multi instance and the contract is still opened beacuse we called init in appAlertMulti....
    console.log(`--> Submit Transaction: init`);
    const initTxn = regulatorContract.createTransaction('init');
    let InitRes = await initTxn.submit(parameters);
    InitRes = JSON.parse(InitRes.toString());
    console.log(`✅ Init successful: ${InitRes.contractId}`);
    */
   /*
    console.log(`--> trigger_paid`);
    const paidTxn = buyerContract.createTransaction('trigger_paid');
    // this should be called by buyer_Buyer
    let paidRes = await paidTxn.submit(JSON.stringify({ contractId: InitRes.contractId, event: {} }));
    paidRes = JSON.parse(paidRes.toString());
    console.log(`✅ trigger_paid result:`, paidRes);

    console.log(`--> trigger_unLoaded`);
    const loadTxn = assessorContract.createTransaction('trigger_unLoaded');
    // this should be called by assessor_Assessor
    let loadRes = await loadTxn.submit(JSON.stringify({ contractId: InitRes.contractId, event: {} }));
    loadRes = JSON.parse(loadRes.toString());
    console.log(`✅ trigger_unLoaded result:`, loadRes);

    console.log(`--> violateObligation_payment`);
    const violateTxn = buyerContract.createTransaction('violateObligation_payment');
    // this should be called by buyer_Buyer
    let violateRes = await violateTxn.submit(InitRes.contractId);
    violateRes = JSON.parse(violateRes.toString());
    console.log(`✅ violateObligation_payment result:`, violateRes);

     console.log(`--> violateObligation_delivery`);
    const violateTxnDel = sellerContract.createTransaction('violateObligation_delivery');
    // this should be called by seller_Seller
    let violateResDel = await violateTxnDel.submit(InitRes.contractId);
    violateResDel = JSON.parse(violateResDel.toString());
    console.log(`✅ violateObligation_delivery result:`, violateResDel);
    */

  } catch (err) {
    console.error(`❌ Error submitting transactions: ${err.message}`);
  }
})();

// Listen to RabbitMQ messages by role
startPerRoleSubscribers();     // RabbitMQ → Console (or UI, DB, etc.)

app.listen(3000, () => {
  console.log('🚀 Node.js app running on port 3000');
});
