import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRestServer } from "../surfaces/rest/server";
import { cleanupTempPaths, prepareFixtureRepo, repoRoot } from "./helpers";

afterEach(cleanupTempPaths);

const prd = `## Problem Statement

Intent gets lost.
## Solution

Store the PRD.
## User Stories

1. As a planner, I want durable intent, so that work stays grounded.
## Implementation Decisions

- Reuse ideas.
## Testing Decisions

- Test public behavior.
## Release Decisions

- Use the existing release.
## Documentation Decisions

- Document the lifecycle.
## Out of Scope

- Embedded AI.
## Further Notes

Keep provenance.`;

describe("plansman REST", () => {
  test("real HTTP list/get/lint and temp-clone mutations commit", async () => {
    const fixtureRoot = prepareFixtureRepo("ws-two");
    const server = createRestServer({ rootDir: fixtureRoot, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
      const workspaces = (await fetch(`${baseUrl}/api/workspaces`).then((response) => response.json())) as {
        workspaces: Array<{ slug: string; name: string }>;
      };
      expect(workspaces.workspaces.map((workspace) => [workspace.slug, workspace.name])).toEqual([
        ["alpha", "Alpha Workspace"],
        ["beta", "Beta Workspace"]
      ]);

      const list = (await fetch(`${baseUrl}/api/plans`).then((response) => response.json())) as { plans: unknown[] };
      expect(list.plans).toHaveLength(1);

      const betaList = (await fetch(`${baseUrl}/api/workspaces/beta/plans`).then((response) => response.json())) as {
        plans: Array<{ title: string }>;
      };
      expect(betaList.plans).toMatchObject([{ title: "Beta First Plan" }]);

      const completed = (await fetch(`${baseUrl}/api/workspaces/beta/plans/1/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deferrals: [{
            title: "Publish packages",
            category: "release",
            reason: "Requires explicit authorization"
          }]
        })
      }).then((response) => response.json())) as {
        plan: { frontMatter: { status: string; completion: number } };
        backlog: Array<{ summary: { label: string } }>;
      };
      expect(completed.plan.frontMatter).toMatchObject({ status: "done", completion: 100 });
      expect(completed.backlog[0]?.summary.label).toBe("B-1");
      const betaBacklog = (await fetch(`${baseUrl}/api/workspaces/beta/backlog`).then((response) => response.json())) as {
        backlog: Array<{ label: string; sourcePlan: string }>;
      };
      expect(betaBacklog.backlog).toMatchObject([{ label: "B-1", sourcePlan: "1" }]);

      const capturedIdea = (await fetch(`${baseUrl}/api/workspaces/beta/ideas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "REST idea inbox" })
      }).then((response) => response.json())) as { idea: { summary: { label: string; status: string } } };
      expect(capturedIdea.idea.summary).toMatchObject({ label: "B-2", status: "inbox" });

      const notedIdea = (await fetch(`${baseUrl}/api/workspaces/beta/ideas/B-2/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Discuss this before making a plan." })
      }).then((response) => response.json())) as { idea: { body: string } };
      expect(notedIdea.idea.body).toContain("Discuss this before making a plan.");

      const ideas = (await fetch(`${baseUrl}/api/workspaces/beta/ideas`).then((response) => response.json())) as {
        ideas: Array<{ label: string; title: string; status: string }>;
      };
      expect(ideas.ideas).toMatchObject([{ label: "B-2", title: "REST idea inbox", status: "inbox" }]);

      const shapedIdea = (await fetch(`${baseUrl}/api/workspaces/beta/ideas/B-2/shape`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prd,
          objective: "Persist product intent.",
          requirements: "Store goals and provenance.",
          forbidden: "Do not create another storage system."
        })
      }).then((response) => response.json())) as { idea: { summary: { status: string }; body: string } };
      expect(shapedIdea.idea.summary.status).toBe("shaped");
      expect(shapedIdea.idea.body).toContain("## Problem Statement");

      const promotedIdea = (await fetch(`${baseUrl}/api/workspaces/beta/ideas/B-2/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }).then((response) => response.json())) as { plan: { frontMatter: { source_idea: string } } };
      expect(promotedIdea.plan.frontMatter.source_idea).toBe("B-2");

      const plan1 = (await fetch(`${baseUrl}/api/workspaces/alpha/plans/1`).then((response) => response.json())) as {
        plan: { frontMatter: { plan_id: number }; body: string };
      };
      expect(plan1.plan.frontMatter.plan_id).toBe(1);
      expect(plan1.plan.body).toContain("## Main Objective");

      const lint = await fetch(`${baseUrl}/api/lint`);
      expect(lint.status).toBe(200);
      expect(((await lint.json()) as { ok: boolean }).ok).toBe(true);

      const missingApiRoute = await fetch(`${baseUrl}/api/workspaces/alpha/not-a-real-api`);
      expect(missingApiRoute.status).toBe(404);
      expect(missingApiRoute.headers.get("content-type")).toContain("application/json");
      expect(((await missingApiRoute.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");

      const claim = (await fetch(`${baseUrl}/api/workspaces/alpha/plans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "REST Claim Smoke" })
      }).then((response) => response.json())) as { plan: { summary: { fileName: string } } };
      expect(claim.plan.summary.fileName).toBe("plan-2.md");
      expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })).toContain(
        "claim plan 2"
      );

      const createdResponse = await fetch(`${baseUrl}/api/workspaces/alpha/plans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "REST Goal-Complete Plan",
          prd,
          objective: "REST-created plans state success.",
          requirements: "Persist every goal field.",
          forbidden: "Do not emit placeholders."
        })
      });
      expect(createdResponse.status).toBe(201);
      const created = (await createdResponse.json()) as { plan: { summary: { fileName: string }; raw: string } };
      expect(created.plan.summary.fileName).toBe("plan-3.md");
      expect(created.plan.raw).toContain("REST-created plans state success.");
      expect(created.plan.raw).toContain("## Problem Statement");
      expect(created.plan.raw).not.toContain("_Not restated yet");
      expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })).toContain(
        "create plan 3"
      );

      const incompleteCreate = await fetch(`${baseUrl}/api/workspaces/alpha/plans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Incomplete goals", objective: "Only one field." })
      });
      expect(incompleteCreate.status).toBe(400);
      expect(((await incompleteCreate.json()) as { error: { message: string } }).error.message).toContain(
        "requirements is required"
      );

      const subPlanClaim = (await fetch(`${baseUrl}/api/workspaces/alpha/plans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "REST Sub Plan Smoke", target: "1a" })
      }).then((response) => response.json())) as {
        plan: { summary: { fileName: string }; frontMatter: { plan_id: number; sub_plan?: string } };
      };
      expect(subPlanClaim.plan.summary.fileName).toBe("plan-1a.md");
      expect(subPlanClaim.plan.frontMatter).toMatchObject({ plan_id: 1, sub_plan: "a" });
      expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })).toContain(
        "claim plan 1a"
      );

      const patch = (await fetch(`${baseUrl}/api/workspaces/alpha/plans/2`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "running", completion: 10 })
      }).then((response) => response.json())) as { plan: { frontMatter: { status: string; completion: number } } };
      expect(patch.plan.frontMatter.status).toBe("running");
      expect(patch.plan.frontMatter.completion).toBe(10);
      expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })).toContain(
        "set plan 2 running"
      );

      const sections = (await fetch(`${baseUrl}/api/workspaces/alpha/sections`).then((response) =>
        response.json()
      )) as { sections: Array<{ id: string; enabled: boolean }> };
      expect(sections.sections.find((section) => section.id === "drafts")?.enabled).toBe(false);

      const toggle = await fetch(`${baseUrl}/api/workspaces/alpha/sections/drafts`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true })
      });
      expect(toggle.status).toBe(200);
      expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })).toContain(
        "enable drafts in alpha"
      );

      const files = (await fetch(`${baseUrl}/api/workspaces/alpha/sections/drafts/files`).then((response) =>
        response.json()
      )) as { files: Array<{ name: string; title: string; path: string }> };
      expect(files.files).toEqual([{ name: "draft-alpha.md", title: "Alpha Draft Note", path: "alpha/drafts/draft-alpha.md" }]);

      const file = (await fetch(`${baseUrl}/api/workspaces/alpha/sections/drafts/files/draft-alpha.md`).then((response) =>
        response.json()
      )) as { content: string };
      expect(file.content).toContain("Alpha Draft Heading");

      const resolutions = (await fetch(`${baseUrl}/api/workspaces/alpha/resolutions`).then((response) =>
        response.json()
      )) as { resolutions: Array<{ id: number; status: string; title: string }> };
      expect(resolutions.resolutions).toMatchObject([{ id: 1, status: "open", title: "Fixture Architecture Choice" }]);

      const resolution = (await fetch(`${baseUrl}/api/workspaces/alpha/resolutions/1`).then((response) =>
        response.json()
      )) as { resolution: { frontMatter: { plans: string[] }; body: string } };
      expect(resolution.resolution.frontMatter.plans).toEqual(["plan-1", "plan-2"]);
      expect(resolution.resolution.body).toContain("## Position: alpha-agent");

      const invalidResolution = await fetch(`${baseUrl}/api/workspaces/alpha/resolutions/not-a-number`);
      expect(invalidResolution.status).toBe(400);

      const openedResolution = (await fetch(`${baseUrl}/api/workspaces/alpha/resolutions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "REST Resolution Smoke",
          plans: ["33", "30a"],
          parties: ["rest-agent", "reviewer"],
          conflict: "REST smoke conflict"
        })
      }).then((response) => response.json())) as { resolution: { summary: { id: number } } };
      expect(openedResolution.resolution.summary.id).toBe(2);
      expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: fixtureRoot, encoding: "utf8" })).toContain(
        "open resolution 2"
      );

      const respondedResolution = (await fetch(`${baseUrl}/api/workspaces/alpha/resolutions/2/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ party: "rest-agent", position: "REST response position" })
      }).then((response) => response.json())) as { resolution: { body: string } };
      expect(respondedResolution.resolution.body).toContain("## Position: rest-agent");

      const decidedResolution = (await fetch(`${baseUrl}/api/workspaces/alpha/resolutions/2/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "REST decision", status: "withdrawn" })
      }).then((response) => response.json())) as { resolution: { frontMatter: { status: string; decided: string } } };
      expect(decidedResolution.resolution.frontMatter.status).toBe("withdrawn");
      expect(decidedResolution.resolution.frontMatter.decided).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      server.stop(true);
    }
  });
});

describe("plansman MCP", () => {
  test("real stdio client initializes, lists tools, and calls plans_list", async () => {
    const fixtureRoot = prepareFixtureRepo("ws-two");
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["run", "mcp"],
      cwd: repoRoot,
      env: {
        ...process.env,
        TMPDIR: path.join(repoRoot, ".tmp"),
        BUN_INSTALL_CACHE_DIR: path.join(repoRoot, ".bun-cache"),
        PLANSMAN_ROOT: fixtureRoot
      } as Record<string, string>,
      stderr: "pipe"
    });
    const client = new Client({ name: "plansman-test", version: "0.1.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "backlog_add",
        "backlog_done",
        "backlog_list",
        "ideas_add",
        "ideas_dismiss",
        "ideas_get",
        "ideas_list",
        "ideas_note",
        "ideas_promote",
        "ideas_shape",
        "plans_claim",
        "plans_complete",
        "plans_create",
        "plans_get",
        "plans_lint",
        "plans_list",
        "plans_set_status",
        "resolutions_decide",
        "resolutions_get",
        "resolutions_list",
        "resolutions_open",
        "resolutions_respond",
        "sections_list"
      ]);

      const result = await client.callTool({ name: "plans_list", arguments: { workspace: "beta" } });
      const content = result.content as Array<{ type: string; text?: string }>;
      const text = content.find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(text)).plans).toMatchObject([{ title: "Beta First Plan" }]);

      const completed = await client.callTool({
        name: "plans_complete",
        arguments: {
          id: 1,
          workspace: "beta",
          deferrals: [{ title: "Publish packages", category: "release", reason: "Requires authorization" }]
        }
      });
      const completedText = (completed.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(completedText)).backlog[0].summary.label).toBe("B-1");
      const backlog = await client.callTool({ name: "backlog_list", arguments: { workspace: "beta" } });
      const backlogText = (backlog.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(backlogText)).backlog).toMatchObject([{ label: "B-1", sourcePlan: "1" }]);

      const capturedIdea = await client.callTool({
        name: "ideas_add",
        arguments: { title: "Agent-visible idea", workspace: "beta" }
      });
      const capturedIdeaText = (capturedIdea.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(capturedIdeaText)).idea.summary).toMatchObject({ kind: "idea", status: "inbox" });
      const ideas = await client.callTool({ name: "ideas_list", arguments: { workspace: "beta" } });
      const ideasText = (ideas.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(ideasText)).ideas).toMatchObject([{ title: "Agent-visible idea", status: "inbox" }]);

      const shapedIdea = await client.callTool({
        name: "ideas_shape",
        arguments: {
          id: "B-2",
          prd,
          objective: "Persist product intent.",
          requirements: "Store goals and provenance.",
          forbidden: "Do not create another storage system.",
          workspace: "beta"
        }
      });
      const shapedIdeaText = (shapedIdea.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(shapedIdeaText)).idea.summary.status).toBe("shaped");

      const created = await client.callTool({
        name: "plans_create",
        arguments: {
          title: "MCP Goal-Complete Plan",
          prd,
          objective: "MCP-created plans state success.",
          requirements: "Persist every goal field.",
          forbidden: "Do not emit placeholders.",
          workspace: "beta"
        }
      });
      const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      const createdPayload = JSON.parse(String(createdText)) as { plan: { raw: string } };
      expect(createdPayload.plan.raw).toContain("MCP-created plans state success.");
      expect(createdPayload.plan.raw).toContain("## Problem Statement");
      expect(createdPayload.plan.raw).not.toContain("_Not restated yet");

      const sections = await client.callTool({ name: "sections_list", arguments: { workspace: "alpha" } });
      const sectionsText = (sections.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(sectionsText)).sections.map((section: { id: string }) => section.id)).toEqual([
        "drafts",
        "improvements"
      ]);

      const resolutions = await client.callTool({ name: "resolutions_list", arguments: { workspace: "alpha" } });
      const resolutionsText = (resolutions.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(resolutionsText)).resolutions).toMatchObject([{ id: 1, status: "open" }]);

      const resolution = await client.callTool({ name: "resolutions_get", arguments: { workspace: "alpha", id: 1 } });
      const resolutionText = (resolution.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
      expect(JSON.parse(String(resolutionText)).resolution.body).toContain("## Conflict");
    } finally {
      await client.close();
    }
  });
});
