import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cleanupTempPaths, makeTempDir, prepareFixtureRepo, prepareOracleCorpus, repoRoot, spawn, validPrd } from "./helpers";

afterEach(cleanupTempPaths);

describe("plansman CLI", () => {
  test("new requires a PRD and explicit goals, then writes one self-contained plan", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const env = { PLANSMAN_ROOT: rootDir };

    const missingGoals = await spawn(
      "bun",
      ["plansman", "new", "--title", "Incomplete plan", "--workspace", "alpha", "--json"],
      { env }
    );
    expect(missingGoals.code).toBe(2);
    expect(JSON.parse(missingGoals.stdout).error.message).toContain("--objective");

    const prdPath = path.join(rootDir, "plan.prd.md");
    fs.writeFileSync(prdPath, validPrd, "utf8");

    const created = await spawn(
      "bun",
      [
        "plansman",
        "new",
        "--title",
        "Goal-complete plan",
        "--file",
        prdPath,
        "--objective",
        "Plans state their intended outcome.",
        "--requirements",
        "Persist goals in the plan file.",
        "--forbidden",
        "Do not leave placeholders.",
        "--workspace",
        "alpha",
        "--json"
      ],
      { env }
    );
    expect(created.code).toBe(0);
    const payload = JSON.parse(created.stdout) as { plan: { raw: string } };
    expect(payload.plan.raw).toContain("Plans state their intended outcome.");
    expect(payload.plan.raw).toContain("## Problem Statement");
    expect(payload.plan.raw).toContain("plan_format: 'prd-v1'");
    expect(payload.plan.raw).toContain("**Non-negotiable requirements:** Persist goals in the plan file.");
    expect(payload.plan.raw).not.toContain("_Not restated yet");
    expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: rootDir, encoding: "utf8" })).toContain(
      "create plan 2"
    );
  });

  test("init creates repo binding, workspace skeleton, instructions, env, and is idempotent", async () => {
    const repoDir = makeTempDir("plansman-init-repo-");
    const rootDir = makeTempDir("plansman-init-root-");
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "Plansman Test"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "plansman-test@example.com"], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "CLAUDE.md"), "# Existing Claude Notes\n", "utf8");
    fs.writeFileSync(
      path.join(repoDir, "AGENTS.md"),
      "# Existing Agent Notes\n\n<!-- plansman -->\n## Planning\n\nUse the `plansman` command.\n<!-- /plansman -->\n",
      "utf8"
    );

    const binPath = path.join(repoRoot, "plansman");
    const init = await spawn("bun", [binPath, "init", "--workspace", "sample-app", "--root", rootDir, "--json"], {
      cwd: repoDir,
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(init.code).toBe(0);
    expect(init.stderr).toBe("");
    const payload = JSON.parse(init.stdout) as { workspace: string; rootDir: string; changed: string[]; warnings: string[] };
    expect(payload.workspace).toBe("sample-app");
    expect(payload.rootDir).toBe(rootDir);
    expect(payload.changed).toEqual(expect.arrayContaining(["repo plansman.yaml", "workspace.yaml", "CLAUDE.md", "AGENTS.md", ".env"]));
    expect(payload.warnings.join("\n")).toContain("PLANSMAN_ROOT");

    expect(fs.readFileSync(path.join(repoDir, "plansman.yaml"), "utf8")).toBe("workspace: sample-app\n");
    expect(fs.existsSync(path.join(rootDir, "sample-app/plans"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "sample-app/resolutions"))).toBe(true);
    expect(fs.readFileSync(path.join(rootDir, "sample-app/workspace.yaml"), "utf8")).toContain("name: Sample App");
    expect(fs.readFileSync(path.join(repoDir, "CLAUDE.md"), "utf8").match(/<!-- plansman -->/g)).toHaveLength(1);
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8").match(/<!-- plansman -->/g)).toHaveLength(1);
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8")).toContain("plansman new");
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8")).toContain("--objective");
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8")).toContain("plansman claim");
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8")).toContain("plansman idea list");
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8")).toContain("plansman idea shape");
    expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8")).toContain("# Existing Agent Notes");
    expect(fs.readFileSync(path.join(repoDir, ".env"), "utf8")).toContain(`PLANSMAN_ROOT=${rootDir}`);

    const firstSnapshot = {
      plansman: fs.readFileSync(path.join(repoDir, "plansman.yaml"), "utf8"),
      claude: fs.readFileSync(path.join(repoDir, "CLAUDE.md"), "utf8"),
      agents: fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8"),
      env: fs.readFileSync(path.join(repoDir, ".env"), "utf8"),
      workspace: fs.readFileSync(path.join(rootDir, "sample-app/workspace.yaml"), "utf8")
    };

    const rerun = await spawn("bun", [binPath, "init", "--workspace", "sample-app", "--root", rootDir, "--json"], {
      cwd: repoDir,
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(rerun.code).toBe(0);
    expect(rerun.stderr).toBe("");
    expect({
      plansman: fs.readFileSync(path.join(repoDir, "plansman.yaml"), "utf8"),
      claude: fs.readFileSync(path.join(repoDir, "CLAUDE.md"), "utf8"),
      agents: fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8"),
      env: fs.readFileSync(path.join(repoDir, ".env"), "utf8"),
      workspace: fs.readFileSync(path.join(rootDir, "sample-app/workspace.yaml"), "utf8")
    }).toEqual(firstSnapshot);

    fs.mkdirSync(path.join(repoDir, "nested"), { recursive: true });
    const boundList = await spawn("bun", [binPath, "list", "--json"], {
      cwd: path.join(repoDir, "nested"),
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(boundList.code).toBe(0);
    expect(JSON.parse(boundList.stdout).plans).toEqual([]);

    const siblingDir = makeTempDir("plansman-init-sibling-");
    const envList = await spawn("bun", [binPath, "list", "--json"], {
      cwd: siblingDir,
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(envList.code).toBe(0);
    expect(JSON.parse(envList.stdout).plans).toEqual([]);
  });

  test("spawned cli has JSON hygiene and expected exit codes", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const lint = await spawn("bun", ["plansman", "lint", "--json", "--workspace", "alpha"], {
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(lint.code).toBe(0);
    expect(lint.stderr).toBe("");
    expect(JSON.parse(lint.stdout)).toMatchObject({ ok: true, planCount: 1 });
    expect(lint.stdout.trim().split(/\r?\n/)).toHaveLength(1);

    const list = await spawn("bun", ["plansman", "list", "--json", "--workspace", "beta"], {
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(list.code).toBe(0);
    expect(list.stderr).toBe("");
    expect(JSON.parse(list.stdout).plans).toMatchObject([{ title: "Beta First Plan" }]);
    expect(list.stdout.trim().split(/\r?\n/)).toHaveLength(1);

    const dag = await spawn("bun", ["plansman", "dag", "--json", "--workspace", "alpha"], {
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(dag.code).toBe(0);
    expect(dag.stderr).toBe("");
    expect(JSON.parse(dag.stdout).dag.events).toMatchObject([{ id: "plan-1", title: "Alpha First Plan" }]);
    expect(dag.stdout.trim().split(/\r?\n/)).toHaveLength(1);

    const sections = await spawn("bun", ["plansman", "sections-list", "--json", "--workspace", "alpha"], {
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(sections.code).toBe(0);
    expect(sections.stderr).toBe("");
    expect(JSON.parse(sections.stdout).sections.map((section: { id: string }) => section.id)).toEqual([
      "drafts",
      "improvements"
    ]);

    const resolutionList = await spawn("bun", ["plansman", "resolutions", "list", "--json", "--workspace", "alpha"], {
      env: { PLANSMAN_ROOT: rootDir }
    });
    expect(resolutionList.code).toBe(0);
    expect(resolutionList.stderr).toBe("");
    expect(JSON.parse(resolutionList.stdout).resolutions).toMatchObject([{ id: 1, status: "open" }]);

    const opened = await spawn(
      "bun",
      [
        "plansman",
        "resolutions",
        "open",
        "--title",
        "CLI Resolution Smoke",
        "--plans",
        "33,30a",
        "--party",
        "cli-agent",
        "--conflict",
        "CLI smoke conflict",
        "--workspace",
        "alpha",
        "--json"
      ],
      { env: { PLANSMAN_ROOT: rootDir } }
    );
    expect(opened.code).toBe(0);
    expect(opened.stderr).toBe("");
    expect(JSON.parse(opened.stdout).resolution.summary.title).toBe("CLI Resolution Smoke");
    expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: rootDir, encoding: "utf8" })).toContain(
      "open resolution 2"
    );

    const failRoot = prepareOracleCorpus("corpus-fail");
    const failingLint = await spawn("bun", ["plansman", "lint", "--json", "--workspace", "intent-workspace"], {
      env: { PLANSMAN_ROOT: failRoot }
    });
    expect(failingLint.code).toBe(1);
    expect(JSON.parse(failingLint.stdout).ok).toBe(false);
    expect(failingLint.stdout.trim().split(/\r?\n/)).toHaveLength(1);
  });
});
