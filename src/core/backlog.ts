import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  BacklogFrontMatterSchema,
  type BacklogDetail,
  type BacklogFrontMatter,
  type BacklogSummary
} from "../../surfaces/contracts/plansman.v1";
import { formatFrontMatter, parseFrontMatter } from "./front-matter";
import {
  claimPlanFileName,
  completePlanContent,
  completionProofBlockers,
  type PlanGoals,
  normalizePlanGoals,
  parseClaimPlanTarget,
  parsePlanDetail,
  planPattern,
  renderClaimedPlan
} from "./plans";
import { managedPrdFromBody, upsertManagedPrd, validatePrd } from "./prd";
import type { WorkspaceRecord } from "./workspaces";

const execFileAsync = promisify(execFile);
const frontMatterOrder = [
  "backlog_id",
  "kind",
  "title",
  "status",
  "category",
  "source_plan",
  "proof_requirement",
  "promoted_plan",
  "reason",
  "created",
  "shaped",
  "objective",
  "requirements",
  "forbidden",
  "completed"
];

export type BacklogItemInput = {
  title: string;
  category: string;
  reason: string;
  sourcePlan?: string;
  proofRequirement?: string;
};

export type BacklogMutationResult = {
  backlog: BacklogDetail;
  commit: { hash: string; message: string };
};

export type IdeaMutationResult = {
  idea: BacklogDetail;
  commit: { hash: string; message: string };
};

export type PromoteIdeaInput = PlanGoals & {
  target?: string | number;
};

export type ShapeIdeaInput = PlanGoals & {
  id?: string | number;
  title?: string;
  prd: string;
};

export type PromoteIdeaResult = {
  idea: BacklogDetail;
  plan: ReturnType<typeof parsePlanDetail>;
  commit: { hash: string; message: string };
};

function backlogDir(workspace: WorkspaceRecord): string {
  return path.join(workspace.absolutePath, "backlog");
}

function fileName(id: number): string {
  return `backlog-${id}.md`;
}

function label(id: number): string {
  return `B-${id}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

function relative(workspace: WorkspaceRecord, target: string): string {
  return path.relative(workspace.rootDir, target).split(path.sep).join("/");
}

async function git(workspace: WorkspaceRecord, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: workspace.rootDir });
  return String(stdout).trim();
}

async function commit(workspace: WorkspaceRecord, paths: string[], message: string) {
  await git(workspace, ["add", ...paths]);
  await git(workspace, ["commit", "-m", message]);
  return { hash: await git(workspace, ["rev-parse", "--short", "HEAD"]), message };
}

function validateInput(input: BacklogItemInput): BacklogItemInput {
  const title = input.title.trim();
  const category = input.category.trim();
  const reason = input.reason.trim();
  if (!title) throw new Error("backlog title is required");
  if (!category) throw new Error("backlog category is required");
  if (!reason) throw new Error("backlog reason is required");
  return {
    title,
    category,
    reason,
    ...(input.sourcePlan ? { sourcePlan: input.sourcePlan.trim() } : {}),
    ...(input.proofRequirement ? { proofRequirement: input.proofRequirement.trim() } : {})
  };
}

function render(frontMatter: BacklogFrontMatter, body?: string): string {
  const defaultBody = frontMatter.kind === "idea"
    ? "## Discussion\n"
    : `## Reason\n\n${frontMatter.reason}\n`;
  return `---\n${formatFrontMatter(frontMatter, frontMatterOrder)}\n---\n\n${(body ?? defaultBody).trimEnd()}\n`;
}

function parse(file: string, content: string): BacklogDetail {
  const parsed = parseFrontMatter(content);
  if (!parsed.data) throw new Error(`${file}: invalid front matter`);
  const frontMatter = BacklogFrontMatterSchema.parse(parsed.data);
  const summary: BacklogSummary = {
    id: frontMatter.backlog_id,
    label: label(frontMatter.backlog_id),
    fileName: file,
    kind: frontMatter.kind,
    title: frontMatter.title,
    status: frontMatter.status,
    category: frontMatter.category,
    sourcePlan: frontMatter.source_plan,
    proofRequirement: frontMatter.proof_requirement,
    promotedPlan: frontMatter.promoted_plan,
    reason: frontMatter.reason,
    created: frontMatter.created,
    shaped: frontMatter.shaped,
    completed: frontMatter.completed
  };
  return { summary, frontMatter, body: parsed.body.replace(/^\n/, ""), raw: content };
}

