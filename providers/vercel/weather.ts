import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { releases } from "../../scripts/releases.ts";

export function target(environment: string) {
  assert(
    ["staging", "production"].includes(environment),
    "Invalid deployment environment",
  );
  return environment === "production" ? "production" : "preview";
}

export function upstreamOrigin(value: string | undefined) {
  assert(value, "Set IPMA_GRPC_URL in the Vercel target environment");
  const url = new URL(value);
  assert(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
    "IPMA_GRPC_URL must be an HTTPS native gRPC origin without credentials, path or query",
  );
  return url.origin;
}

export function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyRelease(
  saved: Record<string, unknown>,
  expected: Record<string, string>,
  archive: string,
) {
  for (const [key, value] of Object.entries(expected))
    assert.equal(saved[key], value, `Release ${key} does not match`);
  assert.equal(
    saved.buildSha256,
    sha256(archive),
    "Artifact differs from reviewed build",
  );
  return upstreamOrigin(saved.upstreamUrl as string);
}

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const mode = process.argv[2];
  assert(["build", "deploy"].includes(mode), "Use build or deploy");
  const environment = process.env.DEPLOY_ENVIRONMENT ?? "staging";
  const deploymentTarget = target(environment);
  const orgId = process.env.VERCEL_ORG_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const token = process.env.VERCEL_TOKEN;
  assert(
    orgId && projectId && token,
    "Set VERCEL_ORG_ID, VERCEL_PROJECT_ID and VERCEL_TOKEN",
  );
  const app = resolve(".sources/ipma-weather");
  const artifacts = resolve(`.artifacts/vercel/${environment}`);
  const archive = `${artifacts}/weather.tar.gz`;
  const manifest = `${artifacts}/release.json`;
  const expected = {
    environment,
    target: deploymentTarget,
    orgId,
    projectId,
    infraRevision: git("rev-parse", "HEAD"),
    appRevision: releases()["ipma-weather"].revision,
  };
  assert.equal(git("-C", app, "rev-parse", "HEAD"), expected.appRevision);
  assert.equal(
    git("-C", app, "status", "--porcelain", "--untracked-files=normal"),
    "",
    "Pinned app checkout has source changes",
  );
  mkdirSync(artifacts, { recursive: true });
  const cli = resolve("node_modules/vercel/dist/vc.js");
  const vercel = (args: string[], capture = false) => {
    // spawnSync lets us report failures without echoing the token in command arguments.
    const result = spawnSync(
      process.execPath,
      [cli, ...args, "--token", token],
      {
        cwd: app,
        env: process.env,
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      },
    );
    assert.equal(result.status, 0, `Vercel ${args[0]} failed`);
    return result.stdout?.trim();
  };
  const production = deploymentTarget === "production" ? ["--prod"] : [];

  if (mode === "build") {
    vercel(["pull", "--yes", `--environment=${deploymentTarget}`]);
    const project = JSON.parse(
      readFileSync(`${app}/.vercel/project.json`, "utf8"),
    );
    assert.equal(project.orgId, orgId);
    assert.equal(project.projectId, projectId);
    const env = parseEnv(
      readFileSync(`${app}/.vercel/.env.${deploymentTarget}.local`, "utf8"),
    );
    const upstreamUrl = upstreamOrigin(env.IPMA_GRPC_URL);
    // Keep local shell overrides from changing the reviewed build's backend.
    process.env.IPMA_GRPC_URL = upstreamUrl;
    vercel(["build", "--standalone", ...production]);
    // Save the standalone output so deployment needs no rebuild on a new runner.
    // Never archive pulled .env files or the entire .vercel directory.
    execFileSync(
      "tar",
      ["-czf", archive, ".vercel/output", ".vercel/project.json"],
      {
        cwd: app,
        stdio: "inherit",
      },
    );
    writeFileSync(
      manifest,
      JSON.stringify(
        { ...expected, upstreamUrl, buildSha256: sha256(archive) },
        null,
        2,
      ),
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Vercel ${environment}\n\nReview **vercel-weather-build** before approval.\n\nApp: \`${expected.appRevision}\`\n\nTarget: \`${deploymentTarget}\`\n\nProject: \`${projectId}\`\n\nBackend: ${upstreamUrl}\n\nBuild SHA-256: \`${sha256(archive)}\`\n`,
      );
  } else {
    const saved = JSON.parse(readFileSync(manifest, "utf8"));
    const upstreamUrl = verifyRelease(saved, expected, archive);
    execFileSync("tar", ["-xzf", archive], { cwd: app, stdio: "inherit" });
    const url = vercel(
      [
        "deploy",
        "--prebuilt",
        "--yes",
        ...production,
        "--env",
        `IPMA_GRPC_URL=${upstreamUrl}`,
      ],
      true,
    );
    assert(
      url && /^https:\/\/[a-zA-Z0-9.-]+$/.test(url),
      "Vercel did not return a deployment URL",
    );
    console.log(url);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `deployment_url=${url}\n`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
