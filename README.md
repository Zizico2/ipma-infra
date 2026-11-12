# ipma-infra

Portable deployment of [ipma-proxy](https://github.com/Zizico2/ipma-proxy) and
[ipma-gateway](https://github.com/Zizico2/ipma-gateway), using their shared
[protobuf API](https://github.com/Zizico2/ipma-proto). The independent [public-data proxy](https://github.com/Zizico2/ipma-public-data-proxy)
and [public-data gateway](https://github.com/Zizico2/ipma-public-data-gateway)
use [their own protobuf API](https://github.com/Zizico2/ipma-public-data-proto)
for IPMA website feeds. Cloud Run is the first
deployment target. Moka remains the gateway's local, disposable cache.

The same four OCI images and native gRPC smoke tests can be used on Cloudflare
Containers, Koyeb, a regional container host, or a local machine. Runtime code
has no Google SDK dependency. Provider resources and deployment orchestration
live under `providers/cloud-run/`; no Terraform provider is abstracted behind
an artificial cross-cloud API.

```text
documented API: client -> gateway -> adapter -> IPMA /open-data/
website feeds:  client -> public-data-gateway -> public-data-adapter -> IPMA /public-data/
Each gateway owns an independent local Moka cache.
```

All four services are independently reachable for benchmarking. The initial API is
public and unauthenticated; an organization policy forbidding `allUsers` invokers
requires an authentication design before deployment. The gateway's upstream URI
is ordinary configuration, not a Google service-discovery dependency.

## Development environment

The locked [Nix flake](flake.nix) includes Node, Terraform, `gcloud`, GitHub CLI,
Docker client/Compose/Buildx, Just, workflow/container/shell linters and Nix tools.
It uses [gcloud-nix](https://github.com/nicknovitski/gcloud-nix) through its
documented `make-shell` module. It supports Linux on x86-64/ARM64 and Apple Silicon macOS.
Container images target Linux AMD64. A working Docker daemon is a host prerequisite.

See [Arch Linux installation and login](docs/setup.md) before provisioning.
No login, package installation or cloud mutation occurs when entering the shell.
Google and HCP credentials stay in their normal user configuration directories,
outside the repository and Nix store. Only Terraform is allowed as an unfree Nix
package. The committed `flake.lock` pins all inputs; updates are explicit.

From this directory:

```sh
rtk proxy nix --extra-experimental-features 'nix-command flakes' develop
rtk proxy npm ci --ignore-scripts
rtk proxy just verify
rtk proxy just sources
rtk proxy just images
rtk proxy just up
rtk proxy just smoke
rtk proxy just down
```

The smoke test contacts IPMA for a small number of forecasts and checks adapter
freshness, gateway cache reuse across differing ingress headers, and bypass for
application metadata. Use `releases.json` to adopt exact source commits. Source
fetching checks that each service pair pins its own shared API revision and has no
local API overrides. No sibling checkout is required.

## Cloud Run and manual deployment

Cloud resources have **not** been provisioned just by creating this repository.

1. Bootstrap a billing-enabled project, Artifact Registry and GitHub OIDC
   identities using [the setup guide](docs/setup.md).
2. HCP Terraform holds state in three workspaces: `ipma-bootstrap`,
   `ipma-staging`, `ipma-production`. Set their execution mode to **Local**:
   Terraform runs here or in Actions, while HCP owns state and locking.
3. Configure the documented GitHub variables and HCP token secret.
4. Manually dispatch **Deploy Cloud Run** from `main` for staging or production.
5. The plan job builds and tests images, publishes them, and uploads the binary
   Terraform plan, readable diff, source pins and image digests.
6. Review **cloud-run-plan**, then approve the environment deployment. The apply
   job uses the exact saved plan, then runs the same gRPC smoke test remotely.

Staging and production have required-reviewer gates and allow deployments only
from `main`. The repository owner may approve their own manually triggered run;
administrator bypass is disabled. Run `npm run github:setup` to recreate these
rules after copying the repository. Cloud authentication uses short-lived OIDC,
restricted by immutable repository ID, owner ID, workflow and branch. The build
identity can publish images/read deployment resources; only the gated deploy
identity can modify Cloud Run services.

Defaults are Madrid, minimum zero instances, maximum two **per service**, one
vCPU/512 MiB each and request-based billing. Scaling limits are not a hard spend
cap. Registries, logs, requests and egress can still cost money. There is no
external load balancer, NAT gateway, database or remote cache in this baseline.
Logs go to stdout/stderr; platform request metrics/logs come from Cloud Run.
See [benchmarking and portability](docs/portability.md).

## Runtime configuration

| Setting  | Adapter                                              | Gateway                                                  |
| -------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `PORT`   | 8080                                                 | 8080                                                     |
| Protocol | Cleartext HTTP/2 inside the platform; TLS at ingress | Same                                                     |
| Upstream | `IPMA_PROXY_UPSTREAM_BASE_URL`, defaults to IPMA     | `IPMA_GATEWAY_UPSTREAM_ADDRESS`, required for deployment |
| Cache    | None                                                 | `IPMA_GATEWAY_CACHE_MIB`, default 64                     |
| Logs     | `RUST_LOG`                                           | `RUST_LOG`                                               |

The portable entrypoint maps `PORT` to the existing Rust listen-address variable
and execs the service under Tini for signal handling. Explicit listen-address
overrides remain available. Cloud Run adds a provider-specific list of trusted
ingress/tracing metadata via `IPMA_GATEWAY_CACHE_NEUTRAL_METADATA`. Those headers
are forwarded but do not bypass caching. Credentials, tenant IDs and other
application context remain isolated. Other providers should supply their own
reviewed list, rather than disabling metadata isolation.

## Independent website-feed deployment

Compose builds all four services. Existing ports stay 50051 (adapter) and 50052
(gateway); website feeds use 50053 and 50054. The default `npm run smoke` verifies
both contracts, including actual hourly forecast rows, catalogue/warning RPCs,
cache reuse across ingress headers and caller-context bypass. Two explicit URLs
check only the documented pair; four explicit URLs check both pairs.
`npm run benchmark -- URL GetForecast 20` selects the website-feed contract;
`IPMA_PUBLIC_DATA=1` selects that contract for Ping benchmarks.

`releases.json` pins six repositories. Each service pair pins its matching proto
repository with no local overrides. The container build remains generic and can
build any of the four Rust binaries from immutable source checkouts.

Cloud Run adds `ipma-public-data-adapter-ENV` and `ipma-public-data-gateway-ENV`,
with independent runtime identities, health service names and upstream wiring.
Existing Terraform resource addresses and source pins remain intact. Reapply the
bootstrap configuration before deploying the expanded app to create the two new
runtime identities and allow the gated deploy identity to use them. No cloud
resources are changed by local validation. Both new services use the same bounded
scale-to-zero defaults; this increases the total possible service instances.

The public-data gateway's cache budget is independently configurable through
`public_data_cache_mib` (default 64). Cloud outputs include
`public_data_adapter_url` and `public_data_gateway_url`; image variables likewise
use `public_data_adapter_image` and `public_data_gateway_image`. Deployment plans
publish and record all four immutable image digests, and post-apply smoke checks
both pairs. The existing plan/apply approval boundary is unchanged.

Container configuration uses `IPMA_PUBLIC_DATA_PROXY_LISTEN_ADDR` and
`IPMA_PUBLIC_DATA_GATEWAY_LISTEN_ADDR` for PORT mapping. The gateway takes
`IPMA_PUBLIC_DATA_GATEWAY_UPSTREAM_ADDRESS` and the same timeout/cache/metadata
options as the documented gateway, under the `IPMA_PUBLIC_DATA_GATEWAY_` prefix.
The adapter defaults to `https://api.ipma.pt/public-data/`, overridable with
`IPMA_PUBLIC_DATA_PROXY_UPSTREAM_BASE_URL`.
