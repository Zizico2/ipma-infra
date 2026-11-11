import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { releases, services } from "../../scripts/releases.ts";
import { workspace } from "../../scripts/hcp.ts";

const directory = "providers/cloud-run/app";
const artifacts = ".artifacts/release";
const mode = process.argv[2];
assert(["plan", "apply"].includes(mode), "Use plan or apply");
const environment = process.env.DEPLOY_ENVIRONMENT;
assert(environment === "staging" || environment === "production");
const organization = process.env.TF_CLOUD_ORGANIZATION;
assert(organization, "Set TF_CLOUD_ORGANIZATION");
process.env.TF_WORKSPACE = `ipma-${environment}`;
await workspace(organization, process.env.TF_WORKSPACE);
const terraform = (...args: string[]) =>
  execFileSync("terraform", [`-chdir=${directory}`, ...args], {
    stdio: "inherit",
  });

if (mode === "plan") {
  const project = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION ?? "europe-southwest1";
  const revision = process.env.GITHUB_SHA;
  const run = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  assert(project && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project));
  assert(/^[a-z]+-[a-z]+[0-9]+$/.test(region));
  assert(revision && /^[a-f0-9]{40}$/.test(revision));
  assert(/^[0-9]+-[0-9]+$/.test(run));
  mkdirSync(artifacts, { recursive: true });
  const images: string[] = [];
  for (const [index, name] of services.entries()) {
    const image: string = `${region}-docker.pkg.dev/${project}/ipma/${index === 0 ? "adapter" : "gateway"}`;
    const tag = `${image}:${revision}-${run}`;
    execFileSync("docker", ["tag", `${name}:local`, tag], { stdio: "inherit" });
    execFileSync("docker", ["push", tag], { stdio: "inherit" });
    const digests = JSON.parse(
      execFileSync(
        "docker",
        ["image", "inspect", tag, "--format", "{{json .RepoDigests}}"],
        { encoding: "utf8" },
      ),
    ) as string[];
    const digest: string | undefined = digests.find((value) =>
      value.startsWith(`${image}@sha256:`),
    );
    assert(digest, "Missing published image digest");
    images.push(digest);
  }
  const variables = {
    project_id: project,
    region,
    environment,
    adapter_image: images[0],
    gateway_image: images[1],
  };
  writeFileSync(
    `${artifacts}/terraform.tfvars.json`,
    JSON.stringify(variables, null, 2),
  );
  writeFileSync(
    `${artifacts}/deployment.json`,
    JSON.stringify(
      { organization, environment, revision, releases: releases(), images },
      null,
      2,
    ),
  );
  terraform("init", "-input=false", "-reconfigure", "-lockfile=readonly");
  terraform(
    "plan",
    "-input=false",
    "-lock-timeout=5m",
    `-var-file=${resolve(artifacts, "terraform.tfvars.json")}`,
    `-out=${resolve(artifacts, "deploy.tfplan")}`,
  );
  const plan = execFileSync(
    "terraform",
    [
      `-chdir=${directory}`,
      "show",
      "-no-color",
      resolve(artifacts, "deploy.tfplan"),
    ],
    { encoding: "utf8" },
  );
  writeFileSync(`${artifacts}/plan.txt`, plan);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${environment} deployment plan\n\nImages:\n\n${images.map((value) => `- \`${value}\``).join("\n")}\n\nDownload **cloud-run-plan** to review the full plan before approving the deployment.\n\n\`\`\`text\n${plan.slice(-25000)}\n\`\`\`\n`,
    );
} else {
  const saved = JSON.parse(
    readFileSync(`${artifacts}/deployment.json`, "utf8"),
  );
  assert.equal(saved.organization, organization);
  assert.equal(saved.environment, environment);
  assert.equal(
    saved.revision,
    process.env.GITHUB_SHA,
    "Plan belongs to another infrastructure revision",
  );
  terraform("init", "-input=false", "-reconfigure", "-lockfile=readonly");
  // Apply the exact reviewed binary plan. Do not regenerate it after approval.
  terraform(
    "apply",
    "-input=false",
    "-lock-timeout=5m",
    resolve(artifacts, "deploy.tfplan"),
  );
  const outputs = JSON.parse(
    execFileSync("terraform", [`-chdir=${directory}`, "output", "-json"], {
      encoding: "utf8",
    }),
  );
  writeFileSync(`${artifacts}/outputs.json`, JSON.stringify(outputs, null, 2));
  execFileSync(
    "node",
    ["scripts/smoke.ts", outputs.adapter_url.value, outputs.gateway_url.value],
    { stdio: "inherit" },
  );
}
