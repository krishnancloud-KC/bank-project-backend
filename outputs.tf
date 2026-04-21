output "auth_service_url" {
  description = "URL of the auth Cloud Run service"
  value       = google_cloud_run_v2_service.auth_service.uri
}

output "transaction_service_url" {
  description = "URL of the transaction Cloud Run service"
  value       = google_cloud_run_v2_service.transaction_service.uri
}

output "fraud_detection_service_url" {
  description = "URL of the fraud detection Cloud Run service"
  value       = google_cloud_run_v2_service.fraud_detection_service.uri
}

output "chatbot_service_url" {
  description = "URL of the chatbot Cloud Run service"
  value       = google_cloud_run_v2_service.chatbot_service.uri
}

output "firestore_database_name" {
  description = "Firestore database name"
  value       = google_firestore_database.bank_db.name
}

output "pubsub_topic_name" {
  description = "Pub/Sub topic name"
  value       = google_pubsub_topic.bank_transactions.name
}
