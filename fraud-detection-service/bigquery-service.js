// src/bigquery-service.js
// BigQuery data operations

const { bigquery, DATASET_ID } = require('./bigquery-setup');
const { v4: uuidv4 } = require('uuid');

class BigQueryService {

  // Transaction ని BigQuery లో save చేయి
  async saveTransaction(transaction, fraudResult) {
    const row = {
      transaction_id: transaction.transaction_id,
      user_id: transaction.user_id,
      amount: parseFloat(transaction.amount),
      transaction_type: transaction.transaction_type || 'TRANSFER',
      status: transaction.status || 'PENDING',
      timestamp: new Date(transaction.timestamp || Date.now()).toISOString(),
      ip_address: transaction.ip_address || null,
      device_id: transaction.device_id || null,
      location: transaction.location || null,
      fraud_score: fraudResult.fraud_score,
      is_fraud: fraudResult.is_fraud,
      fraud_reasons: fraudResult.fraud_reasons || [],
    };

    try {
      await bigquery
        .dataset(DATASET_ID)
        .table('transactions')
        .insert([row]);

      console.log(`✅ Transaction ${transaction.transaction_id} BigQuery లో save అయింది`);
      return true;
    } catch (error) {
      if (error.name === 'PartialFailureError') {
        console.error('❌ BigQuery insert errors:', error.errors);
      } else {
        console.error('❌ BigQuery save error:', error.message);
      }
      return false;
    }
  }

  // Fraud alert ని BigQuery లో save చేయి
  async saveFraudAlert(transaction, fraudResult) {
    const alertId = uuidv4();
    const row = {
      alert_id: alertId,
      transaction_id: transaction.transaction_id,
      user_id: transaction.user_id,
      fraud_score: fraudResult.fraud_score,
      fraud_reasons: fraudResult.fraud_reasons || [],
      alert_timestamp: new Date().toISOString(),
      severity: fraudResult.severity,
      resolved: false,
      resolved_at: null,
    };

    try {
      await bigquery
        .dataset(DATASET_ID)
        .table('fraud_alerts')
        .insert([row]);

      console.log(`🚨 Fraud alert ${alertId} BigQuery లో save అయింది`);
      return alertId;
    } catch (error) {
      console.error('❌ Fraud alert save error:', error.message);
      return null;
    }
  }

  // Analytics: Recent fraud stats
  async getFraudStats(days = 7) {
    const query = `
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as total_transactions,
        COUNTIF(is_fraud = TRUE) as fraud_transactions,
        ROUND(AVG(fraud_score), 2) as avg_fraud_score,
        ROUND(SUM(CASE WHEN is_fraud = TRUE THEN amount ELSE 0 END), 2) as fraud_amount,
        ROUND(SUM(amount), 2) as total_amount
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.transactions\`
      WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      GROUP BY date
      ORDER BY date DESC
    `;

    try {
      const [rows] = await bigquery.query({
        query,
        params: { days },
      });
      return rows;
    } catch (error) {
      console.error('❌ getFraudStats error:', error.message);
      return [];
    }
  }

  // Analytics: Top fraud users
  async getTopFraudUsers(limit = 10) {
    const query = `
      SELECT
        user_id,
        COUNT(*) as fraud_count,
        ROUND(AVG(fraud_score), 2) as avg_score,
        ROUND(SUM(amount), 2) as total_fraud_amount,
        MAX(timestamp) as last_fraud_timestamp
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.transactions\`
      WHERE is_fraud = TRUE
      GROUP BY user_id
      ORDER BY fraud_count DESC
      LIMIT @limit
    `;

    try {
      const [rows] = await bigquery.query({
        query,
        params: { limit },
      });
      return rows;
    } catch (error) {
      console.error('❌ getTopFraudUsers error:', error.message);
      return [];
    }
  }

  // Analytics: Hourly fraud pattern
  async getHourlyPattern() {
    const query = `
      SELECT
        EXTRACT(HOUR FROM timestamp) as hour,
        COUNT(*) as total_transactions,
        COUNTIF(is_fraud = TRUE) as fraud_count,
        ROUND(AVG(CASE WHEN is_fraud = TRUE THEN fraud_score END), 2) as avg_fraud_score
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.transactions\`
      WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      GROUP BY hour
      ORDER BY hour
    `;

    try {
      const [rows] = await bigquery.query({ query });
      return rows;
    } catch (error) {
      console.error('❌ getHourlyPattern error:', error.message);
      return [];
    }
  }

  // Real-time: Recent alerts
  async getRecentAlerts(limit = 20) {
    const query = `
      SELECT *
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.fraud_alerts\`
      WHERE resolved = FALSE
      ORDER BY alert_timestamp DESC
      LIMIT @limit
    `;

    try {
      const [rows] = await bigquery.query({
        query,
        params: { limit },
      });
      return rows;
    } catch (error) {
      console.error('❌ getRecentAlerts error:', error.message);
      return [];
    }
  }

  // User transaction history
  async getUserTransactionHistory(userId, days = 30) {
    const query = `
      SELECT *
      FROM \`${process.env.PROJECT_ID}.${DATASET_ID}.transactions\`
      WHERE user_id = @userId
        AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      ORDER BY timestamp DESC
      LIMIT 100
    `;

    try {
      const [rows] = await bigquery.query({
        query,
        params: { userId, days },
      });
      return rows;
    } catch (error) {
      console.error('❌ getUserTransactionHistory error:', error.message);
      return [];
    }
  }
}

module.exports = new BigQueryService();
