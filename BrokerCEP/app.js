const express = require('express');
const app = express();

const routes = require('./routes');
const { startEventListeners } = require('./eventListeners');
const { startPerRoleSubscribers } = require('./roleSubscriber');
const { getContract } = require('./gateway');


app.use(express.json());
app.use('/api', routes);

// Listen to smart contract events and publish to RabbitMQ
startEventListeners();     // Fabric event → RabbitMQ
(async () => {
  const contract = await getContract();

  const parametersObject = {
    buyerP: { warehouse: "70 Glouxter", name: "buyer name", org: "Canada Import Inc", dept: "finance" },
    sellerP: { returnAddress: "51 Riduea", name: "seller name", org: "Argentina Export Inc", dept: "finance" },
    transportCoP: { returnAddress: "60 Orleans", name: "transportCo name" },
    assessorP: { returnAddress: "11 copper", name: "assessor name" },
    regulatorP: { name: "Hassan", org: "Canada Import Inc", dept: "finance" },
    storageP: { address: "55 Riduea"},
    shipperP: { name: "shipper name" },
    adminP: { name: "admin", org: "org1", dept: "finance" },
    barcodeP: {},
    qnt: 2,
    qlt: 3,
    amt: 3,
    curr: 1,
    payDueDate: "2025-10-28T17:49:41.422Z",
    delAdd: "delAdd",
    effDate: "2025-08-28T17:49:41.422Z",
    delDueDateDays: 3,
    interestRate: 2
  };

  const parameters = JSON.stringify(parametersObject);

  try {
    console.log(`--> Submit Transaction: init`);
    const initTxn = contract.createTransaction('init');
    let InitRes = await initTxn.submit(parameters);
    InitRes = JSON.parse(InitRes.toString());
    console.log(`✅ Init successful: ${InitRes.contractId}`);

    console.log(`--> trigger_paid`);
    const paidTxn = contract.createTransaction('trigger_paid');
    let paidRes = await paidTxn.submit(JSON.stringify({ contractId: InitRes.contractId, event: {} }));
    paidRes = JSON.parse(paidRes.toString());
    console.log(`✅ trigger_paid result:`, paidRes);

    console.log(`--> violateObligation_payment`);
    const violateTxn = contract.createTransaction('violateObligation_payment');
    let violateRes = await violateTxn.submit(InitRes.contractId);
    violateRes = JSON.parse(violateRes.toString());
    console.log(`✅ violateObligation_payment result:`, violateRes);

  } catch (err) {
    console.error(`❌ Error submitting transactions: ${err.message}`);
  }
})();

// Listen to RabbitMQ messages by role
startPerRoleSubscribers();     // RabbitMQ → Console (or UI, DB, etc.)

app.listen(3000, () => {
  console.log('🚀 Node.js app running on port 3000');
});
