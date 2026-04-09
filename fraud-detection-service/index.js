// index.js - Transaction Service (Fixed)
require('dotenv').config();
const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const { PubSub } = require('@google-cloud/pubsub');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const firestore = new Firestore({ projectId: process.env.PROJECT_ID });
const pubsub = new PubSub({ projectId: process.env.PROJECT_ID });

// ✅ ROOT ROUTE - FIX
app.get('/', (req, res) => {
  res.json({
    service: 'transaction-service',
    version: '1.0.0',
    status: 'running',
    project: process.env.PROJECT_ID || 'bank-project-solutions',
    endpoints: {
      health:      'GET  /health',
      create:      'POST /transactions',
      getById:     'GET  /transactions/:id',
      userHistory: 'GET  /transactions/user/:userId',
    },
    timestamp: new Date().toISOString(),
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'transaction-service' });
});

// Create Transaction
app.post('/transactions', async (req, res) => {
  try {
    const { user_id, amount, transaction_type, description } = req.body;

    if (!user_id || !amount || !transaction_type) {
      return res.status(400).json({ error: 'user_id, amount, transaction_type required' });
    }

    const transaction = {
      transaction_id: `TXN-${uuidv4()}`,
      user_id,
      amount: parseFloat(amount),
      transaction_type,
      description: description || '',
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    // Firestore లో save చేయి
    await firestore
      .collection('transactions')
      .doc(transaction.transaction_id)
      .set(transaction);

    // Pub/Sub కి publish చేయి
    try {
      const topic = pubsub.topic('transaction-events');
      await topic.publishMessage({ data: Buffer.from(JSON.stringify(transaction)) });
    } catch (pubsubErr) {
      console.warn('⚠️ Pub/Sub publish failed:', pubsubErr.message);
    }

    res.status(201).json({ success: true, transaction });
  } catch (error) {
    console.error('❌ Create transaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Transaction by ID
app.get('/transactions/:id', async (req, res) => {
  try {
    const doc = await firestore.collection('transactions').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true, transaction: doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User Transactions
app.get('/transactions/user/:userId', async (req, res) => {
  try {
    const snapshot = await firestore
      .collection('transactions')
      .where('user_id', '==', req.params.userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();

    const transactions = snapshot.docs.map(doc => doc.data());
    res.json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Transaction Service running on port ${PORT}`);
});
