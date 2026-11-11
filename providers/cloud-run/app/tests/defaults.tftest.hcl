mock_provider "google" {}

variables {
  project_id    = "ipma-test-project"
  environment   = "staging"
  adapter_image = "europe-southwest1-docker.pkg.dev/ipma-test-project/ipma/adapter@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  gateway_image = "europe-southwest1-docker.pkg.dev/ipma-test-project/ipma/gateway@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}

run "portable_grpc_and_local_cache_defaults" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.adapter.template[0].containers[0].ports[0].name == "h2c" && google_cloud_run_v2_service.gateway.template[0].containers[0].ports[0].name == "h2c"
    error_message = "Both services must receive native gRPC over cleartext HTTP/2."
  }
  assert {
    condition     = google_cloud_run_v2_service.gateway.scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.gateway.scaling[0].max_instance_count == 2
    error_message = "The baseline should scale to zero with a small instance limit."
  }
  assert {
    condition     = google_cloud_run_v2_service.gateway.template[0].containers[0].resources[0].cpu_idle
    error_message = "Use request-based CPU allocation for this baseline."
  }
}
