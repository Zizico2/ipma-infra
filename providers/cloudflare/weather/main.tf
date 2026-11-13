resource "cloudflare_workers_kv_namespace" "weather_cache" {
  account_id = var.account_id
  title      = var.cache_title

  lifecycle {
    prevent_destroy = true
  }
}

# Adopt the current staging cache without recreating it or deleting its data.
import {
  for_each = var.existing_cache_id == null ? {} : { existing = var.existing_cache_id }
  to       = cloudflare_workers_kv_namespace.weather_cache
  id       = "${var.account_id}/${each.value}"
}

# Worker code/assets/bindings are owned by OpenNext/Wrangler, not this root.
output "deployment" {
  value = {
    account_id   = var.account_id
    worker_name  = var.worker_name
    worker_url   = var.worker_url
    upstream_url = var.upstream_url
    cache_id     = cloudflare_workers_kv_namespace.weather_cache.id
  }
}
