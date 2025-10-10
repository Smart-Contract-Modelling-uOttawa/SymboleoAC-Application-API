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

async function enrollRabbitMQ() {
    const caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Ensure admin is enrolled
    await enrollAdmin(caClient, wallet, ORG_MSP);

    const serverId = 'rabbitmq-server';
    const existing = await wallet.get(serverId);
    if (existing) {
        console.log(`ℹ️ RabbitMQ server already enrolled: ${serverId}`);
        return;
    }

    console.log(`🔑 Registering RabbitMQ server identity: ${serverId}`);

    // Admin identity
    const adminIdentity = await wallet.get('admin');
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    // Register RabbitMQ server
    const secret = await caClient.register({
        affiliation: 'org1.department1',
        enrollmentID: serverId,
        attrs: [
            { name: 'HF.name', value: serverId, ecert: true },
            { name: 'HF.role', value: 'server', ecert: true }
        ],
        role: 'client',
        caname: 'ca-org1'
    }, adminUser);

    const enrollment = await caClient.enroll({
        enrollmentID: serverId,
        enrollmentSecret: secret
    });

    // Save as PEM files for RabbitMQ
    const certPath = path.join(__dirname, 'certs');
    if (!fs.existsSync(certPath)) fs.mkdirSync(certPath);

    fs.writeFileSync(path.join(certPath, 'rabbitmq-server.crt'), enrollment.certificate);
    fs.writeFileSync(path.join(certPath, 'rabbitmq-server.key'), enrollment.key.toBytes());

    console.log(`✅ RabbitMQ server cert+key written to certs/`);
}

(async () => {
    try {
        await enrollRabbitMQ();
        console.log('🎉 RabbitMQ server identity enrolled');
    } catch (err) {
        console.error('❌ EnrollRabbitMQ error:', err);
    }
})();
