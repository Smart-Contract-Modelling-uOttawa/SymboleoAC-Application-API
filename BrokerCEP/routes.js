const express = require('express');
const router = express.Router();
const { getContract } = require('./gateway');

router.post('/trigger_paid', async (req, res) => {
  const { contractId, payer } = req.body;

  try {
    const contract = await getContract();
    await contract.submitTransaction('trigger_paid', contractId, payer);
    res.json({ success: true, message: 'Transaction submitted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
