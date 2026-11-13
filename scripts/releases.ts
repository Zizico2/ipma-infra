import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const services = [
  "ipma-proxy",
  "ipma-gateway",
  "ipma-public-data-proxy",
  "ipma-public-data-gateway",
] as const;
export const protoProjects = ["ipma-proto", "ipma-public-data-proto"] as const;
export const serviceConfig = {
  "ipma-proxy": { proto: "ipma-proto", image: "adapter" },
  "ipma-gateway": { proto: "ipma-proto", image: "gateway" },
  "ipma-public-data-proxy": {
    proto: "ipma-public-data-proto",
    image: "public-data-adapter",
  },
  "ipma-public-data-gateway": {
    proto: "ipma-public-data-proto",
    image: "public-data-gateway",
  },
} as const;
export const projects = [
  ...services,
  ...protoProjects,
  "ipma-weather",
] as const;
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
    const proto = serviceConfig[name].proto;
    const cargo = readFileSync(`${root}/${name}/Cargo.toml`, "utf8");
    const dependency = cargo
      .split("\n")
      .find((line) => line.startsWith(`${proto} = `));
    assert(
      dependency?.includes(`git = "${manifest[proto].repository}"`) &&
        dependency.includes(`rev = "${manifest[proto].revision}"`) &&
        !dependency.includes("path ="),
      `${name}: ${proto} pin differs`,
    );
    assert(
      !/\[patch(?:\.|\])|\[replace\]/.test(cargo),
      `${name}: API override`,
    );
  }
}
