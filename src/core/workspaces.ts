import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseDocument } from "yaml";
import type { SectionFile, Workspace, WorkspaceSection } from "../../surfaces/contracts/plansman.v1";
import { parseFrontMatter } from "./front-matter";
import { resolveWorkspaceSelection } from "./repo-binding";

const execFileAsync = promisify(execFile);

export type WorkspaceRecord = Workspace & {
  rootDir: string;
  absolutePath: string;
  absolutePlansDir: string;
  configPath: string | null;
};

export type SectionContent = {
  file: SectionFile;
  content: string;
};

export class WorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

// The data root is a git repo holding one directory per workspace
// (~/Projects/plansman-workspaces by default) — separate from the app repo.
async function resolveRoot(rootDir?: string): Promise<string> {
  return (await resolveWorkspaceSelection({ rootDir })).rootDir;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectories(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

async function countMarkdownFiles(dir: string): Promise<number> {
  if (!(await pathExists(dir))) return 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
}

async function countOpenResolutions(workspaceDir: string): Promise<number> {
  const resolutionsDir = path.join(workspaceDir, "resolutions");
  if (!(await pathExists(resolutionsDir))) return 0;
  const entries = await fs.readdir(resolutionsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /^resolution-\d+\.md$/.test(entry.name));
  const statuses = await Promise.all(
    files.map(async (entry) => {
      const content = await fs.readFile(path.join(resolutionsDir, entry.name), "utf8");
      return parseFrontMatter(content).data?.status;
    })
  );
  return statuses.filter((status) => status === "open").length;
}

function displayName(id: string): string {
  return id
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function relative(rootDir: string, target: string): string {
  return path.relative(rootDir, target).split(path.sep).join("/");
}

function yamlSections(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const sections = (value as { sections?: unknown }).sections;
  if (!sections || typeof sections !== "object") return {};
  return Object.fromEntries(
    Object.entries(sections as Record<string, unknown>).map(([key, enabled]) => [key, enabled === true])
  );
}

async function readDocsWorkspace(rootDir: string, slug: string): Promise<WorkspaceRecord | null> {
  const workspaceDir = path.join(rootDir, slug);
  const workspaceConfigPath = path.join(workspaceDir, "workspace.yaml");
  const legacyConfigPath = path.join(workspaceDir, "plansman.yaml");
  const configPath = (await pathExists(workspaceConfigPath))
    ? workspaceConfigPath
    : (await pathExists(legacyConfigPath))
      ? legacyConfigPath
      : null;
  if (!configPath) return null;

  const source = await fs.readFile(configPath, "utf8");
  const doc = parseDocument(source);
  const value = doc.toJSON() as { name?: unknown } | null;
  const name = typeof value?.name === "string" && value.name.trim() ? value.name : displayName(slug);
  const enabledById = yamlSections(value);
  const sectionDirs = (await readDirectories(workspaceDir)).filter(
    (dir) => dir !== "plans" && dir !== "resolutions" && dir !== "backlog"
  );
  const sections = await Promise.all(
    sectionDirs.map(async (id): Promise<WorkspaceSection> => {
      const sectionPath = path.join(workspaceDir, id);
      return {
        id,
        name: displayName(id),
        path: relative(rootDir, sectionPath),
        enabled: enabledById[id] === true,
        fileCount: await countMarkdownFiles(sectionPath)
      };
    })
  );
  const absolutePlansDir = path.join(workspaceDir, "plans");

  return {
    slug,
    name,
    path: relative(rootDir, workspaceDir),
    plansDir: relative(rootDir, absolutePlansDir),
    legacy: false,
    sections,
    openResolutionCount: await countOpenResolutions(workspaceDir),
    rootDir,
    absolutePath: workspaceDir,
    absolutePlansDir,
    configPath
  };
}

async function readLegacyWorkspace(rootDir: string): Promise<WorkspaceRecord | null> {
  const plansDir = path.join(rootDir, "plans");
  if (!(await pathExists(plansDir))) return null;

  const sectionDirs = (await readDirectories(plansDir)).filter((dir) => dir !== "plans" && dir !== "resolutions");
  const sections = await Promise.all(
    sectionDirs.map(async (id): Promise<WorkspaceSection> => {
      const sectionPath = path.join(plansDir, id);
      return {
        id,
        name: displayName(id),
        path: relative(rootDir, sectionPath),
        enabled: id === "drafts",
        fileCount: await countMarkdownFiles(sectionPath)
      };
    })
  );

  return {
    slug: "intent-workspace",
    name: "Intent Workspace",
    path: ".",
    plansDir: "plans",
    legacy: true,
    sections,
    rootDir,
    absolutePath: rootDir,
    absolutePlansDir: plansDir,
    configPath: null
  };
}

async function lastActivity(workspace: WorkspaceRecord): Promise<number> {
  const candidates = [workspace.configPath, workspace.absolutePlansDir].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  const planFiles = (await pathExists(workspace.absolutePlansDir))
    ? (await fs.readdir(workspace.absolutePlansDir)).map((name) => path.join(workspace.absolutePlansDir, name))
    : [];

  const times = await Promise.all(
    [...candidates, ...planFiles].map(async (filePath) => {
      try {
        return (await fs.stat(filePath)).mtimeMs;
      } catch {
        return 0;
      }
    })
  );

  return Math.max(0, ...times);
}

export async function discoverWorkspaces(rootDir?: string): Promise<WorkspaceRecord[]> {
  const resolvedRoot = await resolveRoot(rootDir);
  const slugs = await readDirectories(resolvedRoot);
  const rootWorkspaces = (
    await Promise.all(slugs.map((slug) => readDocsWorkspace(resolvedRoot, slug)))
  ).filter((workspace): workspace is WorkspaceRecord => Boolean(workspace));
  const legacyWorkspace = await readLegacyWorkspace(resolvedRoot);
  const workspaces = [...rootWorkspaces, ...(legacyWorkspace ? [legacyWorkspace] : [])];

  if (workspaces.length === 0) {
    throw new WorkspaceError("NO_WORKSPACES", "No Plansman workspaces found.", 404);
  }

  // Recent workspaces first: the UI's default selection and switcher order.
  const withActivity = await Promise.all(
    workspaces.map(async (workspace) => ({ workspace, activity: await lastActivity(workspace) }))
  );
  return withActivity
    .sort((left, right) => right.activity - left.activity)
    .map(({ workspace, activity }) => ({ ...workspace, lastActivity: activity }));
}

export async function getWorkspace(rootDir: string | undefined, slug?: string): Promise<WorkspaceRecord> {
  const selection = await resolveWorkspaceSelection({ rootDir, workspace: slug });
  const workspaces = await discoverWorkspaces(selection.rootDir);
  const workspaceSlug = selection.workspace;
  const workspace = workspaceSlug ? workspaces.find((item) => item.slug === workspaceSlug) : workspaces[0];
  if (!workspace) throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace not found: ${workspaceSlug}`, 404);
  return workspace;
}

function findSection(workspace: WorkspaceRecord, sectionId: string): WorkspaceSection {
  const section = workspace.sections.find((item) => item.id === sectionId);
  if (!section) {
    throw new WorkspaceError("SECTION_NOT_FOUND", `Section not found: ${sectionId}`, 404);
  }
  return section;
}

function safeSectionFileName(fileName: string): string {
  if (
    !fileName.endsWith(".md") ||
    fileName.includes("..") ||
    path.isAbsolute(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    throw new WorkspaceError("INVALID_SECTION_FILE", `Invalid section file name: ${fileName}`, 400);
  }
  return fileName;
}

function titleFromMarkdown(fileName: string, content: string): string {
  const frontMatter = parseFrontMatter(content).data;
  if (typeof frontMatter?.title === "string" && frontMatter.title.trim()) return frontMatter.title;
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fileName.replace(/\.md$/, "");
}

export async function listSectionFiles(
  rootDir: string | undefined,
  workspaceSlug: string | undefined,
  sectionId: string
): Promise<SectionFile[]> {
  const workspace = await getWorkspace(rootDir, workspaceSlug);
  const section = findSection(workspace, sectionId);
  const sectionPath = path.join(workspace.rootDir, section.path);
  const entries = await fs.readdir(sectionPath, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return Promise.all(
    fileNames.map(async (name) => {
      const content = await fs.readFile(path.join(sectionPath, name), "utf8");
      return {
        name,
        title: titleFromMarkdown(name, content),
        path: `${section.path}/${name}`
      };
    })
  );
}

export async function readSectionFile(
  rootDir: string | undefined,
  workspaceSlug: string | undefined,
  sectionId: string,
  fileName: string
): Promise<SectionContent> {
  const safeName = safeSectionFileName(fileName);
  const workspace = await getWorkspace(rootDir, workspaceSlug);
  const section = findSection(workspace, sectionId);
  const sectionPath = path.join(workspace.rootDir, section.path);
  const filePath = path.join(sectionPath, safeName);
  const content = await fs.readFile(filePath, "utf8");
  return {
    file: {
      name: safeName,
      title: titleFromMarkdown(safeName, content),
      path: `${section.path}/${safeName}`
    },
    content
  };
}

async function git(rootDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: rootDir });
  return String(stdout).trim();
}

export async function toggleSection(
  rootDir: string | undefined,
  workspaceSlug: string,
  sectionId: string,
  enabled: boolean
) {
  const workspace = await getWorkspace(rootDir, workspaceSlug);
  findSection(workspace, sectionId);

  if (workspace.legacy || !workspace.configPath) {
    throw new WorkspaceError(
      "LEGACY_SETTINGS_READ_ONLY",
      "Legacy workspace settings persist after migration to a workspace directory with workspace.yaml.",
      409
    );
  }

  const source = await fs.readFile(workspace.configPath, "utf8");
  const doc = parseDocument(source);
  doc.setIn(["sections", sectionId], enabled);
  await fs.writeFile(workspace.configPath, doc.toString(), "utf8");

  const configRelativePath = relative(workspace.rootDir, workspace.configPath);
  const message = `chore(workspace): ${enabled ? "enable" : "disable"} ${sectionId} in ${workspace.slug}`;
  await git(workspace.rootDir, ["add", configRelativePath]);
  await git(workspace.rootDir, ["commit", "-m", message]);
  const hash = await git(workspace.rootDir, ["rev-parse", "--short", "HEAD"]);

  return {
    workspace: await getWorkspace(rootDir, workspaceSlug),
    commit: { hash, message }
  };
}
