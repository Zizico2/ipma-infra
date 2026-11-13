import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";
import { wranglerConfig } from "../providers/cloudflare/weather.ts";

test("hosted config binds the selected Worker, cache and backend independently of app dev config", () => {
  const config = wranglerConfig(
    {
      account_id: "a".repeat(32),
      worker_name: "ipma-weather-production",
      upstream_url: "https://gateway.example.com:443",
      cache_id: "b".repeat(32),
    },
    "/tmp/pinned-weather",
  );
  assert.equal(config.name, "ipma-weather-production");
  assert.equal(config.main, "/tmp/pinned-weather/.open-next/worker.js");
  assert.equal(
    config.assets.directory,
    "/tmp/pinned-weather/.open-next/assets",
  );
  assert.equal(config.vars.IPMA_GRPC_URL, "https://gateway.example.com:443");
  assert.deepEqual(config.services, [
    { binding: "WORKER_SELF_REFERENCE", service: config.name },
  ]);
  assert.deepEqual(config.kv_namespaces, [
    { binding: "NEXT_INC_CACHE_KV", id: "b".repeat(32) },
  ]);
});

test("Cloudflare deployment requires approval and consumes the saved app and Terraform artifacts", () => {
  const workflow = parse(
    readFileSync(".github/workflows/cloudflare-weather.yml", "utf8"),
  );
  assert.equal(workflow.jobs.deploy.needs, "plan");
  assert.equal(
    workflow.jobs.deploy.environment.name,
    "${{ inputs.environment }}",
  );
  assert(!workflow.on.push);
  const steps = workflow.jobs.deploy.steps;
  assert(
    steps.some((s: { uses?: string }) =>
      s.uses?.startsWith("actions/download-artifact@"),
    ),
  );
  assert(
    !steps.some((s: { run?: string }) => s.run?.includes("cloudflare:build")),
  );
});
