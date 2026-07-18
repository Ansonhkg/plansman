import type {
  IdeaDetail,
  IdeaStatus,
  LintReport,
  PlanDetail,
  PlanStatus,
  PlanSummary,
  ResolutionDetail,
  ResolutionStatus,
  SectionContent,
  SectionFile,
  Workspace,
} from "../data/tracker";

type MockPlanInput = {
  id: number;
  title: string;
  status: PlanStatus;
  completion: number;
  followUp?: number;
  subPlan?: string;
  body: string;
};

const sections = [
  {id: "drafts", name: "Drafts", path: "atlas-cloud-demo/drafts", enabled: true, fileCount: 3},
  {id: "research", name: "Research", path: "atlas-cloud-demo/research", enabled: true, fileCount: 2},
  {id: "launch", name: "Launch Notes", path: "atlas-cloud-demo/launch", enabled: false, fileCount: 2},
];

export const demoWorkspaces: Workspace[] = [
  {
    slug: "atlas-cloud-demo",
    name: "Atlas Cloud Demo",
    path: "atlas-cloud-demo",
    plansDir: "atlas-cloud-demo/plans",
    legacy: false,
    sections,
  },
];

const planInputs: MockPlanInput[] = [
  {
    id: 1,
    title: "Atlas Cloud Product Thesis",
    status: "done",
    completion: 100,
    body: "Define the product thesis, demo constraints, and source-of-truth planning workflow for Atlas Cloud.",
  },
  {
    id: 2,
    title: "Workspace Identity And Tenant Model",
    status: "done",
    completion: 100,
    followUp: 1,
    body: "Model teams, workspaces, and repository bindings so customers can separate operational plans from source code.",
  },
  {
    id: 3,
    title: "Plan Ledger Storage Contract",
    status: "done",
    completion: 100,
    followUp: 2,
    body: "Keep plans as plain markdown files with strict frontmatter and predictable file names.",
  },
  {
    id: 4,
    title: "Request Intake And Prioritization",
    status: "done",
    completion: 100,
    followUp: 3,
    body: "Turn rough requests into claimed plans, status groups, and a backlog that agents and humans can share.",
  },
  {
    id: 5,
    title: "Execution Board And Status Operations",
    status: "done",
    completion: 100,
    followUp: 4,
    body: "Add list and board views for running, not-started, and done work with completion bars and file provenance.",
  },
  {
    id: 6,
    title: "Forkable DAG View",
    status: "running",
    completion: 82,
    followUp: 5,
    body: "Show how follow-up plans branch from the main path and how selected cards map back to the graph.",
  },
  {
    id: 7,
    title: "Plan Detail Modal And Evidence Reader",
    status: "running",
    completion: 92,
    followUp: 6,
    body: "Open plan content in a modal so long planning notes remain readable beside the list and board views.",
  },
  {
    id: 8,
    title: "Customer Onboarding And First Workspace Setup",
    status: "running",
    completion: 74,
    followUp: 7,
    body: "Guide a new customer from empty repository to a working Atlas Cloud planning workspace.",
  },
  {
    id: 9,
    title: "Automation Rules And Safe Mutations",
    status: "running",
    completion: 52,
    followUp: 8,
    body: "Constrain automated status changes and plan creation so agent work remains reviewable.",
  },
  {
    id: 10,
    title: "AI Copilot Grounding And Citation Layer",
    status: "running",
    completion: 38,
    followUp: 9,
    body: "Give the assistant enough plan context to cite source files and avoid inventing project state.",
  },
  {
    id: 11,
    title: "Billing Entitlements And Usage Metering",
    status: "running",
    completion: 31,
    followUp: 10,
    body: "Map paid features, limits, and usage events to workspace-level entitlements.",
  },
  {
    id: 12,
    title: "Integration Marketplace Foundation",
    status: "not started",
    completion: 12,
    followUp: 11,
    body: "Prepare the first integration contracts for partner-authored planning automations.",
  },
  {
    id: 13,
    title: "Enterprise Governance And Audit Readiness",
    status: "not started",
    completion: 10,
    followUp: 12,
    body: "Collect audit events, plan decisions, and resolution records into a reviewable export.",
  },
  {
    id: 14,
    title: "Public Launch Readiness Review",
    status: "not started",
    completion: 0,
    followUp: 13,
    body: "Run the final launch checklist after the demo, release workflow, and website are live.",
  },
  {
    id: 15,
    title: "Enterprise SSO Procurement Branch",
    status: "running",
    completion: 76,
    followUp: 2,
    body: "Forked from the tenant model to evaluate enterprise SSO procurement without blocking the main path.",
  },
  {
    id: 16,
    title: "SCIM Lifecycle Edge Cases",
    status: "running",
    completion: 44,
    followUp: 15,
    body: "Explore deprovisioning, user reactivation, and workspace ownership transfer flows for SCIM.",
  },
  {
    id: 17,
    title: "Security Questionnaire Evidence Pack",
    status: "not started",
    completion: 28,
    followUp: 16,
    body: "Assemble SOC2, data retention, and operational evidence for procurement review.",
  },
  {
    id: 18,
    title: "Data Import Spike From Customer CSVs",
    status: "running",
    completion: 66,
    followUp: 8,
    body: "Forked from onboarding to test bulk plan imports from customer roadmap spreadsheets.",
  },
  {
    id: 19,
    title: "Legacy Roadmap Migration Path",
    status: "not started",
    completion: 28,
    followUp: 18,
    body: "Map old roadmap categories to Plansman sections, plan files, and resolution records.",
  },
  {
    id: 20,
    title: "Template Gallery For First Workspace",
    status: "running",
    completion: 62,
    followUp: 18,
    body: "Build starter templates that make a new workspace feel useful before any custom plans exist.",
  },
  {
    id: 21,
    title: "Invite Roles And External Reviewer Flow",
    status: "running",
    completion: 40,
    followUp: 20,
    body: "Let customers bring external reviewers into selected plans without exposing the whole workspace.",
  },
  {
    id: 22,
    title: "Meeting Notes To Plan Updates",
    status: "not started",
    completion: 0,
    followUp: 21,
    body: "Parse meeting notes into proposed plan updates while keeping the human review step explicit.",
  },
  {
    id: 23,
    title: "DAG Performance For Large Workspaces",
    status: "running",
    completion: 48,
    followUp: 6,
    body: "Stress-test rendering and navigation when a workspace has hundreds of plan files and many forks.",
  },
  {
    id: 24,
    title: "Mini Map Pane Interaction Branch",
    status: "running",
    completion: 82,
    followUp: 23,
    body: "Polish the pinned DAG pane, hover labels, selected-node labels, and pane resizing interactions.",
  },
  {
    id: 25,
    title: "Mobile DAG Inspection Branch",
    status: "not started",
    completion: 0,
    followUp: 24,
    body: "Find the smallest useful DAG inspection pattern for narrow screens.",
  },
  {
    id: 26,
    title: "Board Card And DAG Hover Sync",
    status: "running",
    completion: 45,
    followUp: 24,
    body: "Keep list rows, board cards, and DAG nodes in the same hover and selection state.",
  },
  {
    id: 27,
    title: "Launch Packaging And Pricing Branch",
    status: "running",
    completion: 33,
    followUp: 11,
    body: "Forked from billing to shape the public launch packaging and early pricing model.",
  },
  {
    id: 28,
    title: "Usage Ledger Reconciliation",
    status: "not started",
    completion: 0,
    followUp: 27,
    body: "Reconcile usage records against invoice previews and workspace entitlements.",
  },
  {
    id: 29,
    title: "Buyer Proof And Evidence Branch",
    status: "running",
    completion: 42,
    followUp: 27,
    body: "Collect buyer-facing proof, screenshots, release artifacts, and demo scripts for launch.",
  },
  {
    id: 30,
    title: "Support Escalation Intake Branch",
    status: "running",
    completion: 58,
    followUp: 29,
    body: "Model how support escalations become plans, resolutions, or draft notes.",
  },
];

