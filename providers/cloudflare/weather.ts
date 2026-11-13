import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releases } from "../../scripts/releases.ts";
import { workspace } from "../../scripts/hcp.ts";

type Deployment = {
  account_id: string;
  worker_name: string;
  upstream_url: string;
  cache_id: string;
  worker_url?: string;
};

// These settings belong to the deployment, while the app owns its build tools.
export function wranglerConfig(deployment: Deployment, app: string) {
  const base = JSON.parse(
    readFileSync(new URL("./weather/wrangler.json", import.meta.url), "utf8"),
  );
  return {
    ...base,
    account_id: deployment.account_id,
    name: deployment.worker_name,
    main: resolve(app, ".open-next/worker.js"),
    assets: { directory: resolve(app, ".open-next/assets"), binding: "ASSETS" },
    vars: { IPMA_GRPC_URL: deployment.upstream_url },
    kv_namespaces: [{ binding: "NEXT_INC_CACHE_KV", id: deployment.cache_id }],
    services: [
      { binding: "WORKER_SELF_REFERENCE", service: deployment.worker_name },
    ],
  };
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function main() {
  const mode = process.argv[2];
  assert(
    ["plan", "build", "deploy"].includes(mode),
    "Use plan, build or deploy",
  );
  const environment = process.env.DEPLOY_ENVIRONMENT ?? "staging";
  assert(["staging", "production"].includes(environment));
  const app = resolve(".sources/ipma-weather");
  const directory = "providers/cloudflare/weather";
  const artifacts = resolve(`.artifacts/cloudflare/${environment}`);
  const archive = `${artifacts}/weather.tar.gz`;
  const config = `${artifacts}/wrangler.json`;
  const manifestPath = `${artifacts}/release.json`;
  const expected = {
    environment,
    infraRevision: git("rev-parse", "HEAD"),
    appRevision: releases()["ipma-weather"].revision,
  };
  assert.equal(git("-C", app, "rev-parse", "HEAD"), expected.appRevision);
  // Do not build or deploy a changed checkout under a pinned source revision.
  execFileSync("git", ["-C", app, "diff", "--exit-code", "HEAD"], {
    stdio: "inherit",
  });
  mkdirSync(artifacts, { recursive: true });
  const writeConfig = (deployment: Deployment) => {
    writeFileSync(
      config,
      JSON.stringify(wranglerConfig(deployment, app), null, 2),
    );
  };
  const terraform = (...args: string[]) =>
    execFileSync("terraform", [`-chdir=${directory}`, ...args], {
      stdio: "inherit",
    });
  const init = async () => {
    const organization = process.env.TF_CLOUD_ORGANIZATION;
    assert(organization, "Set TF_CLOUD_ORGANIZATION");
    process.env.TF_WORKSPACE = `ipma-cloudflare-${environment}`;
    await workspace(organization, process.env.TF_WORKSPACE);
    terraform("init", "-input=false", "-lockfile=readonly");
  };
  const savedRelease = () => {
    const saved = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const [key, value] of Object.entries(expected))
      assert.equal(saved[key], value, `Release ${key} does not match`);
    return saved;
  };

  if (mode === "plan") {
    const inputs = JSON.parse(
      readFileSync(
        `${directory}/environments/${environment}.tfvars.json`,
        "utf8",
      ),
    );
    if (process.env.TF_VAR_upstream_url)
      inputs.upstream_url = process.env.TF_VAR_upstream_url;
    assert(inputs.upstream_url, "Set TF_VAR_upstream_url for this environment");
    writeFileSync(
      `${artifacts}/inputs.tfvars.json`,
      JSON.stringify(inputs, null, 2),
    );
    await init();
    terraform(
      "plan",
      "-input=false",
      "-lock-timeout=5m",
      `-var-file=${artifacts}/inputs.tfvars.json`,
      `-out=${artifacts}/deploy.tfplan`,
    );
    const plan = execFileSync(
      "terraform",
      [
        `-chdir=${directory}`,
        "show",
        "-no-color",
        `${artifacts}/deploy.tfplan`,
      ],
      { encoding: "utf8" },
    );
    writeFileSync(`${artifacts}/plan.txt`, plan);
    // A new production namespace has no ID until apply. It is a runtime binding,
    // so a local placeholder is sufficient to build the reviewed Worker bundle.
    writeConfig({
      ...inputs,
      cache_id: inputs.existing_cache_id ?? "0".repeat(32),
    });
    writeFileSync(manifestPath, JSON.stringify(expected, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Cloudflare ${environment}\n\nApp: \`${expected.appRevision}\`\n\nReview **cloudflare-weather-plan** before approving deployment.\n\n\`\`\`text\n${plan}\n\`\`\`\n`,
      );
  } else if (mode === "build") {
    const saved = savedRelease();
    const buildConfig = JSON.parse(readFileSync(config, "utf8"));
    execFileSync("bun", ["run", "build:cf", "--config", config], {
      cwd: app,
      stdio: "inherit",
      env: { ...process.env, IPMA_GRPC_URL: buildConfig.vars.IPMA_GRPC_URL },
    });
    execFileSync("tar", ["-czf", archive, ".open-next"], {
      cwd: app,
      stdio: "inherit",
    });
    saved.buildSha256 = sha256(archive);
    saved.planSha256 = sha256(`${artifacts}/deploy.tfplan`);
    writeFileSync(manifestPath, JSON.stringify(saved, null, 2));
  } else {
    const saved = savedRelease();
    assert.equal(
      sha256(archive),
      saved.buildSha256,
      "Worker artifact differs from reviewed build",
    );
    assert.equal(
      sha256(`${artifacts}/deploy.tfplan`),
      saved.planSha256,
      "Terraform plan differs from reviewed plan",
    );
    await init();
    terraform(
      "apply",
      "-input=false",
      "-lock-timeout=5m",
      `${artifacts}/deploy.tfplan`,
    );
    const outputs = JSON.parse(
      execFileSync("terraform", [`-chdir=${directory}`, "output", "-json"], {
        encoding: "utf8",
      }),
    );
    const deployment: Deployment = outputs.deployment.value;
    writeFileSync(
      `${artifacts}/deployment.json`,
      JSON.stringify(deployment, null, 2),
    );
    writeConfig(deployment);
    execFileSync("tar", ["-xzf", archive], { cwd: app, stdio: "inherit" });
    execFileSync(
      "bun",
      ["x", "opennextjs-cloudflare", "deploy", "--config", config],
      {
        cwd: app,
        stdio: "inherit",
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: deployment.account_id },
      },
    );
    if (process.env.GITHUB_OUTPUT) {
      assert(
        deployment.worker_url &&
          /^https:\/\/[a-zA-Z0-9.-]+$/.test(deployment.worker_url),
      );
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `worker_url=${deployment.worker_url}\n`,
      );
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
