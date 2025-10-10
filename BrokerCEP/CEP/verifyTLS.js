// verifyTLS.js
const tls = require('tls');
const fs = require('fs');

const ca = fs.readFileSync('/Users/sfuhaid/RunBlockchain/fabric-network-2.2.2/organizations/fabric-ca/org1/ca-cert.pem');
const cert = fs.readFileSync('/tmp/humidity-cert.pem');
const key = fs.readFileSync('/tmp/humidity-key.pem');

const options = {
  host: 'rabbitmq-server',
  port: 5671,
  ca: [ca],
  cert,
  key,
  servername: 'rabbitmq-server',
  rejectUnauthorized: true
};

const socket = tls.connect(options, () => {
  console.log('✅ TLS handshake succeeded');
  console.log('Authorized:', socket.authorized);
  socket.end();
});

socket.on('error', (err) => {
  console.error('❌ TLS handshake failed:', err.message);
});