export async function listBacklog(workspace: WorkspaceRecord): Promise<BacklogSummary[]> {
  const dir = backlogDir(workspace);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /^backlog-\d+\.md$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    return await Promise.all(files.map(async (file) => parse(file, await fs.readFile(path.join(dir, file), "utf8")).summary));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getBacklog(workspace: WorkspaceRecord, id: string | number): Promise<BacklogDetail> {
  const numeric = Number(String(id).replace(/^B-/i, ""));
  if (!Number.isInteger(numeric) || numeric < 1) throw new Error(`Invalid backlog id: ${id}`);
  const file = fileName(numeric);
  return parse(file, await fs.readFile(path.join(backlogDir(workspace), file), "utf8"));
}

function nextId(items: BacklogSummary[]): number {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
}

function deferProofRows(
  content: string,
  deferrals: Array<{ requirement: string; backlogLabel: string; reason: string }>
): string {
  if (deferrals.length === 0) return content;
  const pending = new Map(deferrals.map((item) => [item.requirement, item]));
  const deferrable = new Set(["NOT CHECKED", "TODO", "PENDING", "BLOCKED"]);
  const lines = content.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return line;
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    const item = pending.get(cells[0] ?? "");
    if (!item) return line;
    const status = String(cells[1] ?? "").toUpperCase();
    if (!deferrable.has(status)) {
      throw new Error(`Proof row '${item.requirement}' cannot be deferred from status '${cells[1] ?? ""}'.`);
    }
    pending.delete(item.requirement);
    const evidence = cells[2] ? `${cells[2]} Deferred to ${item.backlogLabel}: ${item.reason}` : `Deferred to ${item.backlogLabel}: ${item.reason}`;
    return `| ${cells[0]} | DEFERRED (${item.backlogLabel}) | ${evidence} |`;
  });
  if (pending.size > 0) {
    throw new Error(`Proof row not found for deferral: ${[...pending.keys()].join(", ")}.`);
  }
  return lines.join("\n");
}

export async function addBacklog(workspace: WorkspaceRecord, rawInput: BacklogItemInput): Promise<BacklogMutationResult> {
  const input = validateInput(rawInput);
  const id = nextId(await listBacklog(workspace));
  const frontMatter = BacklogFrontMatterSchema.parse({
    backlog_id: id,
    kind: "work",
    title: input.title,
    status: "open",
    category: input.category,
    source_plan: input.sourcePlan,
    proof_requirement: input.proofRequirement,
    reason: input.reason,
    created: today()
  });
  await fs.mkdir(backlogDir(workspace), { recursive: true });
  const target = path.join(backlogDir(workspace), fileName(id));
  await fs.writeFile(target, render(frontMatter), "utf8");
  const message = `feat(backlog): add ${label(id)} — ${input.title}`;
  const commitResult = await commit(workspace, [relative(workspace, target)], message);
  return { backlog: await getBacklog(workspace, id), commit: commitResult };
}

export async function markBacklogDone(workspace: WorkspaceRecord, id: string | number): Promise<BacklogMutationResult> {
  const current = await getBacklog(workspace, id);
  if (current.frontMatter.kind !== "work") {
    throw new Error(`${current.summary.label} is an idea; use idea dismiss or idea promote.`);
  }
  const frontMatter = BacklogFrontMatterSchema.parse({ ...current.frontMatter, status: "done", completed: today() });
  const target = path.join(backlogDir(workspace), current.summary.fileName);
  await fs.writeFile(target, render(frontMatter, current.body), "utf8");
  const message = `chore(backlog): complete ${current.summary.label}`;
  const commitResult = await commit(workspace, [relative(workspace, target)], message);
  return { backlog: await getBacklog(workspace, current.summary.id), commit: commitResult };
}

function assertActiveIdea(idea: BacklogDetail): void {
  if (idea.frontMatter.kind !== "idea") {
    throw new Error(`${idea.summary.label} is backlog work, not an idea.`);
  }
  if (idea.frontMatter.status !== "inbox" && idea.frontMatter.status !== "shaped") {
    throw new Error(`${idea.summary.label} is ${idea.frontMatter.status}, not an active idea.`);
  }
}

