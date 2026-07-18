import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { PlanFrontMatterSchema, WorkspaceSchema } from "../surfaces/contracts/plansman.v1";
import { createPlansmanSdk } from "../surfaces/sdk";
import { parseFrontMatter } from "../src/core/front-matter";
import { renderClaimedPlan } from "../src/core/plans";
import {
  cleanupTempPaths,
  exec,
  parseLegacyLint,
  prepareFixtureRepo,
  prepareOracleCorpus,
  prepareWorkspaceOracleCorpus,
  repoRoot,
  validPrd
} from "./helpers";

afterEach(cleanupTempPaths);

async function compareParity(rootDir: string) {
  const legacy = parseLegacyLint(exec("node", ["plans/plan.js", "lint"], { cwd: rootDir }));
  const sdk = await createPlansmanSdk({ rootDir }).plans.lint();
  const sdkCounts = Object.fromEntries(Object.entries(sdk.byFile).map(([fileName, findings]) => [fileName, findings.length]));
  expect({ ok: sdk.ok, planCount: sdk.planCount, byFile: sdkCounts }).toEqual(legacy);
}

async function compareWorkspaceParity(rootDir: string, workspace: string, oracleRoot: string) {
  const legacy = parseLegacyLint(exec("node", ["plans/plan.js", "lint"], { cwd: oracleRoot }));
  const sdk = await createPlansmanSdk({ rootDir }).plans.lint(workspace);
  const sdkCounts = Object.fromEntries(Object.entries(sdk.byFile).map(([fileName, findings]) => [fileName, findings.length]));
  expect({ ok: sdk.ok, planCount: sdk.planCount, byFile: sdkCounts }).toEqual(legacy);
}

