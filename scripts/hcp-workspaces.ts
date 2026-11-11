import { workspace } from "./hcp.ts";

const organization = process.env.TF_CLOUD_ORGANIZATION;
if (!organization)
  throw new Error(
    "Set TF_CLOUD_ORGANIZATION to your HCP Terraform organization",
  );
for (const name of ["ipma-bootstrap", "ipma-staging", "ipma-production"]) {
  await workspace(organization, name, true);
  console.log(`${organization}/${name}: local execution, HCP state`);
}
