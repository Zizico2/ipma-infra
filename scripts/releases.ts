import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const services = ["ipma-proxy", "ipma-gateway"] as const;
export const projects = [...services, "ipma-proto"] as const;
export type Project = (typeof projects)[number];
export type Releases = Record<
  Project,
  { repository: string; revision: string }
>;

export function validateReleases(value: unknown): Releases {
  assert(value && typeof value === "object", "Invalid releases manifest");
  const data = value as Releases;
  assert.deepEqual(Object.keys(data).sort(), [...projects].sort());
  for (const name of projects) {
    assert.equal(
      data[name]?.repository,
      `https://github.com/Zizico2/${name}.git`,
    );
    assert.match(
      data[name]?.revision,
      /^[a-f0-9]{40}$/,
      `${name}: use a full commit SHA`,
    );
  }
  return data;
}

export function releases(): Releases {
  return validateReleases(JSON.parse(readFileSync("releases.json", "utf8")));
}

export function checkProtoPins(root: string, manifest: Releases): void {
  for (const name of services) {
    const cargo = readFileSync(`${root}/${name}/Cargo.toml`, "utf8");
    assert(
      cargo.includes(`rev = "${manifest["ipma-proto"].revision}"`),
      `${name}: shared API pin differs`,
    );
    assert(
      !cargo.includes('[patch."https://github.com/Zizico2/ipma-proto.git"]'),
      `${name}: local API override`,
    );
  }
}
