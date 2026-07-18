import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  ResolutionFrontMatterSchema,
  type ResolutionDetail,
  type ResolutionFrontMatter,
  type ResolutionStatus,
  type ResolutionSummary
} from "../../surfaces/contracts/plansman.v1";
import { formatFrontMatter, parseFrontMatter } from "./front-matter";
import type { WorkspaceRecord } from "./workspaces";

const execFileAsync = promisify(execFile);

export type ResolutionMutationResult = {
  resolution: ResolutionDetail;
  commit: {
    hash: string;
    message: string;
  };
};

export type OpenResolutionInput = {
  title: string;
  plans: string[];
  parties: string[];
  conflict: string;
};

export type RespondResolutionInput = {
  id: string | number;
  party: string;
  position: string;
};

export type DecideResolutionInput = {
  id: string | number;
  decision: string;
  status: ResolutionStatus;
};

const resolutionFrontMatterOrder = ["resolution_id", "title", "status", "plans", "parties", "created", "decided"];

function safeResolutionId(id: string | number): number {
  const value = String(id);
  if (!/^\d+$/.test(value)) throw new Error(`Invalid resolution id: ${value}`);
  return Number(value);
}

function resolutionFileName(id: string | number): string {
  return `resolution-${safeResolutionId(id)}.md`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function git(rootDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: rootDir });
  return String(stdout).trim();
}

async function commit(rootDir: string, paths: string[], message: string) {
  await git(rootDir, ["add", ...paths]);
  await git(rootDir, ["commit", "-m", message]);
  const hash = await git(rootDir, ["rev-parse", "--short", "HEAD"]);
  return { hash, message };
}

function resolutionsDir(workspace: WorkspaceRecord): string {
  return path.join(workspace.absolutePath, "resolutions");
}

function relativePath(workspace: WorkspaceRecord, filePath: string): string {
  return path.relative(workspace.rootDir, filePath).split(path.sep).join("/");
}

function summaryFromFrontMatter(fileName: string, frontMatter: ResolutionFrontMatter): ResolutionSummary {
  return {
    id: frontMatter.resolution_id,
    fileName,
    title: frontMatter.title,
    status: frontMatter.status,
    plans: frontMatter.plans,
    parties: frontMatter.parties,
    created: frontMatter.created,
    decided: frontMatter.decided
  };
}

// Plan refs in resolutions are loose ("30a", "32", "plan-1"); normalize both
// sides so any spelling of the same plan matches.
export function normalizePlanRef(ref: string): string {
  return ref.trim().toLowerCase().replace(/^plan-/, "").replace(/\.md$/, "");
}

export function openResolutionsNamingPlan(
  resolutions: ResolutionSummary[],
  planRefs: Array<string | number>
): ResolutionSummary[] {
  const targets = new Set(planRefs.map((ref) => normalizePlanRef(String(ref))));
  return resolutions.filter(
    (resolution) => resolution.status === "open" && resolution.plans.some((ref) => targets.has(normalizePlanRef(ref)))
  );
}

export function parseResolutionDetail(fileName: string, content: string): ResolutionDetail {
  const parsed = parseFrontMatter(content);
  if (!parsed.data) throw new Error(`${fileName}: invalid front matter`);
  const frontMatter = ResolutionFrontMatterSchema.parse(parsed.data);
  return {
    summary: summaryFromFrontMatter(fileName, frontMatter),
    frontMatter,
    body: parsed.body.replace(/^\n/, ""),
    raw: content
  };
}

async function readResolutionFiles(workspace: WorkspaceRecord): Promise<Array<{ fileName: string; content: string }>> {
  const dir = resolutionsDir(workspace);
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && /^resolution-\d+\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return Promise.all(
    names.map(async (fileName) => ({ fileName, content: await fs.readFile(path.join(dir, fileName), "utf8") }))
  );
}

export async function listResolutions(workspace: WorkspaceRecord): Promise<ResolutionSummary[]> {
  const files = await readResolutionFiles(workspace);
  return files.map((file) => parseResolutionDetail(file.fileName, file.content).summary);
}

export async function getResolution(workspace: WorkspaceRecord, id: string | number): Promise<ResolutionDetail> {
  const fileName = resolutionFileName(id);
  const filePath = path.join(resolutionsDir(workspace), fileName);
  return parseResolutionDetail(fileName, await fs.readFile(filePath, "utf8"));
}

