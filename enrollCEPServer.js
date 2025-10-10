'use strict';

const fs = require('fs');
const path = require('path');
const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { buildCAClient, enrollAdmin } = require('./CAUtil');

const walletPath = path.join(__dirname, 'wallet');
const ccpPath = path.resolve(__dirname, '..', 'fabric-network-2.2.2',
    'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
const ORG_MSP = 'Org1MSP';

async function enrollCEPServer() {
    const caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    await enrollAdmin(caClient, wallet, ORG_MSP);

    const serverId = 'cep_bridge';
    const existing = await wallet.get(serverId);
    if (existing) {
        console.log(`ℹ️ CEP server already enrolled: ${serverId}`);
        return;
    }

    console.log(`🔑 Registering CEP server identity: ${serverId}`);

    const adminIdentity = await wallet.get('admin');
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    const secret = await caClient.register({
        affiliation: 'org1.department1',
        enrollmentID: serverId,
        attrs: [
            { name: 'HF.name', value: serverId, ecert: true },
            { name: 'HF.role', value: 'bridge', ecert: true }
        ],
        role: 'client',
        caname: 'ca-org1'
    }, adminUser);

    const enrollment = await caClient.enroll({
        enrollmentID: serverId,
        enrollmentSecret: secret
    });

    const certDir = path.join(__dirname, 'certs', 'cep');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

    fs.writeFileSync(path.join(certDir, 'cep_bridge.crt'), enrollment.certificate);
    fs.writeFileSync(path.join(certDir, 'cep_bridge.key'), enrollment.key.toBytes());

    const idData = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes()
        },
        mspId: ORG_MSP,
        type: 'X.509'
    };
    fs.writeFileSync(path.join(walletPath, `${serverId}.id`), JSON.stringify(idData, null, 2));

    console.log(`✅ CEP Bridge certificate and key written to certs/cep/`);
}

(async () => {
    try {
        await enrollCEPServer();
        console.log('🎉 CEP Bridge identity enrolled successfully');
    } catch (err) {
        console.error('❌ EnrollCEPServer error:', err);
    }
})();