function planFileName(input: MockPlanInput) {
  return `plan-${input.id}${input.subPlan ?? ""}.md`;
}

function planLabel(input: MockPlanInput) {
  return `plan-${input.id}${input.subPlan ?? ""}`;
}

function planSummary(input: MockPlanInput): PlanSummary {
  return {
    id: input.id,
    label: planLabel(input),
    fileName: planFileName(input),
    title: input.title,
    completion: input.completion,
    status: input.status,
    diagramUpdated: true,
    ...(input.subPlan ? {subPlan: input.subPlan} : {}),
    ...(input.followUp ? {followUp: input.followUp} : {}),
  };
}

function planDetail(input: MockPlanInput): PlanDetail {
  const summary = planSummary(input);
  const raw = [
    "---",
    `plan_id: ${input.id}`,
    ...(input.subPlan ? [`sub_plan: ${input.subPlan}`] : []),
    `title: ${JSON.stringify(input.title)}`,
    `completion: ${input.completion}`,
    `status: ${JSON.stringify(input.status)}`,
    "diagram_updated: true",
    ...(input.followUp ? [`follow_up: ${input.followUp}`] : []),
    "---",
    "",
    `# ${input.title}`,
    "",
    input.body,
    "",
    "## Demo Notes",
    "",
    "This is bundled mock data for the public Plansman demo. Try the list, board, DAG, filters, selections, and resolution views without connecting to a live workspace.",
  ].join("\n");

  return {
    summary,
    frontMatter: {
      plan_id: input.id,
      ...(input.subPlan ? {sub_plan: input.subPlan} : {}),
      title: input.title,
      completion: input.completion,
      status: input.status,
      diagram_updated: true,
      ...(input.followUp ? {follow_up: input.followUp} : {}),
      implementation_branch: input.followUp ? `demo/follow-up-${input.id}` : "main",
      touches: ["apps/web", "surfaces/cli", "plans"],
      repo: "github.com/Ansonhkg/plansman",
    },
    body: raw.split("---\n\n").slice(-1)[0] ?? raw,
    raw,
  };
}