export async function shapeIdea(workspace: WorkspaceRecord, input: ShapeIdeaInput): Promise<IdeaMutationResult> {
  const hasId = input.id !== undefined && String(input.id).trim() !== "";
  const title = input.title?.trim() ?? "";
  if (hasId === Boolean(title)) throw new Error("shape an existing idea with id or create one with title, but not both");
  const prd = validatePrd(input.prd);
  const goals = normalizePlanGoals(input);
  const existing = hasId ? await getIdea(workspace, input.id as string | number) : null;
  if (existing) assertActiveIdea(existing);

  const id = existing?.summary.id ?? nextId(await listBacklog(workspace));
  const frontMatter = BacklogFrontMatterSchema.parse({
    ...(existing?.frontMatter ?? {
      backlog_id: id,
      kind: "idea",
      title,
      created: today()
    }),
    status: "shaped",
    shaped: now(),
    objective: goals.objective,
    requirements: goals.requirements,
    forbidden: goals.forbidden
  });
  const body = upsertManagedPrd(existing?.body ?? "## Discussion\n", prd);
  await fs.mkdir(backlogDir(workspace), { recursive: true });
  const target = path.join(backlogDir(workspace), fileName(id));
  await fs.writeFile(target, render(frontMatter, body), "utf8");
  const message = existing
    ? `docs(idea): shape ${label(id)}`
    : `feat(idea): capture shaped ${label(id)} — ${title}`;
  const commitResult = await commit(workspace, [relative(workspace, target)], message);
  return { idea: await getIdea(workspace, id), commit: commitResult };
}

export async function listIdeas(workspace: WorkspaceRecord): Promise<BacklogSummary[]> {
  return (await listBacklog(workspace)).filter((item) => item.kind === "idea");
}

export async function getIdea(workspace: WorkspaceRecord, id: string | number): Promise<BacklogDetail> {
  const idea = await getBacklog(workspace, id);
  if (idea.frontMatter.kind !== "idea") throw new Error(`${idea.summary.label} is backlog work, not an idea.`);
  return idea;
}

export async function addIdea(workspace: WorkspaceRecord, rawTitle: string): Promise<IdeaMutationResult> {
  const title = rawTitle.trim();
  if (!title) throw new Error("idea title is required");
  const id = nextId(await listBacklog(workspace));
  const frontMatter = BacklogFrontMatterSchema.parse({
    backlog_id: id,
    kind: "idea",
    title,
    status: "inbox",
    created: today()
  });
  await fs.mkdir(backlogDir(workspace), { recursive: true });
  const target = path.join(backlogDir(workspace), fileName(id));
  await fs.writeFile(target, render(frontMatter), "utf8");
  const message = `feat(idea): capture ${label(id)} — ${title}`;
  const commitResult = await commit(workspace, [relative(workspace, target)], message);
  return { idea: await getIdea(workspace, id), commit: commitResult };
}

export async function addIdeaNote(
  workspace: WorkspaceRecord,
  id: string | number,
  rawNote: string
): Promise<IdeaMutationResult> {
  const note = rawNote.trim();
  if (!note) throw new Error("idea note is required");
  const current = await getIdea(workspace, id);
  assertActiveIdea(current);
  const body = `${current.body.trimEnd()}\n\n- ${new Date().toISOString()}: ${note}\n`;
  const target = path.join(backlogDir(workspace), current.summary.fileName);
  await fs.writeFile(target, render(current.frontMatter, body), "utf8");
  const message = `docs(idea): note ${current.summary.label}`;
  const commitResult = await commit(workspace, [relative(workspace, target)], message);
  return { idea: await getIdea(workspace, current.summary.id), commit: commitResult };
}

export async function dismissIdea(
  workspace: WorkspaceRecord,
  id: string | number,
  rawReason: string
): Promise<IdeaMutationResult> {
  const reason = rawReason.trim();
  if (!reason) throw new Error("dismissal reason is required");
  const current = await getIdea(workspace, id);
  assertActiveIdea(current);
  const frontMatter = BacklogFrontMatterSchema.parse({
    ...current.frontMatter,
    status: "dismissed",
    reason,
    completed: today()
  });
  const body = `${current.body.trimEnd()}\n\n## Outcome\n\nDismissed: ${reason}\n`;
  const target = path.join(backlogDir(workspace), current.summary.fileName);
  await fs.writeFile(target, render(frontMatter, body), "utf8");
  const message = `chore(idea): dismiss ${current.summary.label}`;
  const commitResult = await commit(workspace, [relative(workspace, target)], message);
  return { idea: await getIdea(workspace, current.summary.id), commit: commitResult };
}

