output "adapter_url" {
  value = google_cloud_run_v2_service.adapter.uri
}
output "gateway_url" {
  value = google_cloud_run_v2_service.gateway.uri
}
