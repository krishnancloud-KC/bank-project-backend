// src/bigquery-setup.js
// BigQuery dataset మరియు tables create చేస్తుంది

const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({
  projectId: process.env.PROJECT_ID || 'bank-project-solutions',
});

const DATASET_ID = process.env.BIGQUERY_DATASET || 'fraud_detection';

// Transactions table schema
const transactionsSchema = [
  { name: 'transaction_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'amount', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'transaction_type', type: 'STRING', mode: 'REQUIRED' },
  { name: 'status', type: 'STRING', mode: 'REQUIRED' },
  { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'ip_address', type: 'STRING', mode: 'NULLABLE' },
  { name: 'device_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'location', type: 'STRING', mode: 'NULLABLE' },
  { name: 'fraud_score', type: 'FLOAT64', mode: 'NULLABLE' },
  { name: 'is_fraud', type: 'BOOLEAN', mode: 'NULLABLE' },
  { name: 'fraud_reasons', type: 'STRING', mode: 'REPEATED' },
];

// Fraud alerts table schema
const fraudAlertsSchema = [
  { name: 'alert_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'transaction_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'fraud_score', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'fraud_reasons', type: 'STRING', mode: 'REPEATED' },
  { name: 'alert_timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'severity', type: 'STRING', mode: 'REQUIRED' }, // LOW, MEDIUM, HIGH, CRITICAL
  { name: 'resolved', type: 'BOOLEAN', mode: 'NULLABLE' },
  { name: 'resolved_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
];

// User behavior table schema (pattern analysis కోసం)
const userBehaviorSchema = [
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'total_transactions', type: 'INT64', mode: 'REQUIRED' },
  { name: 'total_amount', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'avg_amount', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'max_amount', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'unique_ips', type: 'INT64', mode: 'REQUIRED' },
  { name: 'unique_devices', type: 'INT64', mode: 'REQUIRED' },
  { name: 'fraud_flags', type: 'INT64', mode: 'REQUIRED' },
];

async function setupBigQuery() {
  console.log('🔧 BigQuery setup మొదలవుతోంది...');

  try {
    // Dataset create చేయి (already exists అయినా OK)
    const [datasets] = await bigquery.getDatasets();
    const datasetExists = datasets.some(d => d.id === DATASET_ID);

    if (!datasetExists) {
      await bigquery.createDataset(DATASET_ID, {
        location: 'asia-south1',
        description: 'Fraud Detection Dataset for Bank Project',
      });
      console.log(`✅ Dataset '${DATASET_ID}' create అయింది`);
    } else {
      console.log(`ℹ️  Dataset '${DATASET_ID}' already exists`);
    }

    const dataset = bigquery.dataset(DATASET_ID);

    // Tables create చేయి
    const tables = [
      { id: 'transactions', schema: transactionsSchema, description: 'All transaction records' },
      { id: 'fraud_alerts', schema: fraudAlertsSchema, description: 'Fraud alert records' },
      { id: 'user_behavior', schema: userBehaviorSchema, description: 'Daily user behavior summary' },
    ];

    for (const table of tables) {
      const [tableExists] = await dataset.table(table.id).exists();
      if (!tableExists) {
        await dataset.createTable(table.id, {
          schema: table.schema,
          description: table.description,
          timePartitioning: {
            type: 'DAY',
            field: table.id === 'user_behavior' ? 'date' : 'timestamp',
          },
        });
        console.log(`✅ Table '${table.id}' create అయింది`);
      } else {
        console.log(`ℹ️  Table '${table.id}' already exists`);
      }
    }

    console.log('✅ BigQuery setup పూర్తయింది!');
    return true;
  } catch (error) {
    console.error('❌ BigQuery setup error:', error.message);
    throw error;
  }
}

module.exports = { bigquery, DATASET_ID, setupBigQuery };
