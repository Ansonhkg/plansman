#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPlansmanSdk } from "../../sdk";
import { PlanStatusSchema, ResolutionStatusSchema } from "../../contracts/plansman.v1";

function toolJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value)
      }
    ],
    structuredContent: value as Record<string, unknown>
  };
}

export function createMcpServer() {
  const sdk = createPlansmanSdk();
  const server = new McpServer({
    name: "plansman",
    version: "0.1.0"
  });

  server.registerTool(
    "plans_list",
    {
      title: "List plans",
      description: "List plans from the Plansman corpus",
      inputSchema: {
        workspace: z.string().optional()
      }
    },
    async ({ workspace }) => toolJson({ plans: await sdk.plans.list(workspace) })
  );

  server.registerTool(
    "plans_get",
    {
      title: "Get plan",
      description: "Get a plan by id",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        workspace: z.string().optional()
      }
    },
    async ({ id, workspace }) => toolJson({ plan: await sdk.plans.get(id, workspace) })
  );

  server.registerTool(
    "plans_lint",
    {
      title: "Lint plans",
      description: "Run Plansman lint",
      inputSchema: {
        workspace: z.string().optional()
      }
    },
    async ({ workspace }) => toolJson(await sdk.plans.lint(workspace))
  );

  server.registerTool(
    "plans_claim",
    {
      title: "Claim plan",
      description: "Claim the next plan id, or an explicit target like 30b, and commit it",
      inputSchema: {
        title: z.string(),
        target: z.union([z.string(), z.number()]).optional(),
        workspace: z.string().optional()
      }
    },
    async ({ title, target, workspace }) => toolJson(await sdk.plans.claim({ title, target, workspace }))
  );

  server.registerTool(
    "plans_create",
    {
      title: "Create self-contained PRD plan",
      description: "Create and commit a plan containing the complete PRD plus its objective, non-negotiable requirements, and forbidden substitutes",
      inputSchema: {
        title: z.string(),
        prd: z.string(),
        objective: z.string(),
        requirements: z.string(),
        forbidden: z.string(),
        target: z.union([z.string(), z.number()]).optional(),
        workspace: z.string().optional()
      }
    },
    async ({ title, prd, objective, requirements, forbidden, target, workspace }) =>
      toolJson(await sdk.plans.create({ title, prd, objective, requirements, forbidden, target, workspace }))
  );

  server.registerTool(
    "plans_set_status",
    {
      title: "Set plan status",
      description: "Set a plan status/completion and commit it",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        status: PlanStatusSchema,
        completion: z.number().optional(),
        workspace: z.string().optional(),
        overrideResolutions: z.boolean().optional(),
        overrideRestatement: z.boolean().optional()
      }
    },
    async ({ id, status, completion, workspace, overrideResolutions, overrideRestatement }) =>
      toolJson(await sdk.plans.setStatus({ id, status, completion, workspace, overrideResolutions, overrideRestatement }))
  );

  server.registerTool(
    "plans_complete",
    {
      title: "Complete plan",
      description: "Complete a plan and atomically move explicit future work into the workspace backlog",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        deferrals: z.array(z.object({
          title: z.string(),
          category: z.string(),
          reason: z.string(),
          proofRequirement: z.string().optional()
        })).optional(),
        workspace: z.string().optional(),
        overrideResolutions: z.boolean().optional(),
        overrideRestatement: z.boolean().optional()
      }
    },
    async ({ id, deferrals, workspace, overrideResolutions, overrideRestatement }) =>
      toolJson(await sdk.plans.complete({ id, deferrals, workspace, overrideResolutions, overrideRestatement }))
  );

  server.registerTool(
    "ideas_list",
    {
      title: "List ideas",
      description: "List every captured workspace idea, including inbox, promoted, and dismissed ideas, so a user can choose one to discuss",
      inputSchema: { workspace: z.string().optional() }
    },
    async ({ workspace }) => toolJson({ ideas: await sdk.ideas.list(workspace) })
  );

  server.registerTool(
    "ideas_get",
    {
      title: "Get idea",
      description: "Get a captured idea and its discussion history",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        workspace: z.string().optional()
      }
    },
    async ({ id, workspace }) => toolJson({ idea: await sdk.ideas.get(id, workspace) })
  );

  server.registerTool(
    "ideas_add",
    {
      title: "Capture idea",
      description: "Durably capture a title-only idea in the workspace inbox",
      inputSchema: {
        title: z.string(),
        workspace: z.string().optional()
      }
    },
    async ({ title, workspace }) => toolJson(await sdk.ideas.add({ title, workspace }))
  );

  server.registerTool(
    "ideas_note",
    {
      title: "Add idea discussion note",
      description: "Append a durable discussion note to an active inbox idea",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        note: z.string(),
        workspace: z.string().optional()
      }
    },
    async ({ id, note, workspace }) => toolJson(await sdk.ideas.note({ id, note, workspace }))
  );

  server.registerTool(
    "ideas_shape",
    {
      title: "Shape idea into PRD",
      description: "Store a validated PRD and explicit goal contract on an existing or newly captured idea",
      inputSchema: {
        id: z.union([z.string(), z.number()]).optional(),
        title: z.string().optional(),
        prd: z.string(),
        objective: z.string(),
        requirements: z.string(),
        forbidden: z.string(),
        workspace: z.string().optional()
      }
    },
    async ({ id, title, prd, objective, requirements, forbidden, workspace }) =>
      toolJson(await sdk.ideas.shape({ id, title, prd, objective, requirements, forbidden, workspace }))
  );

  server.registerTool(
    "ideas_dismiss",
    {
      title: "Dismiss idea",
      description: "Dismiss an inbox idea while preserving its history and the reason",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        reason: z.string(),
        workspace: z.string().optional()
      }
    },
    async ({ id, reason, workspace }) => toolJson(await sdk.ideas.dismiss({ id, reason, workspace }))
  );

  server.registerTool(
    "ideas_promote",
    {
      title: "Promote idea to plan",
      description: "Atomically promote a developed inbox idea into a goal-complete plan and preserve the link",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        objective: z.string().optional(),
        requirements: z.string().optional(),
        forbidden: z.string().optional(),
        target: z.union([z.string(), z.number()]).optional(),
        workspace: z.string().optional()
      }
    },
    async ({ id, objective, requirements, forbidden, target, workspace }) =>
      toolJson(await sdk.ideas.promote({ id, objective, requirements, forbidden, target, workspace }))
  );

  server.registerTool(
    "backlog_list",
    {
      title: "List backlog",
      description: "List durable workspace backlog items",
      inputSchema: { workspace: z.string().optional() }
    },
    async ({ workspace }) => toolJson({ backlog: await sdk.backlog.list(workspace) })
  );

  server.registerTool(
    "backlog_add",
    {
      title: "Add backlog item",
      description: "Add and commit a durable workspace backlog item",
      inputSchema: {
        title: z.string(),
        category: z.string(),
        reason: z.string(),
        sourcePlan: z.string().optional(),
        proofRequirement: z.string().optional(),
        workspace: z.string().optional()
      }
    },
    async ({ title, category, reason, sourcePlan, proofRequirement, workspace }) =>
      toolJson(await sdk.backlog.add({ title, category, reason, sourcePlan, proofRequirement, workspace }))
  );

  server.registerTool(
    "backlog_done",
    {
      title: "Complete backlog item",
      description: "Mark and commit a workspace backlog item as done",
      inputSchema: { id: z.union([z.string(), z.number()]), workspace: z.string().optional() }
    },
    async ({ id, workspace }) => toolJson(await sdk.backlog.done(id, workspace))
  );

  server.registerTool(
    "sections_list",
    {
      title: "List sections",
      description: "List workspace sections",
      inputSchema: {
        workspace: z.string().optional()
      }
    },
    async ({ workspace }) => toolJson({ sections: await sdk.sections.list(workspace) })
  );

  server.registerTool(
    "resolutions_list",
    {
      title: "List resolutions",
      description: "List workspace resolutions",
      inputSchema: {
        workspace: z.string().optional()
      }
    },
    async ({ workspace }) => toolJson({ resolutions: await sdk.resolutions.list(workspace) })
  );

  server.registerTool(
    "resolutions_get",
    {
      title: "Get resolution",
      description: "Get a resolution by numeric id",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        workspace: z.string().optional()
      }
    },
    async ({ id, workspace }) => toolJson({ resolution: await sdk.resolutions.get(id, workspace) })
  );

  server.registerTool(
    "resolutions_open",
    {
      title: "Open resolution",
      description: "Open a new resolution and commit it",
      inputSchema: {
        title: z.string(),
        plans: z.array(z.string()),
        parties: z.array(z.string()),
        conflict: z.string(),
        workspace: z.string().optional()
      }
    },
    async ({ title, plans, parties, conflict, workspace }) =>
      toolJson(await sdk.resolutions.open({ title, plans, parties, conflict, workspace }))
  );

  server.registerTool(
    "resolutions_respond",
    {
      title: "Respond to resolution",
      description: "Append a party position to a resolution and commit it",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        party: z.string(),
        position: z.string(),
        workspace: z.string().optional()
      }
    },
    async ({ id, party, position, workspace }) =>
      toolJson(await sdk.resolutions.respond({ id, party, position, workspace }))
  );

  server.registerTool(
    "resolutions_decide",
    {
      title: "Decide resolution",
      description: "Set a resolution decision and commit it",
      inputSchema: {
        id: z.union([z.string(), z.number()]),
        decision: z.string(),
        status: ResolutionStatusSchema.optional(),
        workspace: z.string().optional()
      }
    },
    async ({ id, decision, status, workspace }) =>
      toolJson(await sdk.resolutions.decide({ id, decision, status, workspace }))
  );

  return server;
}

if (import.meta.main) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
