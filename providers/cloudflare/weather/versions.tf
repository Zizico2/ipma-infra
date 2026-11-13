terraform {
  cloud {}
  required_version = ">= 1.15, < 2.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Authentication comes from CLOUDFLARE_API_TOKEN, never from Terraform variables.
provider "cloudflare" {}
