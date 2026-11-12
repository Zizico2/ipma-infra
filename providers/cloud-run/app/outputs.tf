output "adapter_url" {
  value = google_cloud_run_v2_service.adapter.uri
}
output "gateway_url" {
  value = google_cloud_run_v2_service.gateway.uri
}

output "public_data_adapter_url" {
  value = google_cloud_run_v2_service.public_data_adapter.uri
}
output "public_data_gateway_url" {
  value = google_cloud_run_v2_service.public_data_gateway.uri
}
