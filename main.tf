provider "google" {
  credentials = file("C:/Users/admin/gcp-keys/bank-project-admin.json")
  project     = "bank-project-solutions"
  region      = "asia-south1"
}

resource "google_firestore_database" "bank_db" {
  name        = "(default)"
  location_id = "asia-south1"
  type        = "FIRESTORE_NATIVE"
}

resource "google_pubsub_topic" "bank_transactions" {
  name = "bank-transactions-topic"
}

resource "google_pubsub_subscription" "bank_sub" {
  name  = "bank-transactions-sub"
  topic = google_pubsub_topic.bank_transactions.name
  ack_deadline_seconds = 20
}