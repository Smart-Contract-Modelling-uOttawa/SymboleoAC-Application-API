'use strict';

const fs = require('fs');
const path = require('path');
const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { buildCAClient, enrollAdmin } = require('./CAUtil');

// Paths
const walletPath = path.join(__dirname, 'wallet');
const rulesPath = path.join(__dirname, 'BrokerCEP', 'CEP', 'rules.json');
const ccpPath = path.resolve(__dirname, '..', 'fabric-network-2.2.2',
    'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
const ORG_MSP = 'Org1MSP';

async function enrollSensorsFromRules() {
    const caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Ensure admin is enrolled
    await enrollAdmin(caClient, wallet, ORG_MSP);

    // Load rules.json
    const rulesConfig = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    const rules = rulesConfig.rules;
    if (!rules || rules.length === 0) {
        throw new Error('❌ No rules found in rules.json');
    }

    for (const rule of rules) {
        const sensorType = rule.sensorType;
        // Build unique sensorId per contract & type
        const sensorId = `${sensorType}_sensor_${rule.id}`;

        // Already enrolled?
        const existing = await wallet.get(sensorId);
        if (existing) {
            console.log(`ℹ️ Sensor already enrolled: ${sensorId}`);
            //rule.sensorId = sensorId; // update rule
            continue;
        }

        console.log(`🔑 Registering sensor ${sensorId} ...`);

            // Load admin identity
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            throw new Error('❌ Admin identity not found in wallet. Run enrollAdmin first.');
        }

        // Build registrar User object
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register sensor with CA
        const secret = await caClient.register({
            affiliation: 'org1.department1',
            enrollmentID: sensorId,
            attrs: [
                { name: 'HF.name', value: sensorId, ecert: true },
                { name: 'HF.role', value: 'sensor', ecert: true },
                { name: 'sensorType', value: sensorType, ecert: true }
            ],
            role: 'client',
            caname: 'ca-org1'
        }, adminUser);

        const enrollment = await caClient.enroll({
            enrollmentID: sensorId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes()
            },
            mspId: ORG_MSP,
            type: 'X.509',
            version: 1
        };

        // Save as .id file (Fabric wallet format)
        const identityPath = path.join(walletPath, `${sensorId}.id`);
        fs.writeFileSync(identityPath, JSON.stringify(x509Identity, null, 2));
        console.log(`✅ Sensor identity stored: ${identityPath}`);

        // Update rule with actual sensorId
        //rule.sensorId = sensorId;
    }

}

// Run
(async () => {
    try {
        await enrollSensorsFromRules();
        console.log('🎉 All sensors enrolled in the wallet');
    } catch (err) {
        console.error('❌ EnrollSensors error:', err);
    }
})();
