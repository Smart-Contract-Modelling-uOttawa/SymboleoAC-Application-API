'use strict';

process.env.HFC_LOGGING = '{"debug": "./debug.log"}';

const { Gateway, Wallets } = require('fabric-network');
const EventStrategies = require('fabric-network/lib/impl/event/defaulteventhandlerstrategies');
const path = require('path');
const fs = require('fs');
const forge = require('node-forge');

const { buildCCPOrg1, buildWallet } = require('../AppUtil');

const channelName = 'mychannel';
//you have to change 'meatsale' to the name of the chaincodeName in the package.json property name e.g., name:'meatsale', name:'vaccine', etc
//const chaincodeName = 'meatsale'; 
const Org1UserId = 'buyer_Buyer'; // Replace this dynamically if needed

let cachedContract = null;
let cachedGateway = null;

async function getContract(chaincodeName, useCommitEvents = true) {
  console.log("chaincodeName-----------------")
  console.log(chaincodeName)
  if (chaincodeName == undefined) return null;
  if (cachedContract) return cachedContract;

  try {
    const ccpOrg1 = buildCCPOrg1();
    const walletPath = path.join(__dirname, '../wallet');
    const wallet = await buildWallet(Wallets, walletPath);

    const gateway = new Gateway();
    const connectOptions = {
      wallet,
      identity: Org1UserId,
      discovery: { enabled: true, asLocalhost: true },
    };

    if (!useCommitEvents) {
      connectOptions.eventHandlerOptions = EventStrategies.NONE;
    }

    await gateway.connect(ccpOrg1, connectOptions);

    const network = await gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    // Cache for reuse
    cachedContract = contract;
    cachedGateway = gateway;

    console.log(`Gateway connected. Contract '${chaincodeName}' loaded on channel '${channelName}'.`);
    return contract;
  } catch (err) {
    console.error('Failed to initialize Gateway or Contract:', err);
    process.exit(1);
  }
}

async function getUserHFNameFromWallet() {
  const walletPath = path.join(__dirname, '../wallet');
  const wallet = await buildWallet(Wallets, walletPath);

  const identity = await wallet.get(Org1UserId);
  if (!identity || !identity.credentials || !identity.credentials.certificate) {
    throw new Error(`❌ No identity or certificate found for '${Org1UserId}'`);
  }

  const certPem = identity.credentials.certificate;

  // Parse certificate without accessing the public key
  let cert;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch (err) {
    throw new Error(`❌ Failed to parse certificate: ${err.message}`);
  }

  let hfName = null;

  try {
    for (const ext of cert.extensions || []) {
      if (ext.name === 'subjectAlternativeName' && Array.isArray(ext.altNames)) {
        for (const altName of ext.altNames) {
          if (altName.type === 0 && typeof altName.value === 'string' && altName.value.includes('HF.name=')) {
            const match = altName.value.match(/HF\.name=([^,]+)/);
            if (match) {
              hfName = match[1];
              break;
            }
          }
        }
      }
      if (hfName) break;
    }
  } catch (err) {
    throw new Error(`❌ Error parsing extensions: ${err.message}`);
  }

  if (!hfName) {
    throw new Error('❌ HF.name not found in certificate extensions.');
  }

  return hfName;
}


async function disconnectGateway() {
  if (cachedGateway) {
    console.log('🔌 Disconnecting Gateway...');
    cachedGateway.disconnect();
    cachedContract = null;
    cachedGateway = null;
  }
}

module.exports = {
  getContract,
  disconnectGateway,
  getUserHFNameFromWallet,
};

/*const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

let contract; // cache

async function getContract() {
  if (contract) return contract;

  const ccpPath = path.resolve(__dirname, 'connection-org1.json');
  const ccp = JSON.parse(fs.readFileSync(ccpPath));
  const wallet = await Wallets.newFileSystemWallet(path.join(__dirname, '../wallet'));

  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: 'Org1UserId',
    discovery: { enabled: true, asLocalhost: true }
  });

  const network = await gateway.getNetwork('mychannel');
  contract = network.getContract('meatsale');
  return contract;
}

module.exports = { getContract };
*/