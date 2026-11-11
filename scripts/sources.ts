import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { checkProtoPins, projects, releases } from "./releases.ts";

const manifest = releases();
mkdirSync(".sources", { recursive: true });
for (const name of projects) {
  const directory = `.sources/${name}`;
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", directory, ...args], { stdio: "inherit" });
  git("init", "--quiet");
  git("remote", "add", "origin", manifest[name].repository);
  git("fetch", "--quiet", "--depth=1", "origin", manifest[name].revision);
  git("checkout", "--quiet", "--detach", manifest[name].revision);
  console.log(`${name}: ${manifest[name].revision}`);
}
checkProtoPins(".sources", manifest);
