import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createPlansmanSdk } from "../surfaces/sdk";
import { cleanupTempPaths, prepareFixtureRepo, spawn } from "./helpers";

const prd = `## Problem Statement

Product intent disappears between conversation and implementation.

## Solution

Persist a shaped PRD on the idea.

## User Stories

1. As a planner, I want durable requirements, so that implementation stays grounded.

## Implementation Decisions

- Reuse the idea record.

## Testing Decisions

- Test the SDK lifecycle.

## Release Decisions

- Ship in the existing binary.

## Documentation Decisions

- Document the idea lifecycle.

## Out of Scope

- Embedded AI synthesis.

## Further Notes

The PRD remains product context.`;

afterEach(cleanupTempPaths);

describe("idea inbox", () => {
  test("captures, shapes, revises, discusses, and promotes a durable PRD", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });

    const shaped = await sdk.ideas.shape({
      title: "Preserve product requirements",
      workspace: "alpha",
      prd,
      objective: "Plansman stores accepted product intent before execution.",
      requirements: "Preserve the PRD, goals, discussion, provenance, and Git history.",
      forbidden: "Do not create a separate PRD store."
    });
    expect(shaped.idea.summary).toMatchObject({ label: "B-1", status: "shaped" });
    expect(shaped.idea.frontMatter).toMatchObject({
      objective: "Plansman stores accepted product intent before execution.",
      shaped: expect.any(String)
    });
    expect(shaped.idea.body).toContain("<!-- plansman:prd:start -->");
    expect(shaped.idea.body).toContain("## Problem Statement");
    expect(shaped.idea.body).toContain("## Discussion");

    await sdk.ideas.note({ id: "B-1", workspace: "alpha", note: "Keep the accepted snapshot auditable." });
    const revised = await sdk.ideas.shape({
      id: "B-1",
      workspace: "alpha",
      prd: prd.replace("Product intent disappears", "Critical product intent disappears"),
      objective: "Plansman stores accepted product intent before execution.",
      requirements: "Preserve the PRD, goals, discussion, provenance, and Git history.",
      forbidden: "Do not create a separate PRD store."
    });
    expect(revised.idea.body).toContain("Critical product intent disappears");
    expect(revised.idea.body).toContain("Keep the accepted snapshot auditable.");
    expect(revised.idea.body.match(/plansman:prd:start/g)).toHaveLength(1);

    const promoted = await sdk.ideas.promote({ id: "B-1", workspace: "alpha" });
    expect(promoted.idea.summary).toMatchObject({ status: "promoted", promotedPlan: "2" });
    expect(promoted.plan.frontMatter.source_idea).toBe("B-1");
    expect(promoted.plan.raw).toContain("Source product requirements: [B-1]");
    expect(promoted.plan.raw).toContain("plan_format: 'prd-v1'");
    expect(promoted.plan.raw).toContain("Critical product intent disappears");
    expect(promoted.plan.raw).toContain("Plansman stores accepted product intent before execution.");

    const committedPaths = execFileSync("git", ["show", "--pretty=", "--name-only", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8"
    });
    expect(committedPaths).toContain("alpha/backlog/backlog-1.md");
    expect(committedPaths).toContain("alpha/plans/plan-2.md");
    expect((await sdk.plans.lint("alpha")).ok).toBe(true);
    const planPath = path.join(rootDir, "alpha/plans/plan-2.md");
    fs.writeFileSync(planPath, fs.readFileSync(planPath, "utf8").replace("source_idea: 'B-1'", "source_idea: 'B-999'"));
    expect((await sdk.plans.lint("alpha")).findings).toContainEqual({
      fileName: "plan-2.md",
      message: "`source_idea` references missing B-999"
    });
    await expect(sdk.ideas.shape({
      id: "B-1",
      workspace: "alpha",
      prd,
      objective: "Cannot revise terminal history.",
      requirements: "Reject the transition.",
      forbidden: "Do not mutate it."
    })).rejects.toThrow("not an active idea");
  });

  test("rejects incomplete PRDs without changing the idea", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });
    await sdk.ideas.add({ title: "Incomplete PRD", workspace: "alpha" });
    await expect(sdk.ideas.shape({
      id: "B-1",
      workspace: "alpha",
      prd: "## Problem Statement\n\nOnly one section.",
      objective: "Validate PRDs.",
      requirements: "Require every canonical section.",
      forbidden: "Do not accept partial documents."
    })).rejects.toThrow("## Solution");
    expect((await sdk.ideas.get("B-1", "alpha")).summary.status).toBe("inbox");
  });

  test("requires shaping before atomically promoting an idea", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });

    const captured = await sdk.ideas.add({
      title: "Add dependency-aware scheduling",
      workspace: "alpha"
    });
    expect(captured.idea.frontMatter).toEqual({
      backlog_id: 1,
      kind: "idea",
      title: "Add dependency-aware scheduling",
      status: "inbox",
      created: expect.any(String)
    });
    expect(captured.idea.frontMatter.category).toBeUndefined();
    expect(captured.idea.frontMatter.reason).toBeUndefined();

    const noted = await sdk.ideas.note({
      id: "B-1",
      note: "Dependencies should be explicit rather than inferred from numbering.",
      workspace: "alpha"
    });
    expect(noted.idea.body).toContain("Dependencies should be explicit");
    expect(await sdk.ideas.list("alpha")).toMatchObject([
      { label: "B-1", kind: "idea", status: "inbox", title: "Add dependency-aware scheduling" }
    ]);

    await expect(sdk.ideas.promote({
      id: "B-1",
      workspace: "alpha",
      objective: "Plans declare enforceable dependencies.",
      requirements: "Expose dependencies across every Plansman surface.",
      forbidden: "Do not infer dependencies only from plan numbering."
    })).rejects.toThrow("must be shaped into a PRD");

    await sdk.ideas.shape({
      id: "B-1",
      workspace: "alpha",
      prd,
      objective: "Plans declare enforceable dependencies.",
      requirements: "Expose dependencies across every Plansman surface.",
      forbidden: "Do not infer dependencies only from plan numbering."
    });
    const promoted = await sdk.ideas.promote({ id: "B-1", workspace: "alpha" });
    expect(promoted.idea.frontMatter).toMatchObject({ status: "promoted", promoted_plan: "2" });
    expect(promoted.plan.summary.fileName).toBe("plan-2.md");
    expect(promoted.plan.raw).toContain("Plans declare enforceable dependencies.");

    const committedPaths = execFileSync("git", ["show", "--pretty=", "--name-only", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8"
    });
    expect(committedPaths).toContain("alpha/backlog/backlog-1.md");
    expect(committedPaths).toContain("alpha/plans/plan-2.md");
    expect((await sdk.ideas.list("alpha"))[0]).toMatchObject({ status: "promoted", promotedPlan: "2" });
  });

  test("dismisses an idea while preserving it in idea history", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir });
    await sdk.ideas.add({ title: "Duplicate idea", workspace: "beta" });

    const dismissed = await sdk.ideas.dismiss({
      id: 1,
      reason: "Already covered by the active plan.",
      workspace: "beta"
    });

    expect(dismissed.idea.frontMatter).toMatchObject({
      kind: "idea",
      status: "dismissed",
      reason: "Already covered by the active plan."
    });
    expect(await sdk.ideas.list("beta")).toMatchObject([{ label: "B-1", status: "dismissed" }]);
  });

  test("supports title-first CLI capture and discussion commands", async () => {
    const rootDir = prepareFixtureRepo("ws-two");
    const env = { PLANSMAN_ROOT: rootDir };

    const captured = await spawn(
      "bun",
      ["plansman", "idea", "Explore an idea inbox", "--workspace", "beta", "--json"],
      { env }
    );
    expect(captured.code).toBe(0);
    expect(JSON.parse(captured.stdout).idea.summary).toMatchObject({ label: "B-1", status: "inbox" });

    const noted = await spawn(
      "bun",
      ["plansman", "idea", "note", "B-1", "--note", "Keep discussion with the idea.", "--workspace", "beta", "--json"],
      { env }
    );
    expect(noted.code).toBe(0);
    expect(JSON.parse(noted.stdout).idea.body).toContain("Keep discussion with the idea.");

    const prdPath = path.join(rootDir, "idea.prd.md");
    fs.writeFileSync(prdPath, prd);
    const shaped = await spawn(
      "bun",
      [
        "plansman", "idea", "shape", "B-1", "--file", prdPath,
        "--objective", "Persist product intent.",
        "--requirements", "Keep discussion and provenance.",
        "--forbidden", "Do not create another store.",
        "--workspace", "beta", "--json"
      ],
      { env }
    );
    expect(shaped.code).toBe(0);
    expect(JSON.parse(shaped.stdout).idea.summary.status).toBe("shaped");

    const listed = await spawn(
      "bun",
      ["plansman", "idea", "list", "--workspace", "beta", "--json"],
      { env }
    );
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout).ideas).toMatchObject([
      { label: "B-1", status: "shaped", title: "Explore an idea inbox" }
    ]);

    const promoted = await spawn(
      "bun",
      ["plansman", "idea", "promote", "B-1", "--workspace", "beta", "--json"],
      { env }
    );
    expect(promoted.code).toBe(0);
    expect(JSON.parse(promoted.stdout).plan.frontMatter.source_idea).toBe("B-1");
  });
});
