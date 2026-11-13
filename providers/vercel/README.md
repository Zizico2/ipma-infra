# Vercel weather hosting

This directory deploys the pinned `ipma-weather` Next.js app to Vercel's Node.js
runtime. The Rust adapters/gateways stay on Cloud Run. The app calls its gateway
with native HTTP/2 gRPC; no gRPC-Web bridge, OpenNext adapter, Workers patches or
KV cache is involved. Vercel manages the Next.js framework cache.

## Setup

1. Create a Vercel project for the app, using Next.js, Node.js 24 and Bun 1.4.4.
   The app pins its package manager and Node version. Choose a function region
   close to the Cloud Run gateway (currently Madrid). Leave the framework build
   and output settings at their defaults.
2. Set `IPMA_GRPC_URL` in both **Preview** and **Production** Vercel environments
   to the corresponding HTTPS native gRPC gateway origin. It must have no path,
   query or credentials. It is server-only. The build also needs gateway access
   to prerender Lisbon. Existing staging gateway settings can be recovered from
   the pre-migration `providers/cloudflare/weather/environments/staging.tfvars.json`
   in Git history.
3. Set repository Actions variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and
   the Actions secret `VERCEL_TOKEN`. Both jobs use these same project IDs.
   The build job needs the token to pull settings; the environment-gated deploy
   job uses it to upload the reviewed output. Keep the token repository-scoped
   so it is available before the deployment approval.
4. Keep the existing `IPMA_WEATHER_DEPLOY_KEY` read-only deploy-key secret for
   checkout of the private app. No sibling checkout is required.
5. For protected Preview deployments, set Vercel's automation bypass secret as
   the GitHub environment secret `VERCEL_AUTOMATION_BYPASS_SECRET`. Browser
   checks send the official bypass header. Production can use the same mechanism
   if protected. Do not disable deployment protection to make tests pass.
6. Retain the existing `staging` and `production` GitHub environments, with their
   required reviewer and main-only deployment rules (`npm run github:setup`).

The app's `vercel.json` disables automatic Git deployments so a connected Git
integration cannot bypass the infra approval gate. Do not deploy from the app's
repository independently of this pipeline.

## Review and deploy

1. Merge the companion app PR, then keep its exact commit pinned in `releases.json`.
   Use a merge strategy preserving that commit, or update the pin to the resulting
   squash/rebase commit before merging the infra PR.
2. Manually dispatch **Deploy Vercel weather** on `main`, selecting staging or
   production. Staging maps to Vercel **Preview**, production to **Production**.
3. The build job runs `vercel pull`, validates the backend origin and runs
   `vercel build --standalone --environment=preview` (or `--environment=production`). Review the job summary and
   **vercel-weather-build** artifact: source revisions, target, project, backend
   origin and output SHA-256 are recorded in `release.json`.
4. Approve the selected GitHub environment. Deploy validates the source/project/
   target and archive hash, restores the reviewed `.vercel/output` and project
   identity, then runs `vercel deploy --prebuilt`. It supplies the reviewed backend
   URL as a runtime environment override so build and runtime use the same gateway.
5. The deployed-site Chromium suite verifies streaming, concurrent prefetches,
   navigation and reuse of visited cities. The deployment URL is attached to the
   GitHub environment. Staging uses its generated Preview URL; production uses
   the project's configured production domains.

The target is explicit in both build and deploy commands. Vercel assigns a new
project's first deployment to Production. With an explicit Preview target, the
CLI refuses that implicit promotion: bootstrap a new project through a separately
reviewed Production deployment with its Production backend configured, then run
staging. Do not remove the explicit target or retry staging with `--prod` to get
past this check. The existing `ipma-weather` project is already bootstrapped.

No rebuild or `vercel pull` happens after approval. The standalone output inlines
traced dependencies for portability. The archive includes only `.vercel/output` and
`.vercel/project.json`; pulled `.env` files are excluded. Other Vercel project
runtime variables are resolved by Vercel at deployment time. This app currently
only requires `IPMA_GRPC_URL`.

Use the locked CLI through `npm run vercel:build` and `npm run vercel:deploy` for
an explicitly authorized local deployment. Both need the project/token variables,
`DEPLOY_ENVIRONMENT`, and a clean app checkout at `.sources/ipma-weather` matching
`releases.json`. The standard path is the gated GitHub workflow.

## Cloudflare cutover and retirement

The migration PR removes the old deploy workflow, local adapter, Terraform
configuration and creation of Cloudflare HCP workspaces. It does **not** delete
any live Worker, namespace, DNS entry or Terraform state. Cloud Run state and
resources are independent and remain active.

Deploy and validate Vercel staging first, then production. Move any custom
weather domain to the Vercel project using Vercel's domain setup instructions.
If the old address was only `workers.dev`, distribute the new domain/URL;
that hostname cannot be transferred to Vercel. Keep the old Worker available
until consumers have switched and Vercel production has been validated.

After cutover, disable any remaining Cloudflare Workers Builds integration and
explicitly retire the old Worker and its `NEXT_INC_CACHE_KV` namespace. The old
namespace had Terraform `prevent_destroy`; for Terraform-managed cleanup,
restore the pre-migration configuration in a separate checkout and review a
cleanup plan with that protection deliberately removed. Do not run destroy on
Cloud Run workspaces. Retain/export the `ipma-cloudflare-staging` and
`ipma-cloudflare-production` HCP state until cleanup is reconciled; the new
`hcp:setup` no longer creates them. Remove the unused Cloudflare Actions token
and obsolete weather gateway variable only after retirement.

Rollback before retirement is a domain switch back to the existing Worker.
To update its code, restore the previous infra/app revisions; the Vercel pipeline
cannot rebuild a Worker. Vercel deployments can be rolled back in Vercel normally.

## Verify

`npm run check`, `npm run fmt:check` and `just verify` cover orchestration,
workflow gating and the remaining Cloud Run Terraform. Tests reject wrong targets,
backend origins, source/project mismatches and modified artifacts. App CI checks
lint, types, mapping/API tests, native gRPC fixture browser tests, production build
and browser bundle isolation. A real Vercel build/deployment requires configured
project credentials and is performed by the manually dispatched workflow.

Official references: [Vercel CLI build](https://vercel.com/docs/cli/build),
[prebuilt deploy](https://vercel.com/docs/cli/deploy),
[GitHub Actions integration](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel),
[automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
