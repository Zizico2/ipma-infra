variable "project_id" {
  description = "Existing billing-enabled Google Cloud project. Use a dedicated project for this benchmark."
  type        = string
}

variable "region" {
  type    = string
  default = "europe-southwest1"
}

variable "github_repository" {
  type    = string
  default = "Zizico2/ipma-infra"
}

variable "github_repository_id" {
  description = "Immutable numeric repository ID from gh api repos/OWNER/REPO --jq .id."
  type        = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "Use the numeric GitHub repository ID."
  }
}

variable "github_owner_id" {
  type    = string
  default = "34165908"
}

variable "environments" {
  type    = set(string)
  default = ["staging", "production"]
}
