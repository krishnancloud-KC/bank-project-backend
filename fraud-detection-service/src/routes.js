// src/routes.js
// Fraud Detection Service API routes

const express = require('express');
const router = express.Router();
const fraudEngine = require('./fraud-engine');
const bigQueryService = require('./bigquery-service');
const pubsubListener = require('./pubsub-listener');

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  const stats = pubsubListener.getStats();
  res.json({
    status: 'healthy',
    service: 'fraud-detection-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    pubsub: stats,
  });
});

// ============================================
// MANUAL FRAUD CHECK (testing కోసం)
// ============================================
router.post('/analyze', async (req, res) => {
  try {
    const transaction = req.body;

    // Required fields validate చేయి
    if (!transaction.transaction_id || !transaction.user_id || !transaction.amount) {
      return res.status(400).json({
        error: 'transaction_id, user_id, amount required',
      });
    }

    // Add timestamp if not provided
    if (!transaction.timestamp) {
      transaction.timestamp = new Date().toISOString();
    }

    // Fraud analysis
    const fraudResult = await fraudEngine.analyzeTransaction(transaction);

    // BigQuery లో save చేయి
    await bigQueryService.saveTransaction(transaction, fraudResult);

    // Fraud అయితే alert save చేయి
    if (fraudResult.is_fraud) {
      await bigQueryService.saveFraudAlert(transaction, fraudResult);
    }

    res.json({
      success: true,
      analysis: fraudResult,
      message: fraudResult.is_fraud
        ? '🚨 Fraud detected!'
        : '✅ Transaction is safe',
    });
  } catch (error) {
    console.error('❌ Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

// Fraud statistics (last N days)
router.get('/analytics/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await bigQueryService.getFraudStats(days);

    res.json({
      success: true,
      period_days: days,
      data: stats,
      summary: {
        total_records: stats.length,
        total_transactions: stats.reduce((sum, r) => sum + (parseInt(r.total_transactions) || 0), 0),
        total_frauds: stats.reduce((sum, r) => sum + (parseInt(r.fraud_transactions) || 0), 0),
        total_fraud_amount: stats.reduce((sum, r) => sum + (parseFloat(r.fraud_amount) || 0), 0),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Top fraud users
router.get('/analytics/top-fraud-users', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const users = await bigQueryService.getTopFraudUsers(limit);

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hourly fraud pattern
router.get('/analytics/hourly-pattern', async (req, res) => {
  try {
    const pattern = await bigQueryService.getHourlyPattern();

    res.json({
      success: true,
      data: pattern,
      insight: 'గంటవారీ fraud pattern - peak hours identify చేయవచ్చు',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ALERTS ENDPOINTS
// ============================================

// Recent unresolved alerts
router.get('/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const alerts = await bigQueryService.getRecentAlerts(limit);

    res.json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User transaction history
router.get('/users/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const days = parseInt(req.query.days) || 30;
    const history = await bigQueryService.getUserTransactionHistory(userId, days);

    res.json({
      success: true,
      user_id: userId,
      period_days: days,
      count: history.length,
      data: history,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUBSUB STATS
// ============================================
router.get('/pubsub/stats', (req, res) => {
  res.json({
    success: true,
    stats: pubsubListener.getStats(),
  });
});

// ============================================
// TEST ENDPOINT (demo data తో)
// ============================================
router.post('/test/simulate', async (req, res) => {
  try {
    const testTransactions = [
      {
        transaction_id: `TXN-TEST-${Date.now()}-1`,
        user_id: 'USER-TEST-001',
        amount: 500,
        transaction_type: 'TRANSFER',
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
        device_id: 'DEVICE-001',
      },
      {
        transaction_id: `TXN-TEST-${Date.now()}-2`,
        user_id: 'USER-TEST-002',
        amount: 250000, // Very high amount
        transaction_type: 'TRANSFER',
        status: 'SUCCESS',
        timestamp: new Date(new Date().setHours(3)).toISOString(), // 3 AM
        ip_address: '192.168.1.100',
      },
      {
        transaction_id: `TXN-TEST-${Date.now()}-3`,
        user_id: 'USER-TEST-003',
        amount: 100000, // Round amount, high value
        transaction_type: 'WITHDRAWAL',
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      },
    ];

    const results = await Promise.all(
      testTransactions.map(async (txn) => {
        const result = await fraudEngine.analyzeTransaction(txn);
        await bigQueryService.saveTransaction(txn, result);
        return { transaction: txn.transaction_id, ...result };
      })
    );

    res.json({
      success: true,
      message: '3 test transactions analyze చేయబడ్డాయి',
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
