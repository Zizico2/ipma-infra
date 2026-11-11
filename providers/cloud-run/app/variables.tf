variable "project_id" {
  type = string
}
variable "region" {
  type    = string
  default = "europe-southwest1"
}
variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Use staging or production."
  }
}
variable "adapter_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.adapter_image))
    error_message = "Deploy immutable image digests."
  }
}
variable "gateway_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.gateway_image))
    error_message = "Deploy immutable image digests."
  }
}
variable "minimum_instances" {
  type    = number
  default = 0
  validation {
    condition     = var.minimum_instances >= 0 && floor(var.minimum_instances) == var.minimum_instances
    error_message = "Minimum instances must be a non-negative integer."
  }
}
variable "maximum_instances" {
  type    = number
  default = 2
  validation {
    condition     = var.maximum_instances >= 1 && var.maximum_instances >= var.minimum_instances && floor(var.maximum_instances) == var.maximum_instances
    error_message = "Maximum instances must be a positive integer >= minimum instances."
  }
}
variable "cache_mib" {
  type    = number
  default = 64
  validation {
    condition     = var.cache_mib >= 1 && var.cache_mib <= 256 && floor(var.cache_mib) == var.cache_mib
    error_message = "Use 1..256 MiB with the default 512 MiB container memory limit."
  }
}
variable "log_filter" {
  type    = string
  default = "ipma_proxy=info,ipma_service=info,ipma_gateway=info,ipma_gateway_core=info"
}
