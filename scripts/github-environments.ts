import { execFileSync } from "node:child_process";

const repo = "Zizico2/ipma-infra";
const gh = (...args: string[]) =>
  execFileSync("gh", args, { encoding: "utf8" });
const user = JSON.parse(gh("api", "users/Zizico2")) as { id: number };
for (const name of ["staging", "production"]) {
  execFileSync(
    "gh",
    [
      "api",
      "--method",
      "PUT",
      `repos/${repo}/environments/${name}`,
      "--input",
      "-",
    ],
    {
      input: JSON.stringify({
        reviewers: [{ type: "User", id: user.id }],
        prevent_self_review: false,
        can_admins_bypass: false,
        wait_timer: 0,
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
      }),
      stdio: ["pipe", "ignore", "inherit"],
    },
  );
  const policies = JSON.parse(
    gh("api", `repos/${repo}/environments/${name}/deployment-branch-policies`),
  );
  if (
    !policies.branch_policies.some(
      (policy: { name: string }) => policy.name === "main",
    )
  ) {
    execFileSync(
      "gh",
      [
        "api",
        "--method",
        "POST",
        `repos/${repo}/environments/${name}/deployment-branch-policies`,
        "--input",
        "-",
      ],
      {
        input: JSON.stringify({ name: "main", type: "branch" }),
        stdio: ["pipe", "ignore", "inherit"],
      },
    );
  }
  console.log(
    `${name}: required reviewer, main only, administrator bypass disabled`,
  );
}
