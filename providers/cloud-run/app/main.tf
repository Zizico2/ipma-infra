resource "google_cloud_run_v2_service" "adapter" {
  name                = "ipma-adapter-${var.environment}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = { application = "ipma", environment = var.environment }
  scaling {
    min_instance_count = var.minimum_instances
    max_instance_count = var.maximum_instances
  }
  template {
    service_account                  = "ipma-adapter@${var.project_id}.iam.gserviceaccount.com"
    max_instance_request_concurrency = 8
    timeout                          = "60s"
    containers {
      image = var.adapter_image
      ports {
        name           = "h2c"
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      env {
        name  = "RUST_LOG"
        value = var.log_filter
      }
      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 2
        timeout_seconds       = 1
        failure_threshold     = 30
        grpc {
          port    = 8080
          service = "ipma.proxy.v1.ProxyService"
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "gateway" {
  name                = "ipma-gateway-${var.environment}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = { application = "ipma", environment = var.environment }
  scaling {
    min_instance_count = var.minimum_instances
    max_instance_count = var.maximum_instances
  }
  template {
    service_account                  = "ipma-gateway@${var.project_id}.iam.gserviceaccount.com"
    max_instance_request_concurrency = 32
    timeout                          = "60s"
    containers {
      image = var.gateway_image
      ports {
        name           = "h2c"
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = {
          IPMA_GATEWAY_UPSTREAM_ADDRESS         = google_cloud_run_v2_service.adapter.uri
          IPMA_GATEWAY_CACHE_MIB                = tostring(var.cache_mib)
          IPMA_GATEWAY_UPSTREAM_TIMEOUT_SECONDS = "30"
          IPMA_GATEWAY_CACHE_NEUTRAL_METADATA   = "x-forwarded-for,x-forwarded-proto,x-forwarded-host,forwarded,x-cloud-trace-context,traceparent,tracestate"
          RUST_LOG                              = var.log_filter
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 2
        timeout_seconds       = 1
        failure_threshold     = 30
        grpc {
          port    = 8080
          service = "ipma.proxy.v1.ProxyService"
        }
      }
    }
  }
  depends_on = [google_cloud_run_v2_service_iam_member.adapter_public]
}

# The current shared API serves public IPMA data and has no auth policy.
# Keep the adapter independently reachable for the direct benchmark baseline.
# A future private adapter needs a portable service-auth design, not just this IAM flip.
resource "google_cloud_run_v2_service_iam_member" "adapter_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.adapter.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
resource "google_cloud_run_v2_service_iam_member" "gateway_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
