import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createPlansmanSdk } from "../surfaces/sdk";
import { goalRestatementPlaceholder } from "../src/core/agent-protocol";
import { cleanupTempPaths, prepareFixtureRepo, spawn } from "./helpers";

afterEach(cleanupTempPaths);

// Plans on the agent protocol (>= 34) are stamped with a placeholder Goal
// Restatement; moving to running/done must gate on it being filled first.
describe("goal-restatement guard on running/done", () => {
  test("sdk blocks the transition until restated, allows override, then passes once filled", async () => {
    const fixtureRoot = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir: fixtureRoot });

    await sdk.plans.claim({ title: "Protocol plan", target: 34, workspace: "alpha" });

    await expect(sdk.plans.setStatus({ id: 34, status: "running", workspace: "alpha" })).rejects.toThrow(
      /Goal Restatement/
    );

    const overridden = await sdk.plans.setStatus({
      id: 34,
      status: "running",
      workspace: "alpha",
      overrideRestatement: true
    });
    expect(overridden.plan.frontMatter.status).toBe("running");

    // Fill the restatement for real, then a fresh plan should start cleanly.
    await sdk.plans.claim({ title: "Second protocol plan", target: 35, workspace: "alpha" });
    const planPath = path.join(fixtureRoot, "alpha", "plans", "plan-35.md");
    const filled = fs
      .readFileSync(planPath, "utf8")
      .replace(goalRestatementPlaceholder, "Ship the widget; must not break the API; no shell-outs.");
    fs.writeFileSync(planPath, filled);

    const started = await sdk.plans.setStatus({ id: 35, status: "running", workspace: "alpha" });
    expect(started.plan.frontMatter.status).toBe("running");
  });

  test("cli exits 1 with guidance, passes with --override-restatement", async () => {
    const fixtureRoot = prepareFixtureRepo("ws-two");
    const env = { PLANSMAN_ROOT: fixtureRoot };

    await spawn(
      "bun",
      ["plansman", "claim", "--title", "Protocol plan", "--target", "34", "--workspace", "alpha", "--json"],
      { env }
    );

    const blocked = await spawn(
      "bun",
      ["plansman", "set-status", "34", "--status", "running", "--workspace", "alpha", "--json"],
      { env }
    );
    expect(blocked.code).toBe(1);
    expect(JSON.parse(blocked.stdout).error.message).toContain("Goal Restatement");

    const overridden = await spawn(
      "bun",
      ["plansman", "set-status", "34", "--status", "running", "--override-restatement", "--workspace", "alpha", "--json"],
      { env }
    );
    expect(overridden.code).toBe(0);
  });
});