export let demoPlanDetails = Object.fromEntries(planInputs.map((input) => [planFileName(input).replace(/\.md$/, ""), planDetail(input)]));

export function setDemoPlanDetail(stem: string, detail: PlanDetail) {
  demoPlanDetails = {...demoPlanDetails, [stem]: detail};
}

export function demoPlans() {
  return Object.values(demoPlanDetails).map((detail) => detail.summary);
}

export function demoLintReport(): LintReport {
  return {
    ok: true,
    planCount: demoPlans().length,
    findings: [],
    byFile: {},
  };
}

function ideaDetail(
  id: number,
  title: string,
  status: IdeaStatus,
  created: string,
  discussion: string[],
  options: {
    promotedPlan?: string;
    reason?: string;
    completed?: string;
    shaped?: string;
    prd?: string;
    objective?: string;
    requirements?: string;
    forbidden?: string;
  } = {},
): IdeaDetail {
  const summary = {
    id,
    label: `B-${id}`,
    fileName: `backlog-${id}.md`,
    kind: "idea" as const,
    title,
    status,
    created,
    ...(options.promotedPlan ? {promotedPlan: options.promotedPlan} : {}),
    ...(options.reason ? {reason: options.reason} : {}),
    ...(options.completed ? {completed: options.completed} : {}),
    ...(options.shaped ? {shaped: options.shaped} : {}),
  };
  const body = [
    ...(options.prd ? ["<!-- plansman:prd:start -->", options.prd, "<!-- plansman:prd:end -->", ""] : []),
    "## Discussion",
    "",
    ...discussion.flatMap((note) => [`- ${note}`, ""]),
    ...(status === "promoted" ? ["## Outcome", "", `Promoted to plan-${options.promotedPlan}.md.`] : []),
    ...(status === "dismissed" ? ["## Outcome", "", `Dismissed: ${options.reason}`] : []),
  ].join("\n");
  return {
    summary,
    frontMatter: {
      backlog_id: id,
      kind: "idea",
      title,
      status,
      created,
      ...(options.promotedPlan ? {promoted_plan: options.promotedPlan} : {}),
      ...(options.reason ? {reason: options.reason} : {}),
      ...(options.completed ? {completed: options.completed} : {}),
      ...(options.shaped ? {shaped: options.shaped} : {}),
      ...(options.objective ? {objective: options.objective} : {}),
      ...(options.requirements ? {requirements: options.requirements} : {}),
      ...(options.forbidden ? {forbidden: options.forbidden} : {}),
    },
    body,
    raw: body,
  };
}

export let demoIdeaDetails: Record<string, IdeaDetail> = Object.fromEntries([
  ideaDetail(1, "Make plan dependencies explicit", "inbox", "2026-07-12", [
    "2026-07-12T10:15:00.000Z: Explore whether dependencies belong in frontmatter or the DAG projection.",
    "2026-07-13T09:30:00.000Z: Agent workflows need a deterministic way to discover blocked plans.",
  ]),
  ideaDetail(2, "Turn meeting notes into plan proposals", "shaped", "2026-07-10", [
    "2026-07-10T14:00:00.000Z: Keep human review before any plan file is created.",
  ], {
    shaped: "2026-07-14T10:00:00.000Z",
    objective: "Preserve product decisions before creating an execution plan.",
    requirements: "Store the PRD with the idea and retain discussion history.",
    forbidden: "Do not promote raw meeting notes without human review.",
    prd: "## Problem Statement\n\nMeeting decisions disappear before implementation.\n\n## Solution\n\nShape notes into a durable PRD.\n\n## User Stories\n\n1. As a planner, I want durable requirements, so that implementation stays grounded.\n\n## Implementation Decisions\n\n- Reuse the idea record.\n\n## Testing Decisions\n\n- Test the complete lifecycle.\n\n## Release Decisions\n\n- Ship with the existing app.\n\n## Documentation Decisions\n\n- Document shaping and promotion.\n\n## Out of Scope\n\n- Automatic meeting transcription.\n\n## Further Notes\n\nHuman review remains required."
  }),
  ideaDetail(3, "Add a workspace idea inbox", "promoted", "2026-07-08", [
    "2026-07-08T11:00:00.000Z: Capture should require only a title.",
  ], {promotedPlan: "31", completed: "2026-07-11"}),
  ideaDetail(4, "Replace markdown plans with a database", "dismissed", "2026-07-06", [], {
    reason: "Markdown and Git history are core product constraints.",
    completed: "2026-07-07",
  }),
].map((detail) => [detail.summary.label, detail]));

