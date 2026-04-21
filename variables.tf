variable "project_id" {
  description = "Google Cloud project ID for deployment resources."
  type        = string
  default     = "bank-project-solutions"
}

variable "region" {
  description = "Google Cloud region where services are deployed."
  type        = string
  default     = "asia-south1"
}

variable "auth_service_image" {
  description = "Container image URI for the authentication service."
  type        = string
}

variable "transaction_service_image" {
  description = "Container image URI for the transaction service."
  type        = string
}

variable "fraud_service_image" {
  description = "Container image URI for the fraud detection service."
  type        = string
}

variable "chatbot_service_image" {
  description = "Container image URI for the chatbot service."
  type        = string
}
