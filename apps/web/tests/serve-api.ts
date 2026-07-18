import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {createRestServer} from "../../../surfaces/rest/server";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), "plansman-web-e2e-"));
const stateDir = path.resolve(import.meta.dir, "../test-results");
const stateFile = path.join(stateDir, "e2e-state.json");

fs.rmSync(cloneDir, {recursive: true, force: true});
fs.mkdirSync(cloneDir, {recursive: true});
fs.cpSync(path.join(repoRoot, "tests/fixtures/ws-two"), cloneDir, {recursive: true});
execFileSync("git", ["init", "--quiet"], {cwd: cloneDir});
execFileSync("git", ["config", "user.name", "Plansman Web Test"], {cwd: cloneDir});
execFileSync("git", ["config", "user.email", "plansman-web-test@example.com"], {cwd: cloneDir});
execFileSync("git", ["add", "."], {cwd: cloneDir});
execFileSync("git", ["commit", "--quiet", "-m", "test: seed fixture"], {cwd: cloneDir});

fs.mkdirSync(stateDir, {recursive: true});
fs.writeFileSync(stateFile, `${JSON.stringify({cloneDir}, null, 2)}\n`);

process.env.PLANSMAN_ROOT = cloneDir;

const server = createRestServer({rootDir: cloneDir, port: Number(process.env.PORT ?? 4000)});

process.on("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});

process.on("SIGINT", () => {
  server.stop(true);
  process.exit(0);
});

console.error(`plansman web e2e REST listening on http://127.0.0.1:${server.port}`);

await new Promise(() => {});