export function demoIdeas() {
  return Object.values(demoIdeaDetails).map((detail) => detail.summary);
}

export function setDemoIdeaDetail(label: string, detail: IdeaDetail) {
  demoIdeaDetails = {...demoIdeaDetails, [label]: detail};
}

function resolutionDetail(
  id: number,
  title: string,
  status: ResolutionStatus,
  plans: string[],
  parties: string[],
  created: string,
  body: string,
  decided?: string,
): ResolutionDetail {
  const summary = {id, fileName: `resolution-${id}.md`, title, status, plans, parties, created, ...(decided ? {decided} : {})};
  const raw = [
    "---",
    `resolution_id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    `status: ${JSON.stringify(status)}`,
    `plans: [${plans.map((plan) => JSON.stringify(plan)).join(", ")}]`,
    `parties: [${parties.map((party) => JSON.stringify(party)).join(", ")}]`,
    `created: ${JSON.stringify(created)}`,
    ...(decided ? [`decided: ${JSON.stringify(decided)}`] : []),
    "---",
    "",
    `# ${title}`,
    "",
    body,
  ].join("\n");

  return {
    summary,
    frontMatter: {resolution_id: id, title, status, plans, parties, created, ...(decided ? {decided} : {})},
    body,
    raw,
  };
}

export let demoResolutionDetails = {
  1: resolutionDetail(
    1,
    "Enterprise Identity Scope",
    "open",
    ["plan-15", "plan-16", "plan-17"],
    ["product", "security", "sales"],
    "2026-07-02",
    "Enterprise SSO can launch before SCIM if procurement proof is clear, but the launch page must not promise lifecycle automation until plan-16 closes.",
  ),
  2: resolutionDetail(
    2,
    "Mini DAG Interaction Priority",
    "agreed",
    ["plan-23", "plan-24", "plan-26"],
    ["design", "frontend"],
    "2026-07-04",
    "Prioritize hover and selected-state synchronization before mobile DAG inspection. This keeps the current product demo coherent.",
    "2026-07-06",
  ),
};

export function demoResolutions() {
  return Object.values(demoResolutionDetails).map((detail) => detail.summary);
}

const sectionFiles: Record<string, SectionFile[]> = {
  drafts: [
    {name: "customer-launch-script.md", title: "Customer Launch Script", path: "atlas-cloud-demo/drafts/customer-launch-script.md"},
    {name: "demo-objections.md", title: "Demo Objections", path: "atlas-cloud-demo/drafts/demo-objections.md"},
    {name: "pricing-notes.md", title: "Pricing Notes", path: "atlas-cloud-demo/drafts/pricing-notes.md"},
  ],
  research: [
    {name: "data-residency.md", title: "Data Residency Notes", path: "atlas-cloud-demo/research/data-residency.md"},
    {name: "agent-workflow-audit.md", title: "Agent Workflow Audit", path: "atlas-cloud-demo/research/agent-workflow-audit.md"},
  ],
  launch: [
    {name: "release-checklist.md", title: "Release Checklist", path: "atlas-cloud-demo/launch/release-checklist.md"},
    {name: "press-notes.md", title: "Press Notes", path: "atlas-cloud-demo/launch/press-notes.md"},
  ],
};

export function demoSectionFiles(sectionId: string) {
  return sectionFiles[sectionId] ?? [];
}

export function demoSectionContent(sectionId: string, fileName: string): SectionContent | null {
  const file = demoSectionFiles(sectionId).find((item) => item.name === fileName);
  if (!file) return null;

  return {
    file,
    content: `# ${file.title}\n\nThis mock section document is bundled with the public demo. It shows how non-plan notes can live beside the plan DAG without becoming part of the execution graph.\n\n- Source workspace: Atlas Cloud Demo\n- Section: ${sectionId}\n- File: ${fileName}\n`,
  };
}
