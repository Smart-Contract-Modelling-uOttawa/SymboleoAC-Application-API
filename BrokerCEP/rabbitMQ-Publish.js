const amqp = require('amqplib');

const exchangeName = 'eventExchange';

module.exports.publish = async (message, roles) => {
  try {
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertExchange(exchangeName, 'direct', { durable: false });

    const stringMessage = typeof message === 'string' ? message : JSON.stringify(message);

    // we use the name of the role not the type to distinguish different names of the same type. such as org1 is a buyer
    //and transportation organazation is a buyer as well
    for (const role of roles) {
      console.log("role:", role);
      const roleName = String(role || '').toLowerCase().trim();

      if (!roleName) {
        console.warn('⚠️ Skipping empty or malformed role:', role);
        continue;
      }

      const routingKey = `role.${roleName}`;
      channel.publish(exchangeName, routingKey, Buffer.from(stringMessage));
      console.log(`📤 Sent: "${stringMessage}" to role: ${role}`);
    }

    await channel.close();
    await connection.close();
  } catch (error) {
    console.error('Publisher error:', error.message);
  }
};
