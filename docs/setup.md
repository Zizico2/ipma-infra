# Setup on Arch Linux

Docker and Compose are already installed and the Docker daemon is active on the
current host. Nix was absent when this environment was prepared. Install it using
Arch's [official package](https://archlinux.org/packages/extra/x86_64/nix/):

```sh
rtk proxy sudo pacman -Syu nix
rtk proxy sudo systemctl enable --now nix-daemon.socket
rtk proxy nix --version
```

From `/home/bernardo/Projects/ipma-infra`, enter the shell:

```sh
rtk proxy nix --extra-experimental-features 'nix-command flakes' develop
```

The first entry downloads the pinned tools and may build Terraform. The daemon
and `/nix` store belong to the system; the flake installs no cloud credentials.
If desired, enable flakes persistently by adding
`experimental-features = nix-command flakes` to `~/.config/nix/nix.conf`.
Optional direnv activation uses `.envrc`; install/hook direnv for your shell and
review the file before `direnv allow`. It is not required.

## Authenticate

Inside the Nix shell:

```sh
rtk proxy gcloud auth login --no-launch-browser
rtk proxy gcloud auth application-default login --no-launch-browser
rtk proxy terraform login
```

Follow each command's browser instructions yourself. `gcloud auth login` is for
CLI operations; Application Default Credentials are for the Terraform Google
provider. `terraform login` authenticates to HCP Terraform. Do not paste tokens,
authorization codes or credential files into chat or commit them.

After login, tell the agent that authentication is complete and supply the HCP
organization name. The agent can inspect available billing accounts, create a
dedicated project, link billing and bootstrap the infrastructure. If multiple
billing accounts or organization/folder policies apply, their selection must be
resolved before project creation. The bootstrap requires appropriate project,
billing, API-enablement and IAM permissions.

## HCP Terraform state

Create an HCP Terraform organization if you do not have one. Use three
CLI-driven workspaces with **Local** execution mode (not Remote or Agent):

```sh
rtk proxy env TF_CLOUD_ORGANIZATION=YOUR_ORGANIZATION npm run hcp:setup
```

This creates absent workspaces and checks existing ones without silently changing
their execution mode. State is isolated by workspace, not Terraform variable or
working directory. Neither root uses a GCS bucket. There is no existing deployed
local state to migrate in a new installation. If adopting existing resources,
follow [HashiCorp's migration procedure](https://developer.hashicorp.com/terraform/cloud-docs/migrate)
and review the migration prompt; never upload a fabricated empty state.

For existing HCP workspaces, Settings → General → Execution Mode must be Local.
HCP still supplies persistent state, locking and history. GitHub owns plan/apply
execution and its manual approval gate.

## Bootstrap

Set `project_id` and the immutable GitHub repository ID in an ignored
`providers/cloud-run/bootstrap/terraform.tfvars`, using the checked-in example.
The current repository ID is obtained with:

```sh
rtk proxy gh api repos/Zizico2/ipma-infra --jq .id
```

Initialize and review the bootstrap plan before applying it:

```sh
rtk proxy env TF_CLOUD_ORGANIZATION=YOUR_ORGANIZATION TF_WORKSPACE=ipma-bootstrap terraform -chdir=providers/cloud-run/bootstrap init
rtk proxy env TF_CLOUD_ORGANIZATION=YOUR_ORGANIZATION TF_WORKSPACE=ipma-bootstrap terraform -chdir=providers/cloud-run/bootstrap plan -out=bootstrap.tfplan
rtk proxy env TF_CLOUD_ORGANIZATION=YOUR_ORGANIZATION TF_WORKSPACE=ipma-bootstrap terraform -chdir=providers/cloud-run/bootstrap apply bootstrap.tfplan
```

Google API/IAM propagation can take time immediately after bootstrap. Re-run a
failed initialization after checking the error; do not weaken identity conditions.

## GitHub configuration

Set these **repository Actions variables**, using the `github_variables`
bootstrap output. They are identifiers, not credentials:

| Variable                         | Source                         |
| -------------------------------- | ------------------------------ |
| `GCP_PROJECT_ID`                 | Billing-enabled project ID     |
| `GCP_REGION`                     | `europe-southwest1` by default |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Bootstrap output               |
| `GCP_BUILD_SERVICE_ACCOUNT`      | Bootstrap output               |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | Bootstrap output               |
| `TF_CLOUD_ORGANIZATION`          | Your HCP organization          |

Set the **repository Actions secret** `TF_API_TOKEN` to an HCP token scoped to
the deployment workspaces with the required state read/write/locking access.
Prefer a dedicated team token where available. Enter it through GitHub Settings
or interactive `gh secret set TF_API_TOKEN --repo Zizico2/ipma-infra`, not a
command-line argument or committed environment file. No Google service-account
JSON key or Cloudflare token is needed.

The `staging` and `production` environment gates are configured by:

```sh
rtk proxy npm run github:setup
```

Dispatch the workflow only after bootstrap, HCP workspace setup and variable
configuration. Publishing images happens during the manually initiated plan job;
changing running services waits for environment approval. Plans expire after
three days. Re-run the workflow if a plan is stale; don't re-plan inside apply.

## Rollback and cleanup

For a reviewed rollback, restore the desired source pins in `releases.json`,
commit them and run the same deployment workflow. Each run uses new immutable
registry tags and deploys resolved digests. This avoids Terraform/state drift
from an out-of-band platform rollback.

To remove an environment, use its HCP workspace and review a Terraform destroy
plan locally. Do not destroy the bootstrap identities/registry first. Images,
build logs and HCP state history remain until explicitly cleaned up; deleting
running services is not equivalent to closing the cloud project.
