set positional-arguments

default:
    @just --list

sources:
    npm run sources

check:
    npm run check
    npm run fmt:check
    terraform fmt -recursive -check providers
    actionlint
    shellcheck containers/entrypoint.sh
    hadolint containers/Dockerfile

terraform-check:
    terraform -chdir=providers/cloud-run/bootstrap init -backend=false -input=false -lockfile=readonly
    terraform -chdir=providers/cloud-run/bootstrap validate
    terraform -chdir=providers/cloud-run/app init -backend=false -input=false -lockfile=readonly
    terraform -chdir=providers/cloud-run/app validate
    terraform -chdir=providers/cloud-run/app test

images:
    npm run compose -- build

up:
    npm run compose -- up -d

down:
    npm run compose -- down

smoke *args:
    npm run smoke -- "$@"

benchmark *args:
    npm run benchmark -- "$@"

verify: check terraform-check

# Authenticate only when explicitly invoked; shell entry never performs login.
login:
    gcloud auth login --no-launch-browser
    gcloud auth application-default login --no-launch-browser
    terraform login
