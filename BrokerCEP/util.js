'use strict';

const fs = require('fs');
const path = require('path');

// === Helper: Get contract id from rules.json  ===
  async function getRuleDetailsBySensorId(sensorId) {
    // Read and parse rules.json
    //const data = fs.readFileSync('../rules.json', 'utf8');
    // Build absolute path to rules.json inside CEP folder
    const rulesPath = path.resolve(__dirname, 'CEP', 'rules.json');
    const data = fs.readFileSync(rulesPath, 'utf8')
    const rulesConfig = JSON.parse(data);

    // Find the rule with the matching sensorId
    const rule = rulesConfig.rules.find(r => r.sensorId === sensorId);

    if (!rule) {
      console.log(`❌ No rule found for sensorId: ${sensorId}`);
      return null;
    }

    // Return the relevant fields
    const { contractId, chaincodeFunction, chaincodeName } = rule;
    return { contractId, chaincodeFunction, chaincodeName };
            
    }

    module.exports = {
    getRuleDetailsBySensorId
    };