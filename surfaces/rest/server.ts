import fs from "node:fs";
import path from "node:path";
import { createPlansmanSdk, type PlansmanSdkOptions } from "../sdk";
import { ErrorEnvelopeSchema, PlanStatusSchema, ResolutionStatusSchema, type ErrorEnvelope } from "../contracts/plansman.v1";
import { WorkspaceError } from "../../src/core/workspaces";

export type RestServerOptions = PlansmanSdkOptions & {
  port?: number;
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

function errorEnvelope(code: string, message: string, status: number, details?: unknown): Response {
  const payload: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  };
  return json(ErrorEnvelopeSchema.parse(payload), { status });
}

function routePlanId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/plans\/(\d+[a-z]?|plan-[A-Za-z0-9-]+)$/);
  return match?.[1] ?? null;
}

function segments(pathname: string): string[] {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function routeResolutionId(value: string): string | null {
  return /^\d+$/.test(value) ? value : null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function planDefinition(body: Record<string, unknown>): { objective: string; requirements: string; forbidden: string; prd: string } | null {
  const hasDefinitionField = ["objective", "requirements", "forbidden", "prd"].some((field) => Object.hasOwn(body, field));
  if (!hasDefinitionField) return null;
  return {
    objective: typeof body.objective === "string" ? body.objective : "",
    requirements: typeof body.requirements === "string" ? body.requirements : "",
    forbidden: typeof body.forbidden === "string" ? body.forbidden : "",
    prd: typeof body.prd === "string" ? body.prd : ""
  };
}

function backlogInput(body: Record<string, unknown>) {
  return {
    title: typeof body.title === "string" ? body.title : "",
    category: typeof body.category === "string" ? body.category : "general",
    reason: typeof body.reason === "string" ? body.reason : "",
    sourcePlan: typeof body.sourcePlan === "string" ? body.sourcePlan : undefined,
    proofRequirement: typeof body.proofRequirement === "string" ? body.proofRequirement : undefined
  };
}

function deferrals(body: Record<string, unknown>) {
  return Array.isArray(body.deferrals)
    ? body.deferrals.map((value) => backlogInput(typeof value === "object" && value !== null ? value as Record<string, unknown> : {}))
    : [];
}

function ideaTitle(body: Record<string, unknown>): string {
  return typeof body.title === "string" ? body.title : "";
}

function ideaNote(body: Record<string, unknown>): string {
  return typeof body.note === "string" ? body.note : "";
}

function ideaPromotion(body: Record<string, unknown>) {
  return {
    objective: typeof body.objective === "string" ? body.objective : undefined,
    requirements: typeof body.requirements === "string" ? body.requirements : undefined,
    forbidden: typeof body.forbidden === "string" ? body.forbidden : undefined,
    target: typeof body.target === "string" || typeof body.target === "number" ? body.target : undefined
  };
}

function ideaShape(body: Record<string, unknown>) {
  return {
    title: typeof body.title === "string" ? body.title : undefined,
    prd: typeof body.prd === "string" ? body.prd : "",
    objective: typeof body.objective === "string" ? body.objective : "",
    requirements: typeof body.requirements === "string" ? body.requirements : "",
    forbidden: typeof body.forbidden === "string" ? body.forbidden : ""
  };
}

async function staticResponse(pathname: string): Promise<Response | null> {
  const distDir = path.resolve(process.cwd(), "apps/web/dist");
  if (!fs.existsSync(distDir)) return null;

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const candidate = path.resolve(distDir, relativePath);
  const safePath = candidate.startsWith(distDir) && fs.existsSync(candidate) ? candidate : path.join(distDir, "index.html");

  if (!fs.existsSync(safePath)) return null;
  return new Response(Bun.file(safePath));
}

export function createRestServer(options: RestServerOptions = {}) {
  const sdk = createPlansmanSdk(options);
  const requestedPort = options.port ?? Number(process.env.PORT ?? process.env.PLANSMAN_PORT ?? 4000);
  const fetch = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);

      try {
        const parts = segments(url.pathname);

        if (request.method === "GET" && url.pathname === "/api/workspaces") {
          return json({ workspaces: await sdk.workspaces.list() });
        }

        if (parts[0] === "api" && parts[1] === "workspaces" && parts[2]) {
          const workspace = parts[2];

          if (request.method === "GET" && parts.length === 4 && parts[3] === "plans") {
            return json({ plans: await sdk.plans.list(workspace) });
          }

          if (request.method === "GET" && parts.length === 4 && parts[3] === "resolutions") {
            return json({ resolutions: await sdk.resolutions.list(workspace) });
          }

          if (request.method === "GET" && parts.length === 4 && parts[3] === "backlog") {
            return json({ backlog: await sdk.backlog.list(workspace) });
          }

          if (request.method === "GET" && parts.length === 4 && parts[3] === "ideas") {
            return json({ ideas: await sdk.ideas.list(workspace) });
          }

          if (request.method === "POST" && parts.length === 4 && parts[3] === "ideas") {
            return json(await sdk.ideas.add({ title: ideaTitle(await readJson(request)), workspace }), { status: 201 });
          }

          if (request.method === "POST" && parts.length === 5 && parts[3] === "ideas" && parts[4] === "shape") {
            return json(await sdk.ideas.shape({ ...ideaShape(await readJson(request)), workspace }), { status: 201 });
          }

          if (request.method === "POST" && parts.length === 4 && parts[3] === "backlog") {
            return json(await sdk.backlog.add({ ...backlogInput(await readJson(request)), workspace }), { status: 201 });
          }

          if (request.method === "POST" && parts.length === 4 && parts[3] === "resolutions") {
            const body = await readJson(request);
            const title = typeof body.title === "string" ? body.title : "";
            const plans = Array.isArray(body.plans) ? body.plans.map(String) : [];
            const parties = Array.isArray(body.parties) ? body.parties.map(String) : [];
            const conflict = typeof body.conflict === "string" ? body.conflict : "";
            return json(await sdk.resolutions.open({ title, plans, parties, conflict, workspace }), { status: 201 });
          }

          if (request.method === "POST" && parts.length === 4 && parts[3] === "plans") {
            const body = await readJson(request);
            const title = typeof body.title === "string" ? body.title : "";
            const target = typeof body.target === "string" || typeof body.target === "number" ? body.target : undefined;
            if (!title.trim()) return errorEnvelope("USAGE", "title is required", 400);
            const definition = planDefinition(body);
            const result = definition
              ? await sdk.plans.create({ title, target, workspace, ...definition })
              : await sdk.plans.claim({ title, target, workspace });
            return json(result, { status: 201 });
          }

          if (parts.length === 5 && parts[3] === "plans") {
            const planId = parts[4];
            if (request.method === "GET") return json({ plan: await sdk.plans.get(planId, workspace) });
            if (request.method === "PATCH") {
              const body = await readJson(request);
              const status = PlanStatusSchema.parse(body.status);
              const completion = body.completion === undefined ? undefined : Number(body.completion);
              const overrideResolutions = body.overrideResolutions === true;
              const overrideRestatement = body.overrideRestatement === true;
              return json(await sdk.plans.setStatus({ id: planId, status, completion, workspace, overrideResolutions, overrideRestatement }));
            }
          }

          if (request.method === "POST" && parts.length === 6 && parts[3] === "plans" && parts[5] === "complete") {
            const body = await readJson(request);
            return json(await sdk.plans.complete({
              id: parts[4],
              deferrals: deferrals(body),
              workspace,
              overrideResolutions: body.overrideResolutions === true,
              overrideRestatement: body.overrideRestatement === true
            }));
          }

          if (request.method === "POST" && parts.length === 6 && parts[3] === "backlog" && parts[5] === "done") {
            return json(await sdk.backlog.done(parts[4], workspace));
          }

          if (parts.length >= 5 && parts[3] === "ideas") {
            const ideaId = parts[4];
            if (request.method === "GET" && parts.length === 5) {
              return json({ idea: await sdk.ideas.get(ideaId, workspace) });
            }
            if (request.method === "POST" && parts.length === 6 && parts[5] === "notes") {
              return json(await sdk.ideas.note({ id: ideaId, note: ideaNote(await readJson(request)), workspace }));
            }
            if (request.method === "POST" && parts.length === 6 && parts[5] === "shape") {
              return json(await sdk.ideas.shape({ id: ideaId, ...ideaShape(await readJson(request)), title: undefined, workspace }));
            }
            if (request.method === "POST" && parts.length === 6 && parts[5] === "dismiss") {
              const body = await readJson(request);
              return json(await sdk.ideas.dismiss({
                id: ideaId,
                reason: typeof body.reason === "string" ? body.reason : "",
                workspace
              }));
            }
            if (request.method === "POST" && parts.length === 6 && parts[5] === "promote") {
              return json(await sdk.ideas.promote({ id: ideaId, ...ideaPromotion(await readJson(request)), workspace }));
            }
          }

          if (parts.length >= 5 && parts[3] === "resolutions") {
            const resolutionId = routeResolutionId(parts[4]);
            if (!resolutionId) return errorEnvelope("INVALID_RESOLUTION_ID", "Invalid resolution id", 400);

            if (request.method === "GET" && parts.length === 5) {
              return json({ resolution: await sdk.resolutions.get(resolutionId, workspace) });
            }

            if (request.method === "POST" && parts.length === 6 && parts[5] === "respond") {
              const body = await readJson(request);
              const party = typeof body.party === "string" ? body.party : "";
              const position = typeof body.position === "string" ? body.position : "";
              return json(await sdk.resolutions.respond({ id: resolutionId, party, position, workspace }));
            }

            if (request.method === "POST" && parts.length === 6 && parts[5] === "decide") {
              const body = await readJson(request);
              const decision = typeof body.decision === "string" ? body.decision : "";
              const status = body.status === undefined ? undefined : ResolutionStatusSchema.parse(body.status);
              return json(await sdk.resolutions.decide({ id: resolutionId, decision, status, workspace }));
            }
          }

          if (request.method === "GET" && parts.length === 4 && parts[3] === "lint") {
            const report = await sdk.plans.lint(workspace);
            return json(report, { status: report.ok ? 200 : 422 });
          }

          if (request.method === "GET" && parts.length === 4 && parts[3] === "sections") {
            return json({ sections: await sdk.sections.list(workspace) });
          }

          if (request.method === "PATCH" && parts.length === 5 && parts[3] === "sections") {
            const body = await readJson(request);
            if (typeof body.enabled !== "boolean") return errorEnvelope("USAGE", "enabled is required", 400);
            return json(await sdk.sections.toggle(workspace, parts[4], body.enabled));
          }

          if (request.method === "GET" && parts.length === 6 && parts[3] === "sections" && parts[5] === "files") {
            return json({ files: await sdk.sections.files(workspace, parts[4]) });
          }

          if (request.method === "GET" && parts.length === 7 && parts[3] === "sections" && parts[5] === "files") {
            return json(await sdk.sections.read(workspace, parts[4], parts[6]));
          }
        }

        if (request.method === "GET" && url.pathname === "/api/plans") {
          return json({ plans: await sdk.plans.list() });
        }

        if (request.method === "GET" && url.pathname === "/api/backlog") {
          return json({ backlog: await sdk.backlog.list() });
        }

        if (request.method === "GET" && url.pathname === "/api/ideas") {
          return json({ ideas: await sdk.ideas.list() });
        }

        if (request.method === "POST" && url.pathname === "/api/ideas") {
          return json(await sdk.ideas.add({ title: ideaTitle(await readJson(request)) }), { status: 201 });
        }

        if (request.method === "POST" && url.pathname === "/api/ideas/shape") {
          return json(await sdk.ideas.shape(ideaShape(await readJson(request))), { status: 201 });
        }

        if (request.method === "POST" && url.pathname === "/api/backlog") {
          return json(await sdk.backlog.add(backlogInput(await readJson(request))), { status: 201 });
        }

        const planId = routePlanId(url.pathname);
        if (request.method === "GET" && planId) {
          return json({ plan: await sdk.plans.get(planId) });
        }

        if (request.method === "POST" && url.pathname === "/api/plans") {
          const body = await readJson(request);
          const title = typeof body.title === "string" ? body.title : "";
          const target = typeof body.target === "string" || typeof body.target === "number" ? body.target : undefined;
          if (!title.trim()) return errorEnvelope("USAGE", "title is required", 400);
          const definition = planDefinition(body);
          const result = definition
            ? await sdk.plans.create({ title, target, ...definition })
            : await sdk.plans.claim({ title, target });
          return json(result, { status: 201 });
        }

        if (request.method === "PATCH" && planId) {
          const body = await readJson(request);
          const status = PlanStatusSchema.parse(body.status);
          const completion = body.completion === undefined ? undefined : Number(body.completion);
          const overrideResolutions = body.overrideResolutions === true;
          const overrideRestatement = body.overrideRestatement === true;
          return json(await sdk.plans.setStatus({ id: planId, status, completion, overrideResolutions, overrideRestatement }));
        }

        const completeMatch = url.pathname.match(/^\/api\/plans\/(\d+[a-z]?|plan-[A-Za-z0-9-]+)\/complete$/);
        if (request.method === "POST" && completeMatch) {
          const body = await readJson(request);
          return json(await sdk.plans.complete({
            id: completeMatch[1],
            deferrals: deferrals(body),
            overrideResolutions: body.overrideResolutions === true,
            overrideRestatement: body.overrideRestatement === true
          }));
        }

        const backlogDoneMatch = url.pathname.match(/^\/api\/backlog\/(?:B-)?(\d+)\/done$/i);
        if (request.method === "POST" && backlogDoneMatch) {
          return json(await sdk.backlog.done(backlogDoneMatch[1]));
        }

        const ideaMatch = url.pathname.match(/^\/api\/ideas\/(?:B-)?(\d+)(?:\/(notes|shape|dismiss|promote))?$/i);
        if (ideaMatch) {
          const id = ideaMatch[1];
          const action = ideaMatch[2];
          if (request.method === "GET" && !action) return json({ idea: await sdk.ideas.get(id) });
          if (request.method === "POST" && action === "notes") {
            return json(await sdk.ideas.note({ id, note: ideaNote(await readJson(request)) }));
          }
          if (request.method === "POST" && action === "shape") {
            return json(await sdk.ideas.shape({ id, ...ideaShape(await readJson(request)), title: undefined }));
          }
          if (request.method === "POST" && action === "dismiss") {
            const body = await readJson(request);
            return json(await sdk.ideas.dismiss({ id, reason: typeof body.reason === "string" ? body.reason : "" }));
          }
          if (request.method === "POST" && action === "promote") {
            return json(await sdk.ideas.promote({ id, ...ideaPromotion(await readJson(request)) }));
          }
        }

        if (request.method === "GET" && url.pathname === "/api/lint") {
          const report = await sdk.plans.lint();
          return json(report, { status: report.ok ? 200 : 422 });
        }

        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          return errorEnvelope("NOT_FOUND", "API route not found", 404);
        }

        const staticFile = await staticResponse(url.pathname);
        if (request.method === "GET" && staticFile) return staticFile;

        return errorEnvelope("NOT_FOUND", "Not found", 404);
      } catch (error) {
        if (error instanceof WorkspaceError) {
          return errorEnvelope(error.code, error.message, error.status, error.details);
        }
        const message = error instanceof Error ? error.message : String(error);
        return errorEnvelope("DOMAIN", message, 400);
      }
  };

  if (requestedPort !== 0) return Bun.serve({ port: requestedPort, fetch });

  // Bun 1.3 does not consistently treat port 0 as an ephemeral-port request.
  // Retry randomized high ports so concurrent test workers cannot make the
  // public createRestServer({ port: 0 }) contract flaky.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 49_152 + Math.floor(Math.random() * 16_000);
    try {
      return Bun.serve({ port, fetch });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("Unable to allocate a Plansman REST test port after 20 attempts.");
}

if (import.meta.main) {
  const server = createRestServer();
  console.error(`plansman REST listening on ${process.env.PORTLESS_URL ?? `http://localhost:${server.port}`}`);
}
