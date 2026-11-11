mock_provider "google" {
  override_during = plan
  mock_resource "google_iam_workload_identity_pool" {
    defaults = {
      name = "projects/123456789012/locations/global/workloadIdentityPools/ipma-github"
    }
  }
}

variables {
  project_id           = "ipma-test-project"
  github_repository    = "example/ipma-infra"
  github_owner_id      = "123456"
  github_repository_id = "987654"
}

run "immutable_subjects_preserve_approval_boundary" {
  command = plan

  assert {
    condition     = google_service_account_iam_member.build_federation.member == "principal://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/ipma-github/subject/repo:example@123456/ipma-infra@987654:ref:refs/heads/main"
    error_message = "The build identity must match GitHub's immutable main-branch subject."
  }
  assert {
    condition = alltrue([
      for environment in ["staging", "production"] :
      google_service_account_iam_member.deploy_federation[environment].member == "principal://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/ipma-github/subject/repo:example@123456/ipma-infra@987654:environment:${environment}"
    ])
    error_message = "Deployment identities must require the matching protected GitHub environment."
  }
  assert {
    condition = alltrue([
      for restriction in [
        "assertion.repository_id == '987654'",
        "assertion.repository_owner_id == '123456'",
        "assertion.ref == 'refs/heads/main'",
        "assertion.workflow_ref == 'example/ipma-infra/.github/workflows/deploy.yml@refs/heads/main'",
      ] : strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, restriction)
    ])
    error_message = "Federation must also restrict repository IDs, main and the exact deployment workflow."
  }
}
