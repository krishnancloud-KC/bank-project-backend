// src/fraud-engine.js
// Rule-based Fraud Detection Engine
// Real ML model కి బదులు smart rules వాడతాం

const { bigquery, DATASET_ID } = require('./bigquery-setup');

class FraudDetectionEngine {
  constructor() {
    // Fraud detection thresholds
    this.thresholds = {
      highAmount: 50000,        // ₹50,000 పైన అయితే suspicious
      veryHighAmount: 200000,   // ₹2,00,000 పైన అయితే high risk
      rapidTransactions: 5,     // 10 నిమిషాల్లో 5+ transactions
      rapidTimeWindow: 10 * 60, // 10 minutes in seconds
      unusualHourStart: 1,      // 1 AM - 5 AM unusual hours
      unusualHourEnd: 5,
      maxDailyAmount: 500000,   // ₹5,00,000 daily limit
    };
  }

  // Main fraud analysis function
  async analyzeTransaction(transaction) {
    const reasons = [];
    let fraudScore = 0;

    console.log(`🔍 Analyzing transaction: ${transaction.transaction_id}`);

    // Rule 1: High Amount Check
    const amountScore = this.checkAmount(transaction.amount, reasons);
    fraudScore += amountScore;

    // Rule 2: Unusual Time Check
    const timeScore = this.checkUnusualTime(transaction.timestamp, reasons);
    fraudScore += timeScore;

    // Rule 3: Rapid Transactions Check (BigQuery query)
    try {
      const rapidScore = await this.checkRapidTransactions(transaction, reasons);
      fraudScore += rapidScore;
    } catch (err) {
      console.warn('⚠️  Rapid transaction check failed:', err.message);
    }

    // Rule 4: Daily Limit Check (BigQuery query)
    try {
      const dailyScore = await this.checkDailyLimit(transaction, reasons);
      fraudScore += dailyScore;
    } catch (err) {
      console.warn('⚠️  Daily limit check failed:', err.message);
    }

    // Rule 5: Round Amount Check (often indicates automated fraud)
    const roundScore = this.checkRoundAmount(transaction.amount, reasons);
    fraudScore += roundScore;

    // Rule 6: New Device + High Amount
    const deviceScore = this.checkDeviceRisk(transaction, reasons);
    fraudScore += deviceScore;

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, Math.round(fraudScore));

    // Determine severity
    const severity = this.getSeverity(normalizedScore);
    const isFraud = normalizedScore >= 60;

    const result = {
      transaction_id: transaction.transaction_id,
      user_id: transaction.user_id,
      fraud_score: normalizedScore,
      is_fraud: isFraud,
      fraud_reasons: reasons,
      severity,
      analyzed_at: new Date().toISOString(),
    };

    console.log(`📊 Fraud Analysis Result:`, {
      score: normalizedScore,
      severity,
      isFraud,
      reasons: reasons.length,
    });

    return result;
  }

  // Rule 1: Amount check
  checkAmount(amount, reasons) {
    if (amount >= this.thresholds.veryHighAmount) {
      reasons.push(`చాలా పెద్ద amount: ₹${amount.toLocaleString('en-IN')}`);
      return 35;
    } else if (amount >= this.thresholds.highAmount) {
      reasons.push(`పెద్ద amount: ₹${amount.toLocaleString('en-IN')}`);
      return 20;
    }
    return 0;
  }

  // Rule 2: Unusual time check
  checkUnusualTime(timestamp, reasons) {
    const hour = new Date(timestamp).getHours();
    if (hour >= this.thresholds.unusualHourStart && hour < this.thresholds.unusualHourEnd) {
      reasons.push(`అసాధారణ సమయంలో transaction: ${hour}:00 AM`);
      return 25;
    }
    return 0;
  }

  // Rule 3: Check rapid transactions from BigQuery
  async checkRapidTransactions(transaction, reasons) {
    const query = `
      SELECT COUNT(*) as count
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.transactions\`
      WHERE user_id = @userId
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), timestamp, SECOND) <= @timeWindow
        AND transaction_id != @txnId
    `;

    const options = {
      query,
      params: {
        userId: transaction.user_id,
        timeWindow: this.thresholds.rapidTimeWindow,
        txnId: transaction.transaction_id,
      },
    };

    try {
      const [rows] = await bigquery.query(options);
      const count = rows[0]?.count || 0;

      if (count >= this.thresholds.rapidTransactions) {
        reasons.push(`చాలా వేగంగా transactions: ${count} in 10 minutes`);
        return 30;
      } else if (count >= 3) {
        reasons.push(`వేగంగా transactions: ${count} in 10 minutes`);
        return 15;
      }
    } catch (err) {
      // Table doesn't exist yet - first transaction
      console.log('ℹ️  No previous transactions found (first transaction)');
    }

    return 0;
  }

  // Rule 4: Daily limit check from BigQuery
  async checkDailyLimit(transaction, reasons) {
    const query = `
      SELECT COALESCE(SUM(amount), 0) as daily_total
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.transactions\`
      WHERE user_id = @userId
        AND DATE(timestamp) = CURRENT_DATE()
        AND status = 'SUCCESS'
        AND transaction_id != @txnId
    `;

    const options = {
      query,
      params: {
        userId: transaction.user_id,
        txnId: transaction.transaction_id,
      },
    };

    try {
      const [rows] = await bigquery.query(options);
      const dailyTotal = parseFloat(rows[0]?.daily_total || 0);
      const newTotal = dailyTotal + transaction.amount;

      if (newTotal >= this.thresholds.maxDailyAmount) {
        reasons.push(`Daily limit exceed: ₹${newTotal.toLocaleString('en-IN')} today`);
        return 25;
      }
    } catch (err) {
      console.log('ℹ️  Daily limit check skipped');
    }

    return 0;
  }

  // Rule 5: Round amount check
  checkRoundAmount(amount, reasons) {
    if (amount > 10000 && amount % 10000 === 0) {
      reasons.push(`Suspiciously round amount: ₹${amount.toLocaleString('en-IN')}`);
      return 10;
    }
    return 0;
  }

  // Rule 6: Device risk check
  checkDeviceRisk(transaction, reasons) {
    // No device_id అంటే anonymous transaction
    if (!transaction.device_id && transaction.amount > 10000) {
      reasons.push('Unknown device తో high-value transaction');
      return 20;
    }
    return 0;
  }

  // Severity determination
  getSeverity(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'SAFE';
  }
}

module.exports = new FraudDetectionEngine();
