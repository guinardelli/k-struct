import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const { tag } = json(".github/source-release.json");
assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const version = tag.slice(1);
assert.equal(json("package.json").version, version);
assert.equal(json("package-lock.json").packages[""].version, version);
assert.equal(json("src-tauri/tauri.conf.json").version, version);
assert.equal(
  readFileSync("src-tauri/Cargo.toml", "utf8").match(/^version = "([^"]+)"/m)?.[1],
  version,
);
assert.ok(readFileSync(`.github/release-notes/${tag}.md`, "utf8").trim());

if (process.argv.includes("--check")) {
  console.log(`Versão e notas verificadas: ${tag}.`);
} else {
  const repo = "ricardocorsini/k-struct";
  assert.equal(process.env.GITHUB_REPOSITORY, repo);
  assert.equal(process.env.GITHUB_REF, "refs/heads/master");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(sha, process.env.GITHUB_SHA);
  const ref = `refs/tags/${tag}`;
  const existing = spawnSync(
    "git", ["ls-remote", "--exit-code", "--refs", "origin", ref], { encoding: "utf8" },
  );
  if (existing.status === 0) {
    assert.equal(existing.stdout.trim(), `${sha}\t${ref}`, "A tag existente aponta para outra revisão.");
  } else {
    assert.equal(existing.status, 2, existing.stderr || "Não foi possível consultar a tag.");
    execFileSync("gh", [
      "api", "--method", "POST", `repos/${repo}/git/refs`,
      "--raw-field", `ref=${ref}`, "--raw-field", `sha=${sha}`, "--silent",
    ], { stdio: "inherit" });
  }
  console.log(`Tag de origem confirmada: ${tag} · ${sha}.`);
}
