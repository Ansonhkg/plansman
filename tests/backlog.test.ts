import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createPlansmanSdk } from "../surfaces/sdk";
import { cleanupTempPaths, prepareFixtureRepo, spawn, validPrd } from "./helpers";

afterEach(cleanupTempPaths);

describe("workspace backlog", () => {
  test("completes a plan and commits explicit deferrals atomically", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });

    const result = await sdk.plans.complete({
      id: 1,
      workspace: "beta",
      deferrals: [
        {
          title: "Publish packages",
          category: "release",
          reason: "Requires explicit publication authorization"
        },
        {
          title: "Publish release notes",
          category: "release",
          reason: "Run after package publication"
        }
      ]
    });

    expect(result.plan.frontMatter).toMatchObject({
      status: "done",
      completion: 100,
      deferred_backlog: ["B-1", "B-2"]
    });
    expect(result.backlog.map((item) => item.summary)).toMatchObject([
      { label: "B-1", sourcePlan: "1", status: "open", title: "Publish packages" },
      { label: "B-2", sourcePlan: "1", status: "open", title: "Publish release notes" }
    ]);
    const committedPaths = execFileSync("git", ["show", "--pretty=", "--name-only", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8"
    });
    expect(committedPaths).toContain("beta/plans/plan-1.md");
    expect(committedPaths).toContain("beta/backlog/backlog-1.md");
    expect(committedPaths).toContain("beta/backlog/backlog-2.md");
  });

  test("reminds the next running plan without contaminating JSON", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const env = { PLANSMAN_ROOT: rootDir };
    const planPath = path.join(rootDir, "beta/plans/plan-1.md");
    fs.writeFileSync(planPath, fs.readFileSync(planPath, "utf8").replace("| Fixture | PASS |", "| Fixture | NOT CHECKED |"));
    const completed = await spawn(
      "bun",
      [
        "plansman",
        "complete",
        "1",
        "--workspace",
        "beta",
        "--defer-proof",
        "Fixture",
        "--defer",
        "Publish release notes",
        "--category",
        "release",
        "--reason",
        "Requires explicit authorization",
        "--json"
      ],
      { env }
    );
    expect(completed.code).toBe(0);
    expect(completed.stderr).toBe("");
    expect(JSON.parse(completed.stdout).backlog).toHaveLength(2);
    expect(completed.stdout.trim().split(/\r?\n/)).toHaveLength(1);

    const sdk = createPlansmanSdk({ rootDir });
    await sdk.plans.create({
      title: "Next plan",
      prd: validPrd,
      objective: "Exercise reminders.",
      requirements: "Surface open backlog items.",
      forbidden: "Do not write banners to JSON output.",
      workspace: "beta"
    });
    const started = await spawn(
      "bun",
      ["plansman", "set-status", "2", "--status", "running", "--completion", "1", "--workspace", "beta", "--json"],
      { env }
    );
    expect(started.code).toBe(0);
    expect(started.stderr).toBe("");
    expect(JSON.parse(started.stdout).notices.backlog).toHaveLength(2);
    expect(started.stdout.trim().split(/\r?\n/)).toHaveLength(1);
  });

  test("does not defer a blocking proof failure", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const planPath = path.join(rootDir, "beta/plans/plan-1.md");
    fs.writeFileSync(planPath, fs.readFileSync(planPath, "utf8").replace("| Fixture | PASS |", "| Fixture | NOT CHECKED |"));
    const sdk = createPlansmanSdk({ rootDir });

    await expect(
      sdk.plans.complete({
        id: 1,
        workspace: "beta",
        deferrals: [{ title: "Hide failure", category: "release", reason: "Not allowed" }]
      })
    ).rejects.toThrow(/incomplete proof matrix/);
    expect(fs.existsSync(path.join(rootDir, "beta/backlog"))).toBe(false);
    expect(fs.readFileSync(planPath, "utf8")).toContain("completion: 0");
  });

  test("explicitly links a named unfinished proof row to its backlog item", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const planPath = path.join(rootDir, "beta/plans/plan-1.md");
    fs.writeFileSync(planPath, fs.readFileSync(planPath, "utf8").replace("| Fixture | PASS |", "| Fixture | NOT CHECKED |"));
    const sdk = createPlansmanSdk({ rootDir });

    const result = await sdk.plans.complete({
      id: 1,
      workspace: "beta",
      deferrals: [{
        title: "Fixture",
        category: "release",
        reason: "Requires explicit authorization",
        proofRequirement: "Fixture"
      }]
    });

    expect(result.plan.raw).toContain("| Fixture | DEFERRED (B-1) |");
    expect(result.backlog[0]?.frontMatter).toMatchObject({
      proof_requirement: "Fixture",
      source_plan: "1"
    });
  });
});
