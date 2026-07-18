export type PlanStatus = "done" | "running" | "not started";
export type ResolutionStatus = "open" | "agreed" | "withdrawn";
export type IdeaStatus = "inbox" | "shaped" | "promoted" | "dismissed";
export type StateId = PlanStatus;

export interface PlanSummary {
  id: number;
  label: string;
  fileName: string;
  title: string;
  completion: number;
  status: PlanStatus;
  diagramUpdated: boolean;
  subPlan?: string;
  followUp?: number;
  sourceIdea?: string;
}

export interface PlanFrontMatter {
  plan_id: number;
  sub_plan?: string;
  title: string;
  completion: number;
  status: PlanStatus;
  diagram_updated: boolean;
  follow_up?: number;
  implementation_branch?: string;
  touches?: string[];
  follows?: number[];
  repo?: string;
  source_idea?: string;
  plan_format?: "prd-v1";
}

export interface PlanDetail {
  summary: PlanSummary;
  frontMatter: PlanFrontMatter;
  body: string;
  raw: string;
}

export interface LintFinding {
  fileName: string;
  message: string;
}

export interface LintReport {
  ok: boolean;
  planCount: number;
  findings: LintFinding[];
  byFile: Record<string, LintFinding[]>;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface WorkspaceSection {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  fileCount: number;
}

export interface Workspace {
  slug: string;
  name: string;
  path: string;
  plansDir: string;
  legacy: boolean;
  sections: WorkspaceSection[];
}

export interface SectionFile {
  name: string;
  title: string;
  path: string;
}

export interface SectionContent {
  file: SectionFile;
  content: string;
}

export interface ResolutionFrontMatter {
  resolution_id: number;
  title: string;
  status: ResolutionStatus;
  plans: string[];
  parties: string[];
  created: string;
  decided?: string;
}

export interface ResolutionSummary {
  id: number;
  fileName: string;
  title: string;
  status: ResolutionStatus;
  plans: string[];
  parties: string[];
  created: string;
  decided?: string;
}

export interface ResolutionDetail {
  summary: ResolutionSummary;
  frontMatter: ResolutionFrontMatter;
  body: string;
  raw: string;
}

export interface IdeaSummary {
  id: number;
  label: string;
  fileName: string;
  kind: "idea";
  title: string;
  status: IdeaStatus;
  promotedPlan?: string;
  reason?: string;
  created: string;
  shaped?: string;
  completed?: string;
}

export interface IdeaFrontMatter {
  backlog_id: number;
  kind: "idea";
  title: string;
  status: IdeaStatus;
  promoted_plan?: string;
  reason?: string;
  created: string;
  shaped?: string;
  objective?: string;
  requirements?: string;
  forbidden?: string;
  completed?: string;
}

export interface IdeaDetail {
  summary: IdeaSummary;
  frontMatter: IdeaFrontMatter;
  body: string;
  raw: string;
}

export const IDEA_STATUS_ORDER: IdeaStatus[] = ["inbox", "shaped", "promoted", "dismissed"];

export const RESOLUTION_GROUP_ORDER: ResolutionStatus[] = ["open", "agreed", "withdrawn"];

export interface StateMeta {
  id: PlanStatus;
  name: string;
  color: string;
}

export const STATES: StateMeta[] = [
  {id: "running", name: "Running", color: "#f2c94c"},
  {id: "not started", name: "Not Started", color: "#7c8091"},
  {id: "done", name: "Done", color: "var(--accent)"},
];

export const STATE_MAP: Record<PlanStatus, StateMeta> = Object.fromEntries(
  STATES.map((state) => [state.id, state]),
) as Record<PlanStatus, StateMeta>;

export const LIST_GROUP_ORDER: PlanStatus[] = ["running", "not started", "done"];
export const BOARD_COLUMN_ORDER: PlanStatus[] = ["running", "not started", "done"];

// The fileName stem is the only unique plan identity: the corpus contains
// sibling files sharing a plan_id (plan-14.md / plan-14-review-gate.md).
export function formatPlanId(plan: Pick<PlanSummary, "fileName">) {
  return plan.fileName.replace(/\.md$/, "");
}

export function planRouteId(plan: Pick<PlanSummary, "fileName">) {
  return plan.fileName.replace(/\.md$/, "");
}

export function formatCompletion(completion: number) {
  return `${Math.round(completion)}%`;
}
