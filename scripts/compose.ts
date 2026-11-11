import { spawnSync } from "node:child_process";
import { releases } from "./releases.ts";

const pins = releases();
// Docker's Nix wrapper supplies the Compose and Buildx plugin search paths.
const result = spawnSync("docker", ["compose", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ADAPTER_REVISION: pins["ipma-proxy"].revision,
    GATEWAY_REVISION: pins["ipma-gateway"].revision,
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
