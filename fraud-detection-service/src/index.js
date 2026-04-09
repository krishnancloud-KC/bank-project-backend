require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'fraud-detection-service',
    version: '1.0.0',
    status: 'running',
    project: process.env.PROJECT_ID || 'bank-project-solutions',
    endpoints: {
      health:   'GET /api/fraud/health',
      analyze:  'POST /api/fraud/analyze',
      simulate: 'POST /api/fraud/test/simulate',
      stats:    'GET /api/fraud/analytics/stats',
      alerts:   'GET /api/fraud/alerts',
    },
    timestamp: new Date().toISOString(),
  });
});

// Health
app.get('/api/fraud/health', (req, res) => {
  res.json({ status: 'healthy', service: 'fraud-detection-service' });
});

// Fraud analyze
app.post('/api/fraud/analyze', async (req, res) => {
  try {
    const { transaction_id, user_id, amount } = req.body;
    if (!transaction_id || !user_id || !amount) {
      return res.status(400).json({ error: 'transaction_id, user_id, amount required' });
    }

    // Simple fraud rules
    const reasons = [];
    let score = 0;

    if (amount >= 200000) { score += 35; reasons.push('చాలా పెద్ద amount'); }
    else if (amount >= 50000) { score += 20; reasons.push('పెద్ద amount'); }

    const hour = new Date().getHours();
    if (hour >= 1 && hour < 5) { score += 25; reasons.push('అసాధారణ సమయం'); }

    if (amount > 10000 && amount % 10000 === 0) { score += 10; reasons.push('Round amount'); }

    const isFraud = score >= 60;
    const severity = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 40 ? 'MEDIUM' : score >= 20 ? 'LOW' : 'SAFE';

    res.json({
      success: true,
      analysis: { transaction_id, user_id, fraud_score: score, is_fraud: isFraud, severity, fraud_reasons: reasons },
      message: isFraud ? 'Fraud detected!' : 'Transaction is safe',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test simulate
app.post('/api/fraud/test/simulate', async (req, res) => {
  res.json({
    success: true,
    message: '3 test transactions analyzed',
    results: [
      { transaction_id: 'TXN-TEST-1', fraud_score: 0, severity: 'SAFE', is_fraud: false },
      { transaction_id: 'TXN-TEST-2', fraud_score: 60, severity: 'HIGH', is_fraud: true },
      { transaction_id: 'TXN-TEST-3', fraud_score: 30, severity: 'LOW', is_fraud: false },
    ],
  });
});

// Stats
app.get('/api/fraud/analytics/stats', (req, res) => {
  res.json({ success: true, message: 'BigQuery stats - coming soon', data: [] });
});

// Alerts
app.get('/api/fraud/alerts', (req, res) => {
  res.json({ success: true, count: 0, data: [] });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fraud Detection Service running on port ${PORT}`);
});