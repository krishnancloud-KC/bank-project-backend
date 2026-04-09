// src/pubsub-listener.js
// Transaction Service నుండి events వింటుంది

const { PubSub } = require('@google-cloud/pubsub');
const { Firestore } = require('@google-cloud/firestore');
const fraudEngine = require('./fraud-engine');
const bigQueryService = require('./bigquery-service');

const pubsub = new PubSub({ projectId: process.env.PROJECT_ID });
const firestore = new Firestore({ projectId: process.env.PROJECT_ID });

const SUBSCRIPTION_NAME = process.env.PUBSUB_SUBSCRIPTION || 'transaction-events-sub';
const FRAUD_TOPIC_NAME = process.env.PUBSUB_FRAUD_TOPIC || 'fraud-alerts';

class PubSubListener {
  constructor() {
    this.subscription = null;
    this.fraudTopic = null;
    this.isRunning = false;
    this.processedCount = 0;
    this.fraudCount = 0;
  }

  async initialize() {
    try {
      // Subscription ని get చేయి
      this.subscription = pubsub.subscription(SUBSCRIPTION_NAME);

      // Fraud alerts topic create చేయి (exists అయినా OK)
      const [topics] = await pubsub.getTopics();
      const topicExists = topics.some(t =>
        t.name.endsWith(`/topics/${FRAUD_TOPIC_NAME}`)
      );

      if (!topicExists) {
        [this.fraudTopic] = await pubsub.createTopic(FRAUD_TOPIC_NAME);
        console.log(`✅ Fraud alerts topic '${FRAUD_TOPIC_NAME}' create అయింది`);
      } else {
        this.fraudTopic = pubsub.topic(FRAUD_TOPIC_NAME);
        console.log(`ℹ️  Fraud alerts topic '${FRAUD_TOPIC_NAME}' ready`);
      }

      console.log('✅ PubSub listener initialize అయింది');
      return true;
    } catch (error) {
      console.error('❌ PubSub initialize error:', error.message);
      return false;
    }
  }

  async startListening() {
    if (this.isRunning) {
      console.log('⚠️  Listener already running');
      return;
    }

    console.log(`👂 Transaction events వింటున్నాం: ${SUBSCRIPTION_NAME}`);
    this.isRunning = true;

    this.subscription.on('message', async (message) => {
      try {
        await this.processMessage(message);
      } catch (error) {
        console.error('❌ Message processing error:', error.message);
        message.nack(); // Retry చేయమని చెప్పు
      }
    });

    this.subscription.on('error', (error) => {
      console.error('❌ Subscription error:', error.message);
    });
  }

  async processMessage(message) {
    let transaction;

    try {
      const data = message.data.toString();
      transaction = JSON.parse(data);
      console.log(`📨 Message received: ${transaction.transaction_id}`);
    } catch (err) {
      console.error('❌ Invalid message format:', err.message);
      message.ack(); // Bad message - discard చేయి
      return;
    }

    // Fraud analysis చేయి
    const fraudResult = await fraudEngine.analyzeTransaction(transaction);

    // BigQuery లో transaction save చేయి
    await bigQueryService.saveTransaction(transaction, fraudResult);

    // Fraud అయితే:
    if (fraudResult.is_fraud || fraudResult.severity === 'MEDIUM') {
      // 1. BigQuery లో fraud alert save చేయి
      const alertId = await bigQueryService.saveFraudAlert(transaction, fraudResult);

      // 2. Firestore లో real-time alert save చేయి
      await this.saveFirestoreAlert(transaction, fraudResult, alertId);

      // 3. Fraud alerts topic లో publish చేయి
      await this.publishFraudAlert(transaction, fraudResult, alertId);

      this.fraudCount++;
      console.log(`🚨 FRAUD DETECTED: ${transaction.transaction_id} (Score: ${fraudResult.fraud_score})`);
    }

    this.processedCount++;
    message.ack(); // Successfully processed
    console.log(`✅ Message processed. Total: ${this.processedCount}, Frauds: ${this.fraudCount}`);
  }

  async saveFirestoreAlert(transaction, fraudResult, alertId) {
    try {
      await firestore
        .collection(process.env.FIRESTORE_COLLECTION || 'fraud_alerts')
        .doc(alertId || transaction.transaction_id)
        .set({
          alert_id: alertId,
          transaction_id: transaction.transaction_id,
          user_id: transaction.user_id,
          amount: transaction.amount,
          fraud_score: fraudResult.fraud_score,
          fraud_reasons: fraudResult.fraud_reasons,
          severity: fraudResult.severity,
          is_fraud: fraudResult.is_fraud,
          status: 'OPEN',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      console.log(`✅ Firestore alert saved`);
    } catch (error) {
      console.error('❌ Firestore save error:', error.message);
    }
  }

  async publishFraudAlert(transaction, fraudResult, alertId) {
    try {
      const alertData = {
        alert_id: alertId,
        transaction_id: transaction.transaction_id,
        user_id: transaction.user_id,
        amount: transaction.amount,
        fraud_score: fraudResult.fraud_score,
        severity: fraudResult.severity,
        reasons: fraudResult.fraud_reasons,
        timestamp: new Date().toISOString(),
      };

      const messageBuffer = Buffer.from(JSON.stringify(alertData));
      await this.fraudTopic.publishMessage({
        data: messageBuffer,
        attributes: {
          severity: fraudResult.severity,
          user_id: transaction.user_id,
        },
      });

      console.log(`📢 Fraud alert published to topic`);
    } catch (error) {
      console.error('❌ Publish fraud alert error:', error.message);
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      fraudCount: this.fraudCount,
      fraudRate: this.processedCount > 0
        ? ((this.fraudCount / this.processedCount) * 100).toFixed(2) + '%'
        : '0%',
    };
  }
}

module.exports = new PubSubListener();