describe("plansman contracts and core", () => {
  test("goal-complete plan rendering states the objective, requirements, and forbidden substitutes", () => {
    const content = renderClaimedPlan(
      { planId: 40 },
      "Explicit goals",
      ["plan-39.md"],
      {
        objective: "New plans state what success means.",
        requirements: "Keep CLI and agent surfaces aligned.\n- Reject missing goal fields.",
        forbidden: "Do not leave template placeholders."
      },
      undefined,
      validPrd
    );

    expect(content).toContain("## Main Objective\n\nNew plans state what success means.");
    expect(content).toContain("**Non-negotiable requirements:** Keep CLI and agent surfaces aligned.");
    expect(content).toContain("- Keep CLI and agent surfaces aligned.\n- Reject missing goal fields.");
    expect(content).toContain("- Do not leave template placeholders.");
    expect(content).not.toContain("_Not restated yet");
    expect(content).toContain("plan_format: 'prd-v1'");
    expect(content).toContain("## Problem Statement\n\nImplementation can lose the product context");
  });

  test("goal-complete plan rendering rejects empty and placeholder goals", () => {
    expect(() =>
      renderClaimedPlan({ planId: 40 }, "Missing objective", ["plan-39.md"], {
        objective: " ",
        requirements: "Keep the contract explicit.",
        forbidden: "Do not defer validation."
      })
    ).toThrow("objective is required");

    expect(() =>
      renderClaimedPlan({ planId: 40 }, "Placeholder", ["plan-39.md"], {
        objective: "One sentence. What must be true when this plan is complete?",
        requirements: "Keep the contract explicit.",
        forbidden: "Do not defer validation."
      })
    ).toThrow("template placeholder");
  });

  test("new plan template requests concrete developer-facing code examples", () => {
    const content = renderClaimedPlan(
      { planId: 39 },
      "Provider-Neutral Model Capability",
      ["plan-38.md"],
    );

    expect(content).toContain("## Developer-Facing Code Examples");
    expect(content).toMatch(/smallest concrete current-state and intended-usage\s+examples/);
    expect(content).toContain("state why instead of inventing an API");
    expect(content).toContain("```ts\n// Replace with a concise example when applicable.\n```");
    expect(content).toContain("plan_format: 'prd-v1'");
    expect(content).toContain("## Problem Statement");
    expect(content).toContain("## Further Notes");
  });

  test("goal-complete plan rendering rejects missing or incomplete PRDs", () => {
    const goals = {
      objective: "Keep product context in plans.",
      requirements: "Require the canonical PRD sections.",
      forbidden: "Do not accept a goal-only plan."
    };
    expect(() => renderClaimedPlan({ planId: 40 }, "No PRD", ["plan-39.md"], goals)).toThrow("PRD content is required");
    expect(() => renderClaimedPlan({ planId: 40 }, "Partial PRD", ["plan-39.md"], goals, undefined, "## Problem Statement\n\nOnly this."))
      .toThrow("## Solution");
  });

  test("contracts validate fixture plan markdown files", async () => {
    const fixtureDirs = [
      path.join(repoRoot, "tests/fixtures/corpus-pass/plans"),
      path.join(repoRoot, "tests/fixtures/ws-two/alpha/plans"),
      path.join(repoRoot, "tests/fixtures/ws-two/beta/plans"),
      path.join(repoRoot, "tests/fixtures/legacy-shape/plans")
    ];

    for (const plansDir of fixtureDirs) {
      const fileNames = (await fs.readdir(plansDir)).filter((fileName) => /^plan-.*\.md$/.test(fileName));
      expect(fileNames.length, plansDir).toBeGreaterThan(0);

      for (const fileName of fileNames) {
        const content = await fs.readFile(path.join(plansDir, fileName), "utf8");
        const parsed = parseFrontMatter(content);
        expect(parsed.errors, fileName).toEqual([]);
        expect(() => PlanFrontMatterSchema.parse(parsed.data)).not.toThrow();
      }
    }
  });

  test("sdk lint matches legacy oracle on fixture corpora", async () => {
    await compareParity(prepareOracleCorpus("corpus-pass"));
    await compareParity(prepareOracleCorpus("corpus-fail"));
    const workspaceRoot = prepareFixtureRepo("ws-two");
    await compareWorkspaceParity(workspaceRoot, "alpha", prepareWorkspaceOracleCorpus("ws-two", "alpha/plans"));
  });

  test("discovers docs workspaces, legacy fallback, and section settings", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });
    const workspaces = await sdk.workspaces.list();

    expect(workspaces.map((workspace) => WorkspaceSchema.parse(workspace).slug)).toEqual(["alpha", "beta"]);
    expect(workspaces.map((workspace) => workspace.name)).toEqual(["Alpha Workspace", "Beta Workspace"]);
    expect(workspaces[0].plansDir).toBe("alpha/plans");
    expect(workspaces[0].openResolutionCount).toBe(1);
    expect(workspaces[0].sections.map((section) => [section.id, section.enabled, section.fileCount])).toEqual([
      ["drafts", false, 1],
      ["improvements", true, 1]
    ]);
    expect(workspaces[0].sections.some((section) => section.id === "resolutions")).toBe(false);
    expect(workspaces[1].sections.map((section) => section.id)).toEqual(["drafts"]);

    const before = await fs.readFile(path.join(rootDir, "alpha/workspace.yaml"), "utf8");
    expect(before).toContain("# alpha comment must survive settings edits");

    const result = await sdk.sections.toggle("alpha", "drafts", true);
    expect(result.workspace.sections.find((section) => section.id === "drafts")?.enabled).toBe(true);
    const after = await fs.readFile(path.join(rootDir, "alpha/workspace.yaml"), "utf8");
    expect(after).toContain("# alpha comment must survive settings edits");
    expect(after).toContain("drafts: true");
    expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: rootDir, encoding: "utf8" })).toContain(
      "enable drafts in alpha"
    );

    const files = await sdk.sections.files("alpha", "drafts");
    expect(files).toEqual([
      {
        name: "draft-alpha.md",
        title: "Alpha Draft Note",
        path: "alpha/drafts/draft-alpha.md"
      }
    ]);
    const content = await sdk.sections.read("alpha", "drafts", "draft-alpha.md");
    expect(content.content).toContain("Draft content for the alpha workspace.");
    await expect(sdk.sections.read("alpha", "drafts", "../plans/plan-1.md")).rejects.toThrow("Invalid section file name");
  });

  test("resolutions open respond decide append markdown files and commit every mutation", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });
    const beforeCount = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim());

    const opened = await sdk.resolutions.open({
      workspace: "alpha",
      title: "SDK Conflict",
      plans: ["33", "30a"],
      parties: ["agent-a", "agent-b"],
      conflict: "Two threads disagree about the section owner."
    });
    expect(opened.resolution.summary.id).toBe(2);
    expect(opened.resolution.body).toContain("## Conflict");
    expect(opened.resolution.body).toContain("## Decision");

    const firstResponse = await sdk.resolutions.respond({
      workspace: "alpha",
      id: 2,
      party: "agent-a",
      position: "Keep the section in the workspace settings owner."
    });
    const firstContent = await fs.readFile(path.join(rootDir, "alpha/resolutions/resolution-2.md"), "utf8");
    expect(firstResponse.resolution.body).toContain("## Position: agent-a");
    const preservedPrefix = firstContent.slice(0, firstContent.indexOf("## Decision"));

    await sdk.resolutions.respond({
      workspace: "alpha",
      id: 2,
      party: "agent-b",
      position: "Move the behavior behind the resolution owner."
    });
    const secondContent = await fs.readFile(path.join(rootDir, "alpha/resolutions/resolution-2.md"), "utf8");
    expect(secondContent).toContain(preservedPrefix);
    expect(secondContent).toContain("## Position: agent-b");

    const decided = await sdk.resolutions.decide({
      workspace: "alpha",
      id: 2,
      decision: "Keep settings ownership separate from resolution files.",
      status: "agreed"
    });
    expect(decided.resolution.frontMatter.status).toBe("agreed");
    expect(decided.resolution.frontMatter.decided).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(decided.resolution.body).toContain("Keep settings ownership separate");

    const afterCount = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim());
    expect(afterCount - beforeCount).toBe(4);
    expect(execFileSync("git", ["log", "-4", "--pretty=%s"], { cwd: rootDir, encoding: "utf8" })).toContain(
      "decide resolution 2"
    );
  });

  test("legacy-shaped fixture exposes read-only fallback workspace", async () => {
    const rootDir = prepareFixtureRepo("legacy-shape");
    const sdk = createPlansmanSdk({ rootDir });
    const workspaces = await sdk.workspaces.list();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({
      slug: "intent-workspace",
      name: "Intent Workspace",
      plansDir: "plans",
      legacy: true
    });
    expect(workspaces[0].sections.map((section) => [section.id, section.enabled])).toEqual([
      ["assets", false],
      ["drafts", true],
      ["improvements", false],
      ["pain points", false]
    ]);
    await expect(sdk.sections.toggle("intent-workspace", "drafts", false)).rejects.toThrow(
      "settings persist after migration"
    );
  });
});
