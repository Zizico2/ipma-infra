output "github_variables" {
  value = {
    GCP_PROJECT_ID                 = var.project_id
    GCP_REGION                     = var.region
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_BUILD_SERVICE_ACCOUNT      = google_service_account.identity["build"].email
    GCP_DEPLOY_SERVICE_ACCOUNT     = google_service_account.identity["deploy"].email
  }
}

output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}
