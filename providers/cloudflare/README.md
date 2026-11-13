# Cloudflare weather hosting

This directory owns hosted deployment of `ipma-weather`. The app owns its
Next/OpenNext build configuration, pinned tools and local-only `wrangler.toml`.
There is no custom Worker uploader or Terraform provisioner: the pipeline uses
the official Cloudflare Terraform provider and the app's standard OpenNext CLI.

## Ownership

| Owner             | Resources/settings                                                      |
| ----------------- | ----------------------------------------------------------------------- |
| Terraform         | KV namespace, with deletion protection                                  |
| OpenNext/Wrangler | Worker code, static assets, compatibility flags, bindings and variables |
| GitHub Actions    | Pinned source checkout, build artifact and manual deployment approval   |

Do not add the same Worker or binding to Terraform while Wrangler owns it.
OpenNext's deploy command populates the framework cache and then invokes
Wrangler. Terraform does not reproduce those framework steps.

## Existing staging installation

`weather/environments/staging.tfvars.json` records the current installation:

- Worker `ipma-weather`, at `https://ipma-weather.berna-agua.workers.dev`.
- Existing `NEXT_INC_CACHE_KV` namespace, adopted by a declarative Terraform import.
- Existing staging Cloud Run gateway URL.

The first apply should import the cache with no namespace creation or deletion.
Review `plan.txt` before approval. Cache contents are neither migrated nor erased.
`prevent_destroy` rejects a plan that would replace/delete the namespace.
No Worker code or cache data is modified by the plan/build jobs. Framework cache
population happens only in the approved deployment job.

If the app was connected to Cloudflare Workers Builds, disconnect that Git
integration in Worker Settings → Builds. GitHub Actions in this repository is
the deployment owner. The app's local Worker name intentionally does not match
the hosted name, and its publishing package scripts have been removed.

## Setup

The regular infra Nix shell supplies Node and Terraform. Install Bun 1.4.4 for
the app's pinned tools; the workflow installs that version automatically.

Reuse the existing `TF_CLOUD_ORGANIZATION` variable and `TF_API_TOKEN` Actions
secret. Add a repository Actions secret named `CLOUDFLARE_API_TOKEN`, scoped to
the selected account with Workers Scripts: Edit and Workers KV Storage: Edit.
Do not copy the locally cached Wrangler OAuth token into CI.

`ipma-weather` is private. The workflow checks out its pinned revision with the
standard checkout action and the `IPMA_WEATHER_DEPLOY_KEY` Actions secret. Its
public key is registered as a read-only deploy key on the app repository. The
regular Rust `sources` recipe only fetches the six public service/contract repos.

Create the two additional HCP state workspaces with the existing setup recipe:

```sh
rtk proxy env TF_CLOUD_ORGANIZATION=ipma-proxy npm run hcp:setup
```

They are `ipma-cloudflare-staging` and `ipma-cloudflare-production`, with local
execution and HCP state/locking. Cloud Run retains its own state workspaces.
The existing `staging` and `production` GitHub environments provide the required
reviewer and main-only deployment gates; `npm run github:setup` recreates them.

## Deploy

1. Commit and push app changes; update the full app revision in `releases.json`.
2. Push infra changes to `main` and run **Deploy Cloudflare weather**.
3. Download **cloudflare-weather-plan** and review `plan.txt`, source revisions,
   deployment inputs and the saved Worker build hash.
4. Approve the selected GitHub environment. The job applies the saved Terraform
   plan, restores the saved build, and runs OpenNext's deployment command.
5. The existing Workers browser regression suite runs against the deployed URL.

The workflow does not rebuild the app after approval. Hashes identify the saved
archive and Terraform plan; source revisions are checked in both jobs. The
provider lockfile is committed. A failed deployment can be retried only while
the saved Terraform plan is still valid; otherwise create and review a new run.

Production uses a separate Worker and new namespace. Before its first run,
configure the repository variable `IPMA_WEATHER_PRODUCTION_GRPC_URL` with its HTTPS native
gRPC gateway origin, or add `upstream_url` to production's checked-in tfvars.
The workflow uses that variable only for production.

For an equivalent local review using a dedicated API token, first clone the
private app into `.sources/ipma-weather` at its pinned revision in
`releases.json`, using your normal GitHub credentials:

```sh
rtk proxy npm ci --ignore-scripts
rtk proxy just sources
rtk proxy bun install --frozen-lockfile --cwd .sources/ipma-weather
rtk proxy env DEPLOY_ENVIRONMENT=staging npm run cloudflare:plan
rtk proxy env DEPLOY_ENVIRONMENT=staging npm run cloudflare:build
```

The commands require the normal HCP login (or token environment variable),
`TF_CLOUD_ORGANIZATION` and `CLOUDFLARE_API_TOKEN`. The build contacts the selected
gateway for Next prerendering. Deployment commands use generated Wrangler
configuration under `.artifacts/cloudflare/`; no hosted settings are read from
the app's local config. Do not commit generated artifacts or credentials.

To deploy a reviewed local build explicitly, use `npm run cloudflare:deploy`.
The shared GitHub workflow remains the normal approval path.

## Verify

```sh
rtk proxy just check
rtk proxy just cloudflare-terraform-check
```

Terraform tests mock Cloudflare. TypeScript tests check deployment bindings,
environment separation and the manual approval/artifact flow. The app's normal
CI retains its own lint/type/test/browser/build checks.
