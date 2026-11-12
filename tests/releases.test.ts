import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  releases,
  validateReleases,
  checkProtoPins,
  services,
  serviceConfig,
} from "../scripts/releases.ts";

test("release pins reject floating refs and unintended source repositories", () => {
  const manifest = releases();
  assert.doesNotThrow(() => validateReleases(manifest));
  assert.throws(() =>
    validateReleases({
      ...manifest,
      "ipma-proxy": { ...manifest["ipma-proxy"], revision: "main" },
    }),
  );
  assert.throws(() =>
    validateReleases({
      ...manifest,
      "ipma-gateway": {
        ...manifest["ipma-gateway"],
        repository: "https://example.org/untrusted.git",
      },
    }),
  );
});

test("each service pair pins its own contract and rejects cross-pair pins and overrides", () => {
  const manifest = releases();
  const root = mkdtempSync(join(tmpdir(), "ipma-pins-"));
  const cargo = (name: (typeof services)[number]) => {
    const proto = serviceConfig[name].proto;
    return `${proto} = { git = "${manifest[proto].repository}", rev = "${manifest[proto].revision}" }\n`;
  };
  try {
    for (const name of services) {
      mkdirSync(`${root}/${name}`);
      writeFileSync(`${root}/${name}/Cargo.toml`, cargo(name));
    }
    assert.doesNotThrow(() => checkProtoPins(root, manifest));
    for (const name of services) {
      const path = `${root}/${name}/Cargo.toml`;
      const other = name.includes("public-data")
        ? "ipma-proxy"
        : "ipma-public-data-proxy";
      writeFileSync(path, cargo(other));
      assert.throws(() => checkProtoPins(root, manifest));
      writeFileSync(path, cargo(name) + "[patch.crates-io]\n");
      assert.throws(() => checkProtoPins(root, manifest));
      writeFileSync(path, cargo(name));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Compose exposes independent pairs and routes gateways to their matching adapters", () => {
  const config = parse(readFileSync("compose.yaml", "utf8"));
  assert.equal(Object.keys(config.services).length, 4);
  const pairs = [
    {
      adapter: "adapter",
      gateway: "gateway",
      prefix: "IPMA_GATEWAY",
      ports: [50051, 50052],
    },
    {
      adapter: "public-data-adapter",
      gateway: "public-data-gateway",
      prefix: "IPMA_PUBLIC_DATA_GATEWAY",
      ports: [50053, 50054],
    },
  ];
  for (const pair of pairs) {
    const adapter = config.services[pair.adapter],
      gateway = config.services[pair.gateway];
    assert.equal(
      gateway.environment[`${pair.prefix}_UPSTREAM_ADDRESS`],
      `http://${pair.adapter}:8080`,
    );
    assert.deepEqual(gateway.depends_on, [pair.adapter]);
    assert.deepEqual(adapter.ports, [`127.0.0.1:${pair.ports[0]}:8080`]);
    assert.deepEqual(gateway.ports, [`127.0.0.1:${pair.ports[1]}:8080`]);
  }
  assert.equal(
    new Set(Object.values(serviceConfig).map((v) => v.image)).size,
    4,
  );
});
