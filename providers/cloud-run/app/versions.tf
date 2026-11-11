terraform {
  cloud {}
  required_version = ">= 1.15, < 2.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 7.0, < 9.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
