mock_provider "google" {}

variables {
  project_id                = "ipma-test-project"
  environment               = "staging"
  adapter_image             = "europe-southwest1-docker.pkg.dev/ipma-test-project/ipma/adapter@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  gateway_image             = "europe-southwest1-docker.pkg.dev/ipma-test-project/ipma/gateway@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  public_data_adapter_image = "europe-southwest1-docker.pkg.dev/ipma-test-project/ipma/public-data-adapter@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  public_data_gateway_image = "europe-southwest1-docker.pkg.dev/ipma-test-project/ipma/public-data-gateway@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
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

run "independent_public_data_pair" {
  command = plan
  assert {
    condition     = google_cloud_run_v2_service.public_data_adapter.template[0].containers[0].startup_probe[0].grpc[0].service == "ipma.public_data.v1.PublicDataService" && google_cloud_run_v2_service.public_data_gateway.template[0].containers[0].startup_probe[0].grpc[0].service == "ipma.public_data.v1.PublicDataService"
    error_message = "Website feeds must advertise the separate protobuf service."
  }
  assert {
    condition     = google_cloud_run_v2_service.public_data_gateway.template[0].service_account != google_cloud_run_v2_service.gateway.template[0].service_account && google_cloud_run_v2_service.public_data_adapter.template[0].service_account != google_cloud_run_v2_service.adapter.template[0].service_account
    error_message = "Use independent website-feed runtime identities."
  }
  assert {
    condition     = google_cloud_run_v2_service.public_data_gateway.scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.public_data_gateway.scaling[0].max_instance_count == 2
    error_message = "Website-feed services should use bounded scale-to-zero defaults."
  }
}
