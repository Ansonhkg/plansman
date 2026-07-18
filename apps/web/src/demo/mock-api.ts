import type {IdeaDetail, PlanDetail, PlanStatus} from "../data/tracker";
import {
  demoIdeaDetails,
  demoIdeas,
  demoLintReport,
  demoPlanDetails,
  demoPlans,
  demoResolutionDetails,
  demoResolutions,
  demoSectionContent,
  demoSectionFiles,
  demoWorkspaces,
  setDemoPlanDetail,
  setDemoIdeaDetail,
} from "./mock-data";

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}

function error(message: string, status = 404) {
  return json({error: {code: status === 404 ? "NOT_FOUND" : "DEMO", message}}, {status});
}

function segments(pathname: string) {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function planStemFromId(id: string) {
  if (/^\d+[a-z]?$/.test(id)) return `plan-${id}`;
  return id.replace(/\.md$/, "");
}

async function readBody(request: Request) {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clonePlan(detail: PlanDetail, patch: Partial<PlanDetail["summary"]>): PlanDetail {
  const summary = {...detail.summary, ...patch};
  return {
    ...detail,
    summary,
    frontMatter: {
      ...detail.frontMatter,
      title: summary.title,
      completion: summary.completion,
      status: summary.status,
    },
  };
}

async function handleDemoRequest(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api")) return null;

  const parts = segments(url.pathname);
  const workspace = parts[0] === "api" && parts[1] === "workspaces" ? parts[2] : null;

  if (request.method === "GET" && url.pathname === "/api/workspaces") {
    return json({workspaces: demoWorkspaces});
  }

  if (!workspace) return error("Demo workspace not found");
  if (workspace !== demoWorkspaces[0]?.slug) return error(`Unknown demo workspace: ${workspace}`);

  if (request.method === "GET" && parts.length === 4 && parts[3] === "plans") {
    return json({plans: demoPlans()});
  }

  if (request.method === "GET" && parts.length === 4 && parts[3] === "ideas") {
    return json({ideas: demoIdeas()});
  }

  if (request.method === "POST" && parts.length === 4 && parts[3] === "ideas") {
    const body = await readBody(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return error("Idea title is required", 400);
    const id = Math.max(0, ...demoIdeas().map((idea) => idea.id)) + 1;
    const label = `B-${id}`;
    const idea: IdeaDetail = {
      summary: {id, label, fileName: `backlog-${id}.md`, kind: "idea", title, status: "inbox", created: "2026-07-16"},
      frontMatter: {backlog_id: id, kind: "idea", title, status: "inbox", created: "2026-07-16"},
      body: "## Discussion\n",
      raw: "## Discussion\n",
    };
    setDemoIdeaDetail(label, idea);
    return json({idea}, {status: 201});
  }

  if (parts.length >= 5 && parts[3] === "ideas") {
    const label = parts[4].match(/^B-/i) ? parts[4].toUpperCase() : `B-${parts[4]}`;
    const detail = demoIdeaDetails[label];
    if (!detail) return error(`Idea not found: ${parts[4]}`);
    if (request.method === "GET" && parts.length === 5) return json({idea: detail});

    if (request.method === "POST" && parts.length === 6 && parts[5] === "notes") {
      const body = await readBody(request);
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!note) return error("Idea note is required", 400);
      const next = {...detail, body: `${detail.body.trimEnd()}\n\n- ${new Date().toISOString()}: ${note}\n`};
      setDemoIdeaDetail(label, next);
      return json({idea: next});
    }

    if (request.method === "POST" && parts.length === 6 && parts[5] === "shape") {
      if (detail.summary.status !== "inbox" && detail.summary.status !== "shaped") return error("Idea is not active", 400);
      const body = await readBody(request);
      const prd = typeof body.prd === "string" ? body.prd.trim() : "";
      const objective = typeof body.objective === "string" ? body.objective.trim() : "";
      const requirements = typeof body.requirements === "string" ? body.requirements.trim() : "";
      const forbidden = typeof body.forbidden === "string" ? body.forbidden.trim() : "";
      const headings = ["Problem Statement", "Solution", "User Stories", "Implementation Decisions", "Testing Decisions", "Release Decisions", "Documentation Decisions", "Out of Scope", "Further Notes"];
      if (!prd || headings.some((heading) => !prd.includes(`## ${heading}`)) || !objective || !requirements || !forbidden) {
        return error("Complete PRD sections and goals are required", 400);
      }
      const managed = `<!-- plansman:prd:start -->\n${prd}\n<!-- plansman:prd:end -->`;
      const currentBody = detail.body.replace(/<!-- plansman:prd:start -->[\s\S]*?<!-- plansman:prd:end -->\n*/m, "");
      const shaped = new Date().toISOString();
      const next: IdeaDetail = {
        ...detail,
        summary: {...detail.summary, status: "shaped", shaped},
        frontMatter: {...detail.frontMatter, status: "shaped", shaped, objective, requirements, forbidden},
        body: `${managed}\n\n${currentBody.trimStart()}`,
      };
      setDemoIdeaDetail(label, next);
      return json({idea: next});
    }

    if (request.method === "POST" && parts.length === 6 && parts[5] === "dismiss") {
      const body = await readBody(request);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return error("Dismissal reason is required", 400);
      const next: IdeaDetail = {
        ...detail,
        summary: {...detail.summary, status: "dismissed", reason, completed: "2026-07-16"},
        frontMatter: {...detail.frontMatter, status: "dismissed", reason, completed: "2026-07-16"},
        body: `${detail.body.trimEnd()}\n\n## Outcome\n\nDismissed: ${reason}\n`,
      };
      setDemoIdeaDetail(label, next);
      return json({idea: next});
    }

    if (request.method === "POST" && parts.length === 6 && parts[5] === "promote") {
      if (detail.summary.status !== "shaped") return error("Shape the idea into a PRD before promotion", 400);
      const objective = detail.frontMatter.objective ?? "";
      const requirements = detail.frontMatter.requirements ?? "";
      const forbidden = detail.frontMatter.forbidden ?? "";
      if (!objective || !requirements || !forbidden) return error("Every promotion goal is required", 400);
      const prd = detail.body.match(/<!-- plansman:prd:start -->\n([\s\S]*?)\n<!-- plansman:prd:end -->/)?.[1]?.trim();
      if (!prd) return error("The shaped idea has no managed PRD", 400);
      const nextId = Math.max(...demoPlans().map((plan) => plan.id)) + 1;
      const fileName = `plan-${nextId}.md`;
      const basePlan = clonePlan(Object.values(demoPlanDetails)[0], {
        id: nextId,
        label: `plan-${nextId}`,
        fileName,
        title: detail.summary.title,
        status: "not started",
        completion: 0,
        followUp: demoPlans().slice(-1)[0]?.id,
      });
      const plan: PlanDetail = {
        ...basePlan,
        summary: {...basePlan.summary, sourceIdea: label},
        frontMatter: {...basePlan.frontMatter, source_idea: label, plan_format: "prd-v1"},
        body: `# Plan ${nextId}: ${detail.summary.title}\n\n${prd}\n\n## Main Objective\n\n${objective}\n\n## Non-Negotiable Requirements\n\n- ${requirements}\n\n## Forbidden Substitute Solutions\n\n- ${forbidden}\n`,
        raw: `---\nplan_id: ${nextId}\ntitle: '${detail.summary.title}'\ncompletion: 0\nstatus: 'not started'\ndiagram_updated: false\nsource_idea: '${label}'\nplan_format: 'prd-v1'\n---\n\n# Plan ${nextId}: ${detail.summary.title}\n\n${prd}\n`,
      };
      setDemoPlanDetail(fileName.replace(/\.md$/, ""), plan);
      const next: IdeaDetail = {
        ...detail,
        summary: {...detail.summary, status: "promoted", promotedPlan: String(nextId), completed: "2026-07-16"},
        frontMatter: {...detail.frontMatter, status: "promoted", promoted_plan: String(nextId), completed: "2026-07-16"},
        body: `${detail.body.trimEnd()}\n\n## Outcome\n\nPromoted to plan-${nextId}.md.\n`,
      };
      setDemoIdeaDetail(label, next);
      return json({idea: next, plan});
    }
  }

  if (request.method === "POST" && parts.length === 4 && parts[3] === "plans") {
    const body = await readBody(request);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Demo Follow-Up Plan";
    const target = typeof body.target === "string" ? body.target.replace(/^plan-/, "").replace(/\.md$/, "") : "";
    const followUp = Number(target);
    const nextId = Math.max(...demoPlans().map((plan) => plan.id)) + 1;
    const fileName = `plan-${nextId}.md`;
    const detail = clonePlan(Object.values(demoPlanDetails)[0], {
      id: nextId,
      label: `plan-${nextId}`,
      fileName,
      title,
      status: "not started",
      completion: 0,
      followUp: Number.isFinite(followUp) && followUp > 0 ? followUp : demoPlans().slice(-1)[0]?.id,
    });
    setDemoPlanDetail(fileName.replace(/\.md$/, ""), detail);
    return json({plan: detail}, {status: 201});
  }

  if (parts.length === 5 && parts[3] === "plans") {
    const stem = planStemFromId(parts[4]);
    const detail = demoPlanDetails[stem];
    if (!detail) return error(`Plan not found: ${parts[4]}`);

    if (request.method === "GET") return json({plan: detail});

    if (request.method === "PATCH") {
      const body = await readBody(request);
      const status = body.status === "done" || body.status === "running" || body.status === "not started" ? body.status : detail.summary.status;
      const completion = body.completion === undefined ? detail.summary.completion : Number(body.completion);
      const updated = clonePlan(detail, {status: status as PlanStatus, completion: Number.isFinite(completion) ? completion : detail.summary.completion});
      setDemoPlanDetail(stem, updated);
      return json({plan: updated});
    }
  }

  if (request.method === "GET" && parts.length === 4 && parts[3] === "lint") {
    return json(demoLintReport());
  }

  if (request.method === "GET" && parts.length === 4 && parts[3] === "resolutions") {
    return json({resolutions: demoResolutions()});
  }

  if (parts.length === 5 && parts[3] === "resolutions" && request.method === "GET") {
    const id = Number(parts[4]);
    const detail = demoResolutionDetails[id as keyof typeof demoResolutionDetails];
    return detail ? json({resolution: detail}) : error(`Resolution not found: ${parts[4]}`);
  }

  if (request.method === "PATCH" && parts.length === 5 && parts[3] === "sections") {
    return json({workspace: demoWorkspaces[0]});
  }

  if (request.method === "GET" && parts.length === 6 && parts[3] === "sections" && parts[5] === "files") {
    return json({files: demoSectionFiles(parts[4])});
  }

  if (request.method === "GET" && parts.length === 7 && parts[3] === "sections" && parts[5] === "files") {
    const content = demoSectionContent(parts[4], parts[6]);
    return content ? json(content) : error(`Section file not found: ${parts[6]}`);
  }

  return error(`Demo endpoint not implemented: ${request.method} ${url.pathname}`);
}

export function installDemoMockApi() {
  const realFetch = window.fetch.bind(window);

  const demoFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const response = await handleDemoRequest(request);
    if (response) return response;
    return realFetch(input, init);
  };
  window.fetch = demoFetch as typeof window.fetch;
}
