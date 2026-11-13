mock_provider "cloudflare" {}

variables {
  account_id   = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  worker_name  = "ipma-weather-test"
  worker_url   = "https://ipma-weather-test.example.com"
  cache_title  = "test-cache"
  upstream_url = "https://gateway.example.com:443"
}

run "independent_cache_and_deployment_contract" {
  command = plan
  assert {
    condition     = cloudflare_workers_kv_namespace.weather_cache.account_id == var.account_id && cloudflare_workers_kv_namespace.weather_cache.title == "test-cache"
    error_message = "Create the cache in the selected account."
  }
  assert {
    condition     = output.deployment.worker_name == "ipma-weather-test" && output.deployment.upstream_url == var.upstream_url
    error_message = "Deployment must preserve the selected Worker and gateway."
  }
}

run "reject_non_https_gateway" {
  command = plan
  variables {
    upstream_url = "http://gateway.example.com"
  }
  expect_failures = [var.upstream_url]
}