function nextResolutionId(summaries: ResolutionSummary[]): number {
  return summaries.length === 0 ? 1 : Math.max(...summaries.map((resolution) => resolution.id)) + 1;
}

function renderOpenedResolution(id: number, input: OpenResolutionInput): string {
  const frontMatter = formatFrontMatter(
    {
      resolution_id: id,
      title: input.title,
      status: "open",
      plans: input.plans,
      parties: input.parties,
      created: todayIsoDate()
    },
    resolutionFrontMatterOrder
  );
  return `---\n${frontMatter}\n---\n\n## Conflict\n\n${input.conflict.trim()}\n\n## Decision\n`;
}

export async function openResolution(
  workspace: WorkspaceRecord,
  input: OpenResolutionInput
): Promise<ResolutionMutationResult> {
  if (!input.title.trim()) throw new Error("title is required");
  if (input.plans.length === 0) throw new Error("plans are required");
  if (input.parties.length === 0) throw new Error("parties are required");
  if (!input.conflict.trim()) throw new Error("conflict is required");

  await fs.mkdir(resolutionsDir(workspace), { recursive: true });
  const id = nextResolutionId(await listResolutions(workspace));
  const fileName = resolutionFileName(id);
  const filePath = path.join(resolutionsDir(workspace), fileName);
  await fs.writeFile(filePath, renderOpenedResolution(id, input), "utf8");
  const message = `feat(resolution): open resolution ${id} — ${input.title}`;
  const commitResult = await commit(workspace.rootDir, [relativePath(workspace, filePath)], message);
  return { resolution: await getResolution(workspace, id), commit: commitResult };
}

export async function respondResolution(
  workspace: WorkspaceRecord,
  input: RespondResolutionInput
): Promise<ResolutionMutationResult> {
  if (!input.party.trim()) throw new Error("party is required");
  if (!input.position.trim()) throw new Error("position is required");

  const id = safeResolutionId(input.id);
  const fileName = resolutionFileName(id);
  const filePath = path.join(resolutionsDir(workspace), fileName);
  const source = await fs.readFile(filePath, "utf8");
  const section = `## Position: ${input.party.trim()}\n\n${input.position.trim()}\n\n`;
  const decisionIndex = source.lastIndexOf("\n## Decision");
  const nextContent =
    decisionIndex === -1 ? `${source.replace(/\s*$/, "\n\n")}${section}` : `${source.slice(0, decisionIndex + 1)}${section}${source.slice(decisionIndex + 1)}`;
  await fs.writeFile(filePath, nextContent, "utf8");
  const message = `feat(resolution): respond resolution ${id} — ${input.party.trim()}`;
  const commitResult = await commit(workspace.rootDir, [relativePath(workspace, filePath)], message);
  return { resolution: await getResolution(workspace, id), commit: commitResult };
}

function replaceDecisionSection(body: string, decision: string): string {
  const heading = "## Decision";
  const index = body.lastIndexOf(heading);
  if (index === -1) return `${body.replace(/\s*$/, "\n\n")}${heading}\n\n${decision.trim()}\n`;
  return `${body.slice(0, index)}${heading}\n\n${decision.trim()}\n`;
}

export async function decideResolution(
  workspace: WorkspaceRecord,
  input: DecideResolutionInput
): Promise<ResolutionMutationResult> {
  if (!input.decision.trim()) throw new Error("decision is required");
  const id = safeResolutionId(input.id);
  const fileName = resolutionFileName(id);
  const filePath = path.join(resolutionsDir(workspace), fileName);
  const source = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontMatter(source);
  if (!parsed.data) throw new Error(`${fileName}: invalid front matter`);
  const current = ResolutionFrontMatterSchema.parse(parsed.data);
  const frontMatter = formatFrontMatter(
    {
      ...current,
      status: input.status,
      decided: todayIsoDate()
    },
    resolutionFrontMatterOrder
  );
  const content = `---\n${frontMatter}\n---\n${replaceDecisionSection(parsed.body, input.decision)}`;
  await fs.writeFile(filePath, content, "utf8");
  const message = `feat(resolution): decide resolution ${id} — ${input.status}`;
  const commitResult = await commit(workspace.rootDir, [relativePath(workspace, filePath)], message);
  return { resolution: await getResolution(workspace, id), commit: commitResult };
}