export async function promoteIdea(
  workspace: WorkspaceRecord,
  id: string | number,
  input: Partial<PromoteIdeaInput> & { target?: string | number }
): Promise<PromoteIdeaResult> {
  const current = await getIdea(workspace, id);
  assertActiveIdea(current);
  if (current.frontMatter.status !== "shaped") {
    throw new Error(`${current.summary.label} must be shaped into a PRD before promotion.`);
  }
  const prd = managedPrdFromBody(current.body);
  if (!prd) throw new Error(`${current.summary.label} is shaped but has no managed PRD.`);
  const goals = normalizePlanGoals({
    objective: input.objective ?? current.frontMatter.objective ?? "",
    requirements: input.requirements ?? current.frontMatter.requirements ?? "",
    forbidden: input.forbidden ?? current.frontMatter.forbidden ?? ""
  });
  const entries = await fs.readdir(workspace.absolutePlansDir, { withFileTypes: true });
  const fileNames = entries.filter((entry) => entry.isFile() && planPattern.test(entry.name)).map((entry) => entry.name);
  const targetPlan = parseClaimPlanTarget(input.target, fileNames);
  const planFileName = claimPlanFileName(targetPlan);
  const planLabel = `${targetPlan.planId}${targetPlan.subPlan ?? ""}`;
  const planContent = renderClaimedPlan(targetPlan, current.summary.title, fileNames, goals, current.summary.label, prd);
  const frontMatter = BacklogFrontMatterSchema.parse({
    ...current.frontMatter,
    status: "promoted",
    promoted_plan: planLabel,
    completed: today()
  });
  const body = `${current.body.trimEnd()}\n\n## Outcome\n\nPromoted to plan-${planLabel}.md.\n`;
  const ideaPath = path.join(backlogDir(workspace), current.summary.fileName);
  const planPath = path.join(workspace.absolutePlansDir, planFileName);
  await fs.writeFile(planPath, planContent, "utf8");
  await fs.writeFile(ideaPath, render(frontMatter, body), "utf8");
  const message = `feat(plan): promote ${current.summary.label} to plan ${planLabel}`;
  const commitResult = await commit(workspace, [relative(workspace, ideaPath), relative(workspace, planPath)], message);
  return {
    idea: await getIdea(workspace, current.summary.id),
    plan: parsePlanDetail({ fileName: planFileName, content: planContent }),
    commit: commitResult
  };
}

export async function completePlanWithBacklog(
  workspace: WorkspaceRecord,
  planFileName: string,
  sourcePlan: string,
  rawInputs: BacklogItemInput[]
) {
  const inputs = rawInputs.map((input) => validateInput({ ...input, sourcePlan }));
  const existing = await listBacklog(workspace);
  const firstId = nextId(existing);
  const records = inputs.map((input, index) => {
    const id = firstId + index;
    const frontMatter = BacklogFrontMatterSchema.parse({
      backlog_id: id,
      kind: "work",
      title: input.title,
      status: "open",
      category: input.category,
      source_plan: sourcePlan,
      proof_requirement: input.proofRequirement,
      reason: input.reason,
      created: today()
    });
    return { id, frontMatter, fileName: fileName(id) };
  });
  const planPath = path.join(workspace.absolutePlansDir, planFileName);
  const originalPlan = await fs.readFile(planPath, "utf8");
  const proofDeferredPlan = deferProofRows(
    originalPlan,
    records
      .filter((record) => Boolean(record.frontMatter.proof_requirement))
      .map((record) => ({
        requirement: String(record.frontMatter.proof_requirement),
        backlogLabel: label(record.id),
        reason: String(record.frontMatter.reason)
      }))
  );
  const blockers = completionProofBlockers(proofDeferredPlan);
  if (blockers.length > 0) {
    throw new Error(`Blocked: plan ${sourcePlan} has incomplete proof matrix rows: ${blockers.join(", ")}.`);
  }
  const completedPlan = completePlanContent(proofDeferredPlan, records.map((record) => label(record.id)));
  await fs.mkdir(backlogDir(workspace), { recursive: true });
  await fs.writeFile(planPath, completedPlan, "utf8");
  await Promise.all(
    records.map((record) => fs.writeFile(path.join(backlogDir(workspace), record.fileName), render(record.frontMatter), "utf8"))
  );
  const paths = [relative(workspace, planPath), ...records.map((record) => relative(workspace, path.join(backlogDir(workspace), record.fileName)))];
  const message = `chore(plan): complete plan ${sourcePlan}${records.length ? ` with ${records.length} deferred backlog item(s)` : ""}`;
  const commitResult = await commit(workspace, paths, message);
  return {
    plan: parsePlanDetail({ fileName: planFileName, content: completedPlan }),
    backlog: await Promise.all(records.map((record) => getBacklog(workspace, record.id))),
    commit: commitResult
  };
}
