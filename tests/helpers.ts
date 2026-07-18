import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dir, "..");
export const tempPaths: string[] = [];

export function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

export async function cleanupTempPaths() {
  while (tempPaths.length > 0) {
    const tempPath = tempPaths.pop();
    if (tempPath) await fs.promises.rm(tempPath, { recursive: true, force: true });
  }
}

export function exec(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: {
        ...process.env,
        TMPDIR: path.join(repoRoot, ".tmp"),
        BUN_INSTALL_CACHE_DIR: path.join(repoRoot, ".bun-cache"),
        ...options.env
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      ok: false,
      code: failure.status ?? 1,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? "")
    };
  }
}

export async function spawn(command: string, args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      TMPDIR: path.join(repoRoot, ".tmp"),
      BUN_INSTALL_CACHE_DIR: path.join(repoRoot, ".bun-cache"),
      ...options.env
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

export function prepareOracleCorpus(fixtureName: string): string {
  const root = makeTempDir(`plansman-${fixtureName}-`);
  const plansDir = path.join(root, "plans");
  fs.mkdirSync(plansDir, { recursive: true });
  fs.cpSync(path.join(repoRoot, "tests/fixtures", fixtureName, "plans"), plansDir, { recursive: true });
  for (const fileName of ["plan.js", "drafts.js", "draft-ledger.js", "schema.json"]) {
    fs.copyFileSync(path.join(repoRoot, "tests/oracle", fileName), path.join(plansDir, fileName));
  }
  return root;
}

export function prepareWorkspaceOracleCorpus(fixtureName: string, workspacePlansPath: string): string {
  const root = makeTempDir(`plansman-${fixtureName}-`);
  const plansDir = path.join(root, "plans");
  fs.mkdirSync(plansDir, { recursive: true });
  fs.cpSync(path.join(repoRoot, "tests/fixtures", fixtureName, workspacePlansPath), plansDir, { recursive: true });
  for (const fileName of ["plan.js", "drafts.js", "draft-ledger.js", "schema.json"]) {
    fs.copyFileSync(path.join(repoRoot, "tests/oracle", fileName), path.join(plansDir, fileName));
  }
  return root;
}

export function prepareFixtureRepo(fixtureName: string): string {
  const root = makeTempDir(`plansman-${fixtureName}-`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(path.join(repoRoot, "tests/fixtures", fixtureName), root, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Plansman Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "plansman-test@example.com"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "test: seed fixture"], { cwd: root });
  tempPaths.push(root);
  return root;
}

export function parseLegacyLint(result: { code: number; stdout: string; stderr: string }) {
  const output = `${result.stdout}\n${result.stderr}`;
  const countMatch = output.match(/Plan lint (?:passed|failed) for (\d+) plan file\(s\)[.:]/);
  const byFile: Record<string, number> = {};
  let currentFile: string | null = null;

  for (const line of output.split(/\r?\n/)) {
    const fileMatch = line.match(/^(.+):$/);
    if (fileMatch && !line.startsWith("Plan lint")) {
      currentFile = fileMatch[1];
      byFile[currentFile] ??= 0;
      continue;
    }
    if (currentFile && line.trim().startsWith("- ")) {
      byFile[currentFile] += 1;
    }
  }

  return {
    ok: result.code === 0,
    planCount: Number(countMatch?.[1] ?? 0),
    byFile
  };
}

export function cloneRepo(): string {
  const cloneDir = makeTempDir("plansman-clone-");
  fs.rmSync(cloneDir, { recursive: true, force: true });
  execFileSync("git", ["clone", "--quiet", repoRoot, cloneDir], { stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Plansman Test"], { cwd: cloneDir });
  execFileSync("git", ["config", "user.email", "plansman-test@example.com"], { cwd: cloneDir });
  tempPaths.push(cloneDir);
  return cloneDir;
}

export const validPrd = `## Problem Statement

Implementation can lose the product context that justified the work.

## Solution

Keep the complete product requirements in the plan that governs execution.

## User Stories

1. As an implementer, I want the accepted context in one plan, so that I can make grounded decisions.

## Implementation Decisions

- Store the PRD in the plan Markdown itself.

## Testing Decisions

- Verify every public creation surface and the rendered document.

## Release Decisions

- Ship the contract through the existing Plansman release.

## Documentation Decisions

- Document the required PRD input and promotion flow.

## Out of Scope

- Generating product intent without user or agent input.

## Further Notes

The execution contract follows the product requirements in the same file.`;
