import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Effect, Layer } from "effect";
import { parseFrontMatter } from "../core/front-matter";
import { planPattern, type PlanFile } from "../core/plans";
import { PlanStore, type CommitResult, type DraftSummary, type LedgerSnapshot, type PlanStoreService } from "../ports/plan-store";

const execFileAsync = promisify(execFile);

export type FsGitPlanStoreOptions = {
  rootDir?: string;
  plansDir?: string;
};

function resolveRoot(rootDir?: string): string {
  return path.resolve(rootDir ?? process.env.PLANSMAN_ROOT ?? process.cwd());
}

function safePlanFileName(fileName: string): string {
  if (!planPattern.test(fileName) || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error(`Invalid plan file name: ${fileName}`);
  }
  return fileName;
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

async function readPlanFiles(plansDir: string): Promise<PlanFile[]> {
  const entries = await fs.readdir(plansDir);
  const fileNames = entries
    .filter((fileName) => planPattern.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return Promise.all(
    fileNames.map(async (fileName) => ({
      fileName,
      content: await fs.readFile(path.join(plansDir, fileName), "utf8")
    }))
  );
}

async function listDraftSummaries(rootDir: string, plansDir: string): Promise<DraftSummary[]> {
  const draftsDir = path.join(plansDir, "drafts");
  if (!(await pathExists(draftsDir))) return [];

  const activePath = path.join(plansDir, ".active-draft");
  const activeDraft = (await pathExists(activePath)) ? (await fs.readFile(activePath, "utf8")).trim() : null;
  const entries = await fs.readdir(draftsDir);
  const draftFiles = entries
    .filter((fileName) => /^draft-\d{8}-\d{6}(?:-[a-z0-9-]+)?\.md$/.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return Promise.all(
    draftFiles.map(async (fileName) => {
      const relativePath = `drafts/${fileName}`;
      const content = await fs.readFile(path.join(draftsDir, fileName), "utf8");
      const frontMatter = parseFrontMatter(content).data;
      return {
        path: relativePath,
        title: String(frontMatter?.title ?? "Untitled"),
        status: String(frontMatter?.status ?? "unknown"),
        basePlanId: typeof frontMatter?.base_plan_id === "number" ? frontMatter.base_plan_id : "unknown",
        active: activeDraft === relativePath
      };
    })
  );
}

function getSection(content: string, heading: string): string | null {
  const start = content.indexOf(heading);
  if (start === -1) return null;

  const afterHeading = content.slice(start + heading.length);
  const nextHeading = afterHeading.match(/\n## /);
  const end = nextHeading?.index === undefined ? content.length : start + heading.length + nextHeading.index;

  return content.slice(start, end);
}

async function readLedger(rootDir: string, plansDir: string): Promise<LedgerSnapshot> {
  const activePath = path.join(plansDir, ".active-draft");
  if (!(await pathExists(activePath))) return { activeDraft: null, content: null };

  const activeDraft = (await fs.readFile(activePath, "utf8")).trim();
  if (!activeDraft) return { activeDraft: null, content: null };

  const draftPath = path.resolve(plansDir, activeDraft);
  if (!draftPath.startsWith(`${path.join(plansDir, "drafts")}${path.sep}`) || !(await pathExists(draftPath))) {
    return { activeDraft, content: null };
  }

  const content = await fs.readFile(draftPath, "utf8");
  return { activeDraft, content: getSection(content, "## Problem Ledger") };
}

export function makeFsGitPlanStore(options: FsGitPlanStoreOptions = {}): PlanStoreService {
  const rootDir = resolveRoot(options.rootDir);
  const plansDir = path.resolve(rootDir, options.plansDir ?? "plans");
  const relativePlansDir = path.relative(rootDir, plansDir).split(path.sep).join("/");

  return {
    rootDir,
    plansDir,
    relativePlansDir,
    listPlanFiles: Effect.tryPromise(() => readPlanFiles(plansDir)),
    readPlanFile: (fileName: string) =>
      Effect.tryPromise(async () => {
        const safeName = safePlanFileName(fileName);
        return {
          fileName: safeName,
          content: await fs.readFile(path.join(plansDir, safeName), "utf8")
        };
      }),
    writePlanFile: (fileName: string, content: string) =>
      Effect.tryPromise(async () => {
        await fs.writeFile(path.join(plansDir, safePlanFileName(fileName)), content, "utf8");
      }),
    readArchitectureTimeline: Effect.tryPromise(async () => {
      const timelinePath = path.join(plansDir, "architecture-timeline.md");
      return (await pathExists(timelinePath)) ? await fs.readFile(timelinePath, "utf8") : null;
    }),
    commit: (message: string, paths: string[]) =>
      Effect.tryPromise(async (): Promise<CommitResult> => {
        await git(rootDir, ["add", ...paths]);
        await git(rootDir, ["commit", "-m", message]);
        const hash = await git(rootDir, ["rev-parse", "--short", "HEAD"]);
        return { hash, message };
      }),
    listDrafts: Effect.tryPromise(() => listDraftSummaries(rootDir, plansDir)),
    getLedger: Effect.tryPromise(() => readLedger(rootDir, plansDir))
  };
}

export function FsGitPlanStoreLive(options: FsGitPlanStoreOptions = {}): Layer.Layer<PlanStore> {
  return Layer.succeed(PlanStore, makeFsGitPlanStore(options));
}
