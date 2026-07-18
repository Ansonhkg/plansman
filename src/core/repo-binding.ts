import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseDocument } from "yaml";

const execFileAsync = promisify(execFile);

export type RepoBinding = {
  workspace: string;
  root?: string;
  path: string;
};

export type WorkspaceSelection = {
  rootDir: string;
  workspace?: string;
  binding?: RepoBinding;
};

export type InitInput = {
  cwd?: string;
  workspace?: string;
  root?: string;
};

export type InitResult = {
  repoRoot: string;
  workspace: string;
  rootDir: string;
  changed: string[];
  alreadyInitialized: string[];
  warnings: string[];
};

export function defaultWorkspaceRoot(): string {
  return path.join(os.homedir(), "Projects", "plansman-workspaces");
}

export function expandPath(rawPath: string, env: NodeJS.ProcessEnv = process.env): string {
  const withHome = rawPath === "~" || rawPath.startsWith("~/") ? path.join(os.homedir(), rawPath.slice(2)) : rawPath;
  const expanded = withHome.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => env[name] ?? "");
  return path.resolve(expanded);
}

function prettifySlug(slug: string): string {
  return slug
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

async function nearestGitRoot(cwd: string): Promise<string | null> {
  try {
    return await git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

async function workspaceSlugFromCwd(cwd: string, rootDir: string): Promise<string | undefined> {
  const relativePath = path.relative(rootDir, path.resolve(cwd));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;

  const [slug] = relativePath.split(path.sep);
  if (!slug) return undefined;

  const workspaceDir = path.join(rootDir, slug);
  const workspaceYamlPath = path.join(workspaceDir, "workspace.yaml");
  const legacyConfigPath = path.join(workspaceDir, "plansman.yaml");
  if ((await pathExists(workspaceYamlPath)) || (await pathExists(legacyConfigPath))) return slug;
  return undefined;
}

export async function findRepoBinding(cwd = process.cwd()): Promise<RepoBinding | null> {
  let current = path.resolve(cwd);

  while (true) {
    const configPath = path.join(current, "plansman.yaml");
    if (await pathExists(configPath)) {
      const source = await fs.readFile(configPath, "utf8");
      const doc = parseDocument(source);
      const value = doc.toJSON() as { workspace?: unknown; root?: unknown } | null;
      if (typeof value?.workspace === "string" && value.workspace.trim()) {
        return {
          workspace: value.workspace.trim(),
          root: typeof value.root === "string" && value.root.trim() ? expandPath(value.root.trim()) : undefined,
          path: configPath
        };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function resolveWorkspaceSelection(input: {
  rootDir?: string;
  workspace?: string;
  cwd?: string;
} = {}): Promise<WorkspaceSelection> {
  if (input.rootDir) {
    return { rootDir: path.resolve(input.rootDir), workspace: input.workspace };
  }

  const binding = await findRepoBinding(input.cwd);
  const rootDir = binding?.root ?? expandPath(process.env.PLANSMAN_ROOT ?? defaultWorkspaceRoot());
  const inferredWorkspace = input.workspace ?? binding?.workspace ?? (await workspaceSlugFromCwd(input.cwd ?? process.cwd(), rootDir));
  return {
    rootDir,
    workspace: inferredWorkspace,
    ...(binding ? { binding } : {})
  };
}

function planningBlock(slug: string): string {
  return [
    "<!-- plansman -->",
    "## Planning",
    "",
    `Use the \`plansman\` command; plans live in workspace ${slug}.`,
    "When creating a plan, synthesize the complete PRD first, then use",
    "`plansman new` with `--title`, `--file` (or `--stdin`), `--objective`,",
    "`--requirements`, and `--forbidden` so the plan stores the PRD and goals.",
    "Use `plansman claim` only when intentionally reserving a blank scaffold.",
    "Use `plansman idea <title>` to capture a rough thought without promoting it",
    "to accepted work. When asked what ideas exist, run `plansman idea list`.",
    "When product intent is mature, use `plansman idea shape` to preserve a PRD",
    "and explicit goals before promotion copies the full PRD into the plan.",
    "<!-- /plansman -->"
  ].join("\n");
}

async function appendPlanningBlock(filePath: string, slug: string): Promise<"changed" | "already"> {
  const block = planningBlock(slug);
  const source = (await pathExists(filePath)) ? await fs.readFile(filePath, "utf8") : "";
  const existingBlock = source.match(/<!-- plansman -->[\s\S]*?<!-- \/plansman -->/)?.[0];
  if (existingBlock === block) return "already";
  if (existingBlock) {
    await fs.writeFile(filePath, source.replace(existingBlock, block), "utf8");
    return "changed";
  }
  const prefix = source.length === 0 ? "" : source.endsWith("\n") ? "\n" : "\n\n";
  await fs.writeFile(filePath, `${source}${prefix}${block}\n`, "utf8");
  return "changed";
}

async function appendEnvRoot(repoRoot: string, rootDir: string): Promise<"changed" | "already"> {
  const envPath = path.join(repoRoot, ".env");
  const source = (await pathExists(envPath)) ? await fs.readFile(envPath, "utf8") : "";
  if (/^PLANSMAN_ROOT=/m.test(source)) return "already";
  const prefix = source.length === 0 || source.endsWith("\n") ? "" : "\n";
  await fs.writeFile(envPath, `${source}${prefix}PLANSMAN_ROOT=${rootDir}\n`, "utf8");
  return "changed";
}

export async function initWorkspace(input: InitInput = {}): Promise<InitResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const repoRoot = (await nearestGitRoot(cwd)) ?? cwd;
  const slug = input.workspace?.trim() || path.basename(repoRoot);
  const rootDir = input.root ? expandPath(input.root) : expandPath(process.env.PLANSMAN_ROOT ?? defaultWorkspaceRoot());
  const changed: string[] = [];
  const alreadyInitialized: string[] = [];
  const warnings: string[] = [];

  const repoConfigPath = path.join(repoRoot, "plansman.yaml");
  if (await pathExists(repoConfigPath)) {
    const source = await fs.readFile(repoConfigPath, "utf8");
    if (source.includes(`workspace: ${slug}`) || source.includes(`workspace: '${slug}'`) || source.includes(`workspace: "${slug}"`)) {
      alreadyInitialized.push("repo plansman.yaml");
    } else {
      alreadyInitialized.push("repo plansman.yaml exists");
    }
  } else {
    await fs.writeFile(repoConfigPath, `workspace: ${slug}\n`, "utf8");
    changed.push("repo plansman.yaml");
  }

  const workspaceDir = path.join(rootDir, slug);
  const plansDir = path.join(workspaceDir, "plans");
  const resolutionsDir = path.join(workspaceDir, "resolutions");
  const plansExisted = await pathExists(plansDir);
  const resolutionsExisted = await pathExists(resolutionsDir);
  await fs.mkdir(path.join(workspaceDir, "plans"), { recursive: true });
  await fs.mkdir(path.join(workspaceDir, "resolutions"), { recursive: true });
  if (plansExisted && resolutionsExisted) alreadyInitialized.push("workspace directories");
  else changed.push("workspace directories");

  const workspaceConfigPath = path.join(workspaceDir, "workspace.yaml");
  if (await pathExists(workspaceConfigPath)) {
    alreadyInitialized.push("workspace.yaml");
  } else {
    await fs.writeFile(workspaceConfigPath, `name: ${prettifySlug(slug)}\nsections: {}\n`, "utf8");
    changed.push("workspace.yaml");
  }

  const claudePath = path.join(repoRoot, "CLAUDE.md");
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  const claudeExists = await pathExists(claudePath);
  const agentsExists = await pathExists(agentsPath);
  const instructionFiles = claudeExists || agentsExists ? [claudeExists ? claudePath : null, agentsPath] : [agentsPath];

  for (const filePath of instructionFiles.filter((item): item is string => Boolean(item))) {
    const result = await appendPlanningBlock(filePath, slug);
    if (result === "changed") changed.push(path.basename(filePath));
    else alreadyInitialized.push(path.basename(filePath));
  }

  if (input.root) {
    const envResult = await appendEnvRoot(repoRoot, rootDir);
    if (envResult === "changed") changed.push(".env");
    else alreadyInitialized.push(".env");
    warnings.push("PLANSMAN_ROOT was written to .env; keep .env out of git.");
  }

  return { repoRoot, workspace: slug, rootDir, changed, alreadyInitialized, warnings };
}
