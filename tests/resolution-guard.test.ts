import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createPlansmanSdk } from "../surfaces/sdk";
import { cleanupTempPaths, prepareFixtureRepo, spawn } from "./helpers";

afterEach(cleanupTempPaths);

// alpha's fixture resolution-1 is open and names plan-1/plan-2.
describe("open-resolution guard on done", () => {
  test("sdk blocks done for a named plan, allows override and other statuses", async () => {
    const fixtureRoot = prepareFixtureRepo("ws-two");
    const sdk = createPlansmanSdk({ rootDir: fixtureRoot });

    await expect(sdk.plans.setStatus({ id: 1, status: "done", completion: 100, workspace: "alpha" })).rejects.toThrow(
      /resolution-1/
    );

    const running = await sdk.plans.setStatus({ id: 1, status: "running", completion: 10, workspace: "alpha" });
    expect(running.plan.frontMatter.status).toBe("running");

    const overridden = await sdk.plans.setStatus({
      id: 1,
      status: "done",
      completion: 100,
      workspace: "alpha",
      overrideResolutions: true
    });
    expect(overridden.plan.frontMatter.status).toBe("done");
    expect(
      execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })
    ).toContain("set plan 1 done");
  });

  test("cli exits 1 with guidance, passes with --override-resolutions, banners on stderr in human mode", async () => {
    const fixtureRoot = prepareFixtureRepo("ws-two");
    const env = { PLANSMAN_ROOT: fixtureRoot };

    const blocked = await spawn(
      "bun",
      ["plansman", "set-status", "1", "--status", "done", "--completion", "100", "--workspace", "alpha", "--json"],
      { env }
    );
    expect(blocked.code).toBe(1);
    expect(JSON.parse(blocked.stdout).error.message).toContain("resolution-1");

    const overridden = await spawn(
      "bun",
      [
        "plansman",
        "set-status",
        "1",
        "--status",
        "done",
        "--completion",
        "100",
        "--override-resolutions",
        "--workspace",
        "alpha",
        "--json"
      ],
      { env }
    );
    expect(overridden.code).toBe(0);

    const humanList = await spawn("bun", ["plansman", "list", "--workspace", "alpha"], { env });
    expect(humanList.code).toBe(0);
    expect(humanList.stderr).toContain("open resolution");
    expect(humanList.stderr).toContain("resolution-1");

    const jsonList = await spawn("bun", ["plansman", "list", "--workspace", "alpha", "--json"], { env });
    expect(jsonList.stderr).toBe("");
    expect(jsonList.stdout.trim().split(/\r?\n/)).toHaveLength(1);
  });
});
