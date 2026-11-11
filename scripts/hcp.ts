import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

export function token(): string {
  if (process.env.TF_TOKEN_app_terraform_io)
    return process.env.TF_TOKEN_app_terraform_io;
  try {
    const config = JSON.parse(
      readFileSync(`${homedir()}/.terraform.d/credentials.tfrc.json`, "utf8"),
    );
    const value = config.credentials?.["app.terraform.io"]?.token;
    assert(typeof value === "string" && value.length > 0);
    return value;
  } catch {
    throw new Error("Run terraform login or provide TF_TOKEN_app_terraform_io");
  }
}

export async function workspace(
  organization: string,
  name: string,
  create = false,
) {
  assert.match(organization, /^[a-zA-Z0-9_-]+$/);
  assert.match(name, /^ipma-(bootstrap|staging|production)$/);
  const headers = {
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/vnd.api+json",
  };
  let response = await fetch(
    `https://app.terraform.io/api/v2/organizations/${organization}/workspaces/${name}`,
    { headers },
  );
  if (response.status === 404 && create) {
    response = await fetch(
      `https://app.terraform.io/api/v2/organizations/${organization}/workspaces`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "workspaces",
            attributes: {
              name,
              "execution-mode": "local",
              "auto-apply": false,
            },
          },
        }),
      },
    );
  }
  if (!response.ok)
    throw new Error(`HCP workspace ${name}: HTTP ${response.status}`);
  const data = (await response.json()) as {
    data: { attributes: Record<string, unknown> };
  };
  assert.equal(
    data.data.attributes["execution-mode"],
    "local",
    `${name}: set execution mode to Local before using this pipeline`,
  );
}
