variable "account_id" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{32}$", var.account_id))
    error_message = "Use a Cloudflare account ID."
  }
}

variable "worker_name" {
  type = string
  validation {
    condition     = can(regex("^ipma-weather(?:-[a-z0-9-]+)?$", var.worker_name))
    error_message = "Use an IPMA weather Worker name."
  }
}

variable "cache_title" {
  type = string
}

variable "existing_cache_id" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.existing_cache_id == null || can(regex("^[a-f0-9]{32}$", var.existing_cache_id))
    error_message = "Use a KV namespace ID, or null to create a new namespace."
  }
}

variable "upstream_url" {
  type = string
  validation {
    condition     = can(regex("^https://[a-zA-Z0-9.-]+(?::443)?/?$", var.upstream_url))
    error_message = "Use the HTTPS origin of the native gRPC gateway."
  }
}

variable "worker_url" {
  type = string
  validation {
    condition     = can(regex("^https://[a-zA-Z0-9.-]+$", var.worker_url))
    error_message = "Use the public HTTPS Worker origin for post-deployment checks."
  }
}
