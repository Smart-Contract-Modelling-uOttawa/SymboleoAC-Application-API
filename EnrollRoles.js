'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const { Wallets, Gateway } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { buildCAClient, enrollAdmin, registerAndEnrollUser } = require('./CAUtil');

const app = express();
app.use(bodyParser.json());

const channelName = 'mychannel';
const chaincodeName = 'meatsale';
const walletPath = path.join(__dirname, 'wallet');
const ccpPath = path.resolve(__dirname, '..', 'fabric-network-2.2.2', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
const ORG_MSP = 'Org1MSP';

//parameters
const parametersObject = {
        buyerP: { warehouse: "70 Glouxter", name: "buyer name", org: "Canada Import Inc", dept: "finance" },
        sellerP: { returnAddress: "51 Riduea", name: "seller name", org: "Argentina Export Inc", dept: "finance" },
        transportCoP: { returnAddress: "60 Orleans", name: "transportCo name" },
        assessorP: { returnAddress: "11 copper", name: "assessor name" },
        regulatorP: { name: "regulator", org: "Canada Import Inc", dept: "finance" },
        storageP: { address: "55 Riduea" },
        shipperP: { name: "shipper name" },
        adminP: { name: "admin", org: "org1", dept: "finance" },
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
    };

    const parameters = JSON.stringify(parametersObject);

async function getContract(userId) {
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const identity = await wallet.get(userId);
    if (!identity) throw new Error(`Identity for ${userId} not found in wallet`);

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: userId,
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork(channelName);
    return { contract: network.getContract(chaincodeName), gateway };
}

async function storePolicy(userId) { 

    const { contract, gateway } = await getContract(userId);

    let contractId;
    try {
        console.log(`--> Submit Transaction: init`);
        const transaction = contract.createTransaction('init');
        let InitRes = await transaction.submit(parameters);
        InitRes = JSON.parse(InitRes.toString());
        console.log(`--> Init Response:`, InitRes);

        contractId = InitRes.contractId;
        if (!contractId) {
            throw new Error('❌ Contract ID not returned in init result');
        }
    } catch (createError) {
        console.error(`<-- Submit Failed: init - ${createError}`);
        throw new Error(`❌ Init failed: ${createError.message}`);
    }

    try {
       

        // Call storeRolesPolicy
        const result = await contract.submitTransaction(
            'storeRolesPolicy',
            contractId
        );

        
        return JSON.parse(result.toString());
    } catch (err) {
        console.error(err);
      
        throw new Error(`❌ Failed to store roles policy: ${err.message}`);
    }
}


async function bootstrapUsersFromPolicy(userId, affiliation) {
    const { contract, gateway } = await getContract(userId);

    let contractId;
    try {
        console.log(`--> Submit Transaction: init`);
        const transaction = contract.createTransaction('init');
        let InitRes = await transaction.submit(parameters);
        InitRes = JSON.parse(InitRes.toString());
        console.log(`--> Init Response:`, InitRes);

        contractId = InitRes.contractId;
        if (!contractId) {
            throw new Error('❌ Contract ID not returned in init result');
        }
    } catch (createError) {
        console.error(`<-- Submit Failed: init - ${createError}`);
        throw new Error(`❌ Init failed: ${createError.message}`);
    }


    const policyBytes = await contract.evaluateTransaction('getRolePolicy',contractId);
    //await gateway.disconnect();

    const record = JSON.parse(policyBytes.toString());
    console.log("record")
    console.log(record)
    
    const { policy, hash } = record.policyRecord;

    const policyStr = JSON.stringify(policy);

    const computedHash = crypto.createHash('sha256').update(policyStr).digest('hex');
    if (computedHash !== hash) {
        throw new Error('Policy tampering detected (hash mismatch)');
    }

    const roles = policy.roles;
    if (!Array.isArray(roles) || roles.length === 0) {
        throw new Error('No roles found in ACPolicyRecord');
    }

    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');

    const results = [];
    for (const role of roles) {
        const uid = `${role.name}_${role.type}`;
        try {
            await registerAndEnrollUser(caClient, wallet, ORG_MSP, uid, affiliation, role);
            results.push({ userId: uid, status: '✅ enrolled' });
        } catch (err) {
            results.push({ userId: uid, status: `❌ failed: ${err.message}` });
        }
    }

    return { message: 'Bootstrap completed', results };
}

(async () => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        const caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');

        await enrollAdmin(caClient, wallet, ORG_MSP);

        //loaded keys 
        const regulatorIdentity = await wallet.get('Regulator2');
        
        if (!regulatorIdentity || !regulatorIdentity.credentials) {
            throw new Error('No valid credentials found in wallet for "regulator"');
        }
        
        const regulatorKey = regulatorIdentity.credentials.privateKey;
        const regulatorPub = regulatorIdentity.credentials.certificate; // This is the public certificate

        const policyResult = await storePolicy('Regulator2'); //, regulatorKey, regulatorPub
        console.log('✅ Policy stored:', policyResult);

        const bootstrapResult = await bootstrapUsersFromPolicy('Regulator2', 'org1.department1');
        console.log('✅ Users bootstrapped:', bootstrapResult);
    } catch (err) {
        console.error('❌ Startup error:', err);
    }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API listening on port ${PORT}`));
