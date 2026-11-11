data "google_project" "current" {}

resource "google_project_service" "api" {
  for_each = toset([
    "run.googleapis.com", "artifactregistry.googleapis.com", "iam.googleapis.com",
    "iamcredentials.googleapis.com", "sts.googleapis.com", "cloudresourcemanager.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "ipma"
  format        = "DOCKER"
  docker_config { immutable_tags = true }
  depends_on = [google_project_service.api]
}

resource "google_service_account" "identity" {
  for_each     = toset(["build", "deploy", "adapter", "gateway"])
  account_id   = "ipma-${each.key}"
  display_name = "IPMA ${each.key}"
  depends_on   = [google_project_service.api]
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "ipma-github"
  display_name              = "IPMA GitHub Actions"
  depends_on                = [google_project_service.api]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }
  # Both repository identity and workflow identity are constrained. Pull requests
  # and similarly named repositories cannot use the deployment identities.
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.workflow_ref == '${var.github_repository}/.github/workflows/deploy.yml@refs/heads/main'",
  ])
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

locals {
  principal_prefix = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject"
  # New GitHub repositories use immutable subjects, including owner/repository IDs.
  github_repository_parts = split("/", var.github_repository)
  github_subject_prefix   = "repo:${local.github_repository_parts[0]}@${var.github_owner_id}/${local.github_repository_parts[1]}@${var.github_repository_id}"
}

resource "google_service_account_iam_member" "build_federation" {
  service_account_id = google_service_account.identity["build"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.principal_prefix}/${local.github_subject_prefix}:ref:refs/heads/main"
}

resource "google_service_account_iam_member" "deploy_federation" {
  for_each           = var.environments
  service_account_id = google_service_account.identity["deploy"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.principal_prefix}/${local.github_subject_prefix}:environment:${each.value}"
}

resource "google_project_iam_member" "plan_reads" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.identity["build"].email}"
}

resource "google_project_iam_member" "deploy" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.identity["deploy"].email}"
}

resource "google_service_account_iam_member" "runtime_act_as" {
  for_each           = toset(["adapter", "gateway"])
  service_account_id = google_service_account.identity[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.identity["deploy"].email}"
}

resource "google_artifact_registry_repository_iam_member" "build" {
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.identity["build"].email}"
}

resource "google_artifact_registry_repository_iam_member" "deploy" {
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.identity["deploy"].email}"
}
