import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import {
  sha256,
  target,
  upstreamOrigin,
  verifyRelease,
} from "../providers/vercel/weather.ts";

test("staging never selects Vercel Production; invalid environments fail closed", () => {
  assert.equal(target("staging"), "preview");
  assert.equal(target("production"), "production");
  assert.throws(() => target("prod"));
});

test("build requires a native HTTPS gateway origin", () => {
  assert.equal(
    upstreamOrigin("https://gateway.example.com:443/"),
    "https://gateway.example.com",
  );
  for (const value of [
    undefined,
    "http://localhost:50051",
    "https://user:secret@example.com",
    "https://example.com/api",
    "https://example.com?key=value",
    "https://example.com#fragment",
  ])
    assert.throws(() => upstreamOrigin(value));
});

test("deploy refuses tampered builds and mismatched source, project or environment", () => {
  const root = mkdtempSync(join(tmpdir(), "ipma-vercel-"));
  try {
    const archive = join(root, "weather.tar.gz");
    writeFileSync(archive, "reviewed artifact");
    const expected = {
      environment: "staging",
      target: "preview",
      orgId: "team_one",
      projectId: "prj_one",
      appRevision: "a".repeat(40),
      infraRevision: "b".repeat(40),
    };
    const saved = {
      ...expected,
      buildSha256: sha256(archive),
      upstreamUrl: "https://gateway.example.com",
    };
    assert.equal(verifyRelease(saved, expected, archive), saved.upstreamUrl);
    for (const key of Object.keys(expected))
      assert.throws(() =>
        verifyRelease({ ...saved, [key]: "different" }, expected, archive),
      );
    assert.throws(() =>
      verifyRelease(
        { ...saved, upstreamUrl: "http://localhost" },
        expected,
        archive,
      ),
    );
    writeFileSync(archive, "modified artifact");
    assert.throws(
      () => verifyRelease(saved, expected, archive),
      /Artifact differs/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Vercel deployment keeps the approval gate and downloads the reviewed build", () => {
  const workflow = parse(
    readFileSync(".github/workflows/vercel-weather.yml", "utf8"),
  );
  assert.equal(workflow.jobs.deploy.needs, "build");
  assert.equal(
    workflow.jobs.deploy.environment.name,
    "${{ inputs.environment }}",
  );
  assert.equal(workflow.jobs.build.if, "github.ref == 'refs/heads/main'");
  assert(!workflow.on.push);
  const steps = workflow.jobs.deploy.steps;
  assert(
    steps.some((s: { uses?: string }) =>
      s.uses?.startsWith("actions/download-artifact@"),
    ),
  );
  assert(!steps.some((s: { run?: string }) => s.run?.includes("vercel:build")));
  assert(
    steps.some((s: { run?: string }) => s.run === "npm run vercel:deploy"),
  );
});

test("build output transfers to a fresh runner without pulled secrets or rebuilding", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "ipma-vercel-flow-"));
  try {
    const app = join(root, ".sources/ipma-weather");
    mkdirSync(app, { recursive: true });
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const commit = (cwd: string) => {
      git(cwd, "init", "--quiet");
      git(cwd, "add", ".");
      git(
        cwd,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      );
      return git(cwd, "rev-parse", "HEAD");
    };
    writeFileSync(join(app, ".gitignore"), ".vercel/\n");
    const appRevision = commit(app);
    const manifest = JSON.parse(readFileSync("releases.json", "utf8"));
    manifest["ipma-weather"].revision = appRevision;
    writeFileSync(join(root, "releases.json"), JSON.stringify(manifest));
    writeFileSync(
      join(root, ".gitignore"),
      ".sources/\n.artifacts/\nnode_modules/\ncalls.jsonl\n",
    );
    commit(root);
    const cli = join(root, "node_modules/vercel/dist");
    mkdirSync(cli, { recursive: true });
    writeFileSync(
      join(cli, "vc.js"),
      `
      const { mkdirSync, writeFileSync, appendFileSync, readFileSync } = require('node:fs');
      const assert = require('node:assert/strict');
      const args = process.argv.slice(2);
      appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
      if (args[0] === 'pull') {
        mkdirSync('.vercel', { recursive: true });
        writeFileSync('.vercel/project.json', JSON.stringify({ orgId: process.env.VERCEL_ORG_ID, projectId: process.env.VERCEL_PROJECT_ID }));
        writeFileSync('.vercel/.env.preview.local', 'IPMA_GRPC_URL=https://gateway.example.com\\nSECRET=must-not-be-archived\\n');
      } else if (args[0] === 'build') {
        assert(args.includes('--standalone'));
        assert(!args.includes('--prod'));
        assert.equal(process.env.IPMA_GRPC_URL, 'https://gateway.example.com');
        mkdirSync('.vercel/output', { recursive: true });
        writeFileSync('.vercel/output/config.json', JSON.stringify({ version: 3 }));
      } else if (args[0] === 'deploy') {
        assert(args.includes('--prebuilt'));
        assert(!args.includes('--prod'));
        assert(args.includes('IPMA_GRPC_URL=https://gateway.example.com'));
        assert.equal(JSON.parse(readFileSync('.vercel/output/config.json')).version, 3);
        console.log('https://weather-test.vercel.app');
      } else { throw new Error('Unexpected command'); }
    `,
    );
    const script = resolve("providers/vercel/weather.ts");
    const env = {
      ...process.env,
      DEPLOY_ENVIRONMENT: "staging",
      VERCEL_ORG_ID: "team_test",
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TOKEN: "test_token",
      IPMA_GRPC_URL: "https://wrong-shell-override.example.com",
      CALLS: join(root, "calls.jsonl"),
      GITHUB_OUTPUT: "",
      GITHUB_STEP_SUMMARY: "",
    };
    const run = (mode: string) =>
      execFileSync(process.execPath, [script, mode], {
        cwd: root,
        env,
        encoding: "utf8",
      });
    run("build");
    const archive = join(root, ".artifacts/vercel/staging/weather.tar.gz");
    const files = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
    assert(files.includes(".vercel/output/config.json"));
    assert(files.includes(".vercel/project.json"));
    assert(!files.includes(".env"));
    // Model a new deployment runner with no output or pulled environment files.
    rmSync(join(app, ".vercel"), { recursive: true });
    assert.equal(run("deploy").trim(), "https://weather-test.vercel.app");
    const calls = readFileSync(env.CALLS, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)[0]);
    assert.deepEqual(calls, ["pull", "build", "deploy"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
