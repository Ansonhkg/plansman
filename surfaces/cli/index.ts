#!/usr/bin/env bun
import { createPlansmanSdk } from "../sdk";
import { PlanStatusSchema, ResolutionStatusSchema } from "../contracts/plansman.v1";
import { buildPlanDag, type PlanDagData } from "../../src/core/plan-dag";
import { getWorkspace } from "../../src/core/workspaces";

type CliResult = {
  exitCode: number;
  payload?: unknown;
  human?: string;
};

function usage(): string {
  return `Usage:
  bun plansman lint [--workspace <slug>] [--json]
  bun plansman list [--workspace <slug>] [--json]
  bun plansman dag [--workspace <slug>] [--compact] [--color|--no-color] [--json]
  bun plansman get <id> [--workspace <slug>] [--json]
  bun plansman idea <title> [--workspace <slug>] [--json]
  bun plansman idea list [--workspace <slug>] [--json]
  bun plansman idea get <id> [--workspace <slug>] [--json]
  bun plansman idea note <id> --note <text> [--workspace <slug>] [--json]
  bun plansman idea shape [<id>] [--title <title>] (--file <path>|--stdin) --objective <text> --requirements <text> --forbidden <text> [--workspace <slug>] [--json]
  bun plansman idea dismiss <id> --reason <text> [--workspace <slug>] [--json]
  bun plansman idea promote <id> [--objective <text> --requirements <text> --forbidden <text>] [--target <id>] [--workspace <slug>] [--json]
  bun plansman claim --title <title> [--target <id>] [--workspace <slug>] [--json]
  bun plansman new --title <title> (--file <path>|--stdin) --objective <text> --requirements <text> --forbidden <text> [--target <id>] [--workspace <slug>] [--json]
  bun plansman complete <id> [--defer <title> ...] [--defer-proof <requirement> ...] [--category <name>] [--reason <text>] [--workspace <slug>] [--json]
  bun plansman set-status <id> --status <status> --completion <0-100> [--override-resolutions] [--override-restatement] [--workspace <slug>] [--json]
  bun plansman backlog list [--workspace <slug>] [--json]
  bun plansman backlog get <id> [--workspace <slug>] [--json]
  bun plansman backlog add --title <title> --category <name> --reason <text> [--source-plan <id>] [--workspace <slug>] [--json]
  bun plansman backlog done <id> [--workspace <slug>] [--json]
  bun plansman sections-list [--workspace <slug>] [--json]
  bun plansman init [--workspace <slug>] [--root <path>] [--json]
  bun plansman resolutions list [--workspace <slug>] [--json]
  bun plansman resolutions get <n> [--workspace <slug>] [--json]
  bun plansman resolutions open --title <t> --plans <ids> --party <p> --conflict <text> [--workspace <slug>] [--json]
  bun plansman resolutions respond <n> --party <p> --position <text> [--workspace <slug>] [--json]
  bun plansman resolutions decide <n> --decision <text> [--status agreed|withdrawn] [--workspace <slug>] [--json]`;
}

type FlagValue = string | boolean | string[];

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, FlagValue> } {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};

  const setFlag = (key: string, value: string | boolean) => {
    const current = flags[key];
    if (current === undefined) flags[key] = value;
    else if (Array.isArray(current)) current.push(String(value));
    else flags[key] = [String(current), String(value)];
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === "json") {
      setFlag("json", true);
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      setFlag(key, true);
      continue;
    }
    setFlag(key, value);
    index += 1;
  }

  return { positional, flags };
}

function table(rows: Record<string, string | number | boolean | undefined>[]): string {
  if (rows.length === 0) return "No rows.";
  const columns = Object.keys(rows[0] ?? {});
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length))
  );

  const render = (values: string[]) => values.map((value, index) => value.padEnd(widths[index])).join("  ");
  return [
    render(columns),
    render(columns.map((_, index) => "-".repeat(widths[index]))),
    ...rows.map((row) => render(columns.map((column) => String(row[column] ?? ""))))
  ].join("\n");
}

const DAG_PALETTE = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];
const DAG_OVERFLOW = "#898781";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function ansiFg(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}m`;
}

function paint(value: string, hex: string | null, style: string, useColor: boolean): string {
  if (!useColor) return value;
  return `${hex ? ansiFg(hex) : ""}${style}${value}${RESET}`;
}

function dagBranchColor(data: PlanDagData, branchId: string): string {
  const index = data.branches.findIndex((branch) => branch.id === branchId);
  return index >= 0 && index < DAG_PALETTE.length ? DAG_PALETTE[index] : DAG_OVERFLOW;
}

function renderPlanDag(data: PlanDagData, options: { compact: boolean; useColor: boolean }): string {
  if (data.events.length === 0) return "No plans.";

  const usedBranches = data.branches.filter((branch) => data.events.some((event) => event.branch === branch.id));
  const lanes = new Map(usedBranches.map((branch, index) => [branch.id, index]));
  const byId = new Map(data.events.map((event) => [event.id, event]));
  const laneCount = Math.max(1, usedBranches.length);
  const graphWidth = laneCount * 2 - 1;
  const active = new Set<number>();
  const children = new Map<string, string[]>();
  const firstOfBranch = new Map<string, string>();
  const forkEdges = new Map<string, Array<{ childId: string }>>();
  const sideParents = new Map<string, Array<{ parentId: string }>>();
  const laneRemaining = Array.from({ length: laneCount }, () => 0);
  const lines: string[] = [];

  const branchColorByLane = (lane: number) => dagBranchColor(data, usedBranches[lane]?.id ?? "");
  const laneOfEvent = (event: PlanDagData["events"][number]) => lanes.get(event.branch) ?? 0;
  const renderCells = (cells: Array<{ char: string; color: string; dim?: boolean } | null>) =>
    cells.map((cell) => (cell ? paint(cell.char, cell.color, cell.dim ? DIM : "", options.useColor) : " ")).join("");
  const baseCells = () => {
    const cells = Array.from({ length: graphWidth }, () => null) as Array<{ char: string; color: string; dim?: boolean } | null>;
    for (const lane of active) {
      cells[lane * 2] = { char: "│", color: branchColorByLane(lane), dim: true };
    }
    return cells;
  };
  const branchName = (branchId: string) => data.branches.find((branch) => branch.id === branchId)?.name ?? branchId;
  const eventLane = (id: string) => {
    const event = byId.get(id);
    return event ? laneOfEvent(event) : 0;
  };

  for (const event of data.events) {
    if (!firstOfBranch.has(event.branch)) firstOfBranch.set(event.branch, event.id);

    for (const parentId of event.parents) {
      const childrenForParent = children.get(parentId) ?? [];
      childrenForParent.push(event.id);
      children.set(parentId, childrenForParent);
    }
  }

  for (const event of data.events) {
    let forkAssigned = false;

    for (const parentId of event.parents) {
      const parent = byId.get(parentId);
      if (!parent || laneOfEvent(parent) === laneOfEvent(event)) continue;

      if (!forkAssigned && firstOfBranch.get(event.branch) === event.id) {
        const next = forkEdges.get(parentId) ?? [];
        next.push({ childId: event.id });
        forkEdges.set(parentId, next);
        forkAssigned = true;
      } else {
        const next = sideParents.get(event.id) ?? [];
        next.push({ parentId });
        sideParents.set(event.id, next);
      }
    }
  }

  for (const event of data.events) {
    laneRemaining[laneOfEvent(event)] += 1;
  }

  for (const [parentId, edges] of forkEdges.entries()) {
    laneRemaining[eventLane(parentId)] += edges.length;
  }

  for (const edges of sideParents.values()) {
    for (const { parentId } of edges) {
      laneRemaining[eventLane(parentId)] += 1;
    }
  }

  const drawTransition = (fromLane: number, toLane: number, kind: "fork" | "merge", edgeColor: string) => {
    laneRemaining[fromLane] -= 1;
    const closingFrom = laneRemaining[fromLane] <= 0;
    const cells = baseCells();
    const low = Math.min(fromLane, toLane);
    const high = Math.max(fromLane, toLane);

    for (let column = low * 2 + 1; column < high * 2; column += 1) {
      const crossing = column % 2 === 0 && active.has(column / 2);
      cells[column] = { char: crossing ? "┼" : "─", color: edgeColor };
    }

    if (kind === "fork") {
      cells[fromLane * 2] = { char: closingFrom ? (toLane > fromLane ? "╰" : "╯") : (toLane > fromLane ? "├" : "┤"), color: edgeColor };
      cells[toLane * 2] = { char: toLane > fromLane ? "╮" : "╭", color: edgeColor };
    } else {
      cells[fromLane * 2] = { char: closingFrom ? (fromLane > toLane ? "╯" : "╰") : (fromLane > toLane ? "┤" : "├"), color: edgeColor };
      cells[toLane * 2] = { char: fromLane > toLane ? "├" : "┤", color: edgeColor };
    }

    lines.push(renderCells(cells));
    if (closingFrom) active.delete(fromLane);
    if (kind === "fork") active.add(toLane);
  };

  const wrap = (value: string, width: number) => {
    const words = String(value).split(/\s+/).filter(Boolean);
    const wrapped: string[] = [];
    let line = "";

    for (const word of words) {
      if (line && line.length + 1 + word.length > width) {
        wrapped.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }

    if (line) wrapped.push(line);
    return wrapped;
  };
  const terminalWidth = Math.min(process.stdout.columns || 110, 120);
  const textWidth = Math.max(34, terminalWidth - graphWidth - 4);

  lines.push(
    usedBranches
      .map((branch) => {
        const count = data.events.filter((event) => event.branch === branch.id).length;
        return `${paint("●", dagBranchColor(data, branch.id), "", options.useColor)} ${branch.name} ${paint(`· ${count}`, null, DIM, options.useColor)}`;
      })
      .join("   "),
  );
  lines.push(paint(`── ${data.title} ──`, null, DIM, options.useColor));
  lines.push("");

  for (const [index, event] of data.events.entries()) {
    const currentLane = laneOfEvent(event);
    const merges = (sideParents.get(event.id) ?? [])
      .slice()
      .sort((left, right) => Math.abs(eventLane(right.parentId) - currentLane) - Math.abs(eventLane(left.parentId) - currentLane));

    for (const { parentId } of merges) {
      const parent = byId.get(parentId);
      if (parent) drawTransition(laneOfEvent(parent), currentLane, "merge", dagBranchColor(data, parent.branch));
    }

    active.add(currentLane);
    const cells = baseCells();
    const isMerge = event.parents.length > 1;
    const isTip = !(children.get(event.id) ?? []).length;
    cells[currentLane * 2] = {
      char: isMerge ? "◉" : isTip ? "○" : "●",
      color: dagBranchColor(data, event.branch),
    };

    const heading = [
      paint(event.label, null, DIM, options.useColor),
      paint(event.title, null, BOLD, options.useColor),
      paint(`[${event.tag}]`, dagBranchColor(data, event.branch), "", options.useColor),
    ].filter(Boolean).join("  ");
    lines.push(`${renderCells(cells)}  ${heading}`);

    laneRemaining[currentLane] -= 1;
    if (laneRemaining[currentLane] <= 0) active.delete(currentLane);

    if (!options.compact) {
      for (const line of wrap(event.desc, textWidth)) {
        lines.push(`${renderCells(baseCells())}  ${paint(line, null, DIM, options.useColor)}`);
      }
      lines.push(`${renderCells(baseCells())}  ${paint(`${event.meta} · ${branchName(event.branch)}`, dagBranchColor(data, event.branch), DIM, options.useColor)}`);
    }

    const forks = (forkEdges.get(event.id) ?? [])
      .slice()
      .sort((left, right) => eventLane(left.childId) - eventLane(right.childId));

    for (const { childId } of forks) {
      const child = byId.get(childId);
      if (child) drawTransition(currentLane, laneOfEvent(child), "fork", dagBranchColor(data, child.branch));
    }

    if (index < data.events.length - 1 && active.size > 0) {
      lines.push(renderCells(baseCells()));
    }
  }

  return lines.join("\n");
}

function requireString(value: FlagValue | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new UsageError(`Missing ${name}.`);
  return value;
}

function stringValues(value: FlagValue | undefined): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}

function backlogNotice(items: Array<{ label: string; category?: string; title: string }>): string | null {
  if (items.length === 0) return null;
  return [
    `Workspace backlog: ${items.length} open item(s)`,
    ...items.map((item) => `  ${item.label} [${item.category ?? "general"}] ${item.title}`),
    "Run `plansman backlog list` for details."
  ].join("\n");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

class UsageError extends Error {}

async function run(args: string[]): Promise<CliResult> {
  const command = args[0];
  const { positional, flags } = parseFlags(args.slice(1));
  const sdk = createPlansmanSdk();
  const workspace = typeof flags.workspace === "string" ? flags.workspace : undefined;

  if (command === "init") {
    const root = typeof flags.root === "string" ? flags.root : undefined;
    const result = await sdk.init({ workspace, root });
    return {
      exitCode: 0,
      payload: result,
      human: [
        `Initialized workspace ${result.workspace} at ${result.rootDir}.`,
        result.changed.length ? `Changed: ${result.changed.join(", ")}` : null,
        result.alreadyInitialized.length ? `Already initialized: ${result.alreadyInitialized.join(", ")}` : null,
        ...result.warnings
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  if (command === "lint") {
    const report = await sdk.plans.lint(workspace);
    return {
      exitCode: report.ok ? 0 : 1,
      payload: report,
      human: report.ok
        ? `Plan lint passed for ${report.planCount} plan file(s).`
        : `Plan lint failed for ${report.planCount} plan file(s):\n${report.findings.map((finding) => `${finding.fileName}: ${finding.message}`).join("\n")}`
    };
  }

  if (command === "list") {
    const plans = await sdk.plans.list(workspace);
    return {
      exitCode: 0,
      payload: { plans },
      human: table(plans.map((plan) => ({ id: plan.label, status: plan.status, completion: plan.completion, title: plan.title })))
    };
  }

  if (command === "dag") {
    const plans = await sdk.plans.list(workspace);
    const resolvedWorkspace = await getWorkspace(undefined, workspace);
    const dag = buildPlanDag(plans, `${resolvedWorkspace.slug} follow-up DAG`);
    const useColor = flags.color === true || (flags["no-color"] !== true && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
    return {
      exitCode: 0,
      payload: { dag },
      human: renderPlanDag(dag, { compact: flags.compact === true, useColor })
    };
  }

  if (command === "get") {
    const id = positional[0];
    if (!id) throw new UsageError("Missing plan id.");
    const plan = await sdk.plans.get(id, workspace);
    return {
      exitCode: 0,
      payload: { plan },
      human: table([
        {
          id: plan.summary.label,
          status: plan.summary.status,
          completion: plan.summary.completion,
          title: plan.summary.title
        }
      ])
    };
  }

  if (command === "idea") {
    const subcommand = positional[0];

    if (subcommand === "list") {
      const ideas = await sdk.ideas.list(workspace);
      return {
        exitCode: 0,
        payload: { ideas },
        human: table(ideas.map((idea) => ({
          id: idea.label,
          status: idea.status,
          promoted_plan: idea.promotedPlan,
          title: idea.title
        })))
      };
    }

    if (subcommand === "get") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing idea id.");
      const idea = await sdk.ideas.get(id, workspace);
      return {
        exitCode: 0,
        payload: { idea },
        human: `${table([{
          id: idea.summary.label,
          status: idea.summary.status,
          promoted_plan: idea.summary.promotedPlan,
          title: idea.summary.title
        }])}\n\n${idea.body.trimEnd()}`
      };
    }

    if (subcommand === "note") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing idea id.");
      const note = typeof flags.note === "string"
        ? requireString(flags.note, "--note")
        : positional.slice(2).join(" ").trim();
      if (!note) throw new UsageError("Missing --note.");
      const result = await sdk.ideas.note({ id, note, workspace });
      return { exitCode: 0, payload: result, human: `Added a note to ${result.idea.summary.label} at ${result.commit.hash}.` };
    }

    if (subcommand === "shape") {
      const id = positional[1];
      const title = typeof flags.title === "string" ? flags.title.trim() : undefined;
      const file = typeof flags.file === "string" ? flags.file : undefined;
      const useStdin = flags.stdin === true;
      if (Boolean(file) === useStdin) throw new UsageError("Use exactly one of --file or --stdin.");
      const prd = file ? await Bun.file(file).text() : await Bun.stdin.text();
      const objective = requireString(flags.objective, "--objective");
      const requirements = requireString(flags.requirements, "--requirements");
      const forbidden = requireString(flags.forbidden, "--forbidden");
      const result = await sdk.ideas.shape({ id, title, prd, objective, requirements, forbidden, workspace });
      return {
        exitCode: 0,
        payload: result,
        human: `Shaped ${result.idea.summary.label}: ${result.idea.summary.title} at ${result.commit.hash}.`
      };
    }

    if (subcommand === "dismiss") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing idea id.");
      const reason = requireString(flags.reason, "--reason");
      const result = await sdk.ideas.dismiss({ id, reason, workspace });
      return { exitCode: 0, payload: result, human: `Dismissed ${result.idea.summary.label} at ${result.commit.hash}.` };
    }

    if (subcommand === "promote") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing idea id.");
      const objective = typeof flags.objective === "string" ? flags.objective : undefined;
      const requirements = typeof flags.requirements === "string" ? flags.requirements : undefined;
      const forbidden = typeof flags.forbidden === "string" ? flags.forbidden : undefined;
      const target = typeof flags.target === "string" ? flags.target : undefined;
      const result = await sdk.ideas.promote({ id, objective, requirements, forbidden, target, workspace });
      return {
        exitCode: 0,
        payload: result,
        human: `Promoted ${result.idea.summary.label} to plan-${result.plan.summary.label}.md at ${result.commit.hash}.`
      };
    }

    const titleParts = subcommand === "add" ? positional.slice(1) : positional;
    const title = typeof flags.title === "string" ? flags.title : titleParts.join(" ").trim();
    if (!title) throw new UsageError("Missing idea title.");
    const result = await sdk.ideas.add({ title, workspace });
    return { exitCode: 0, payload: result, human: `Captured ${result.idea.summary.label}: ${result.idea.summary.title}` };
  }

  if (command === "claim") {
    const title = requireString(flags.title, "--title");
    const target = typeof flags.target === "string" ? flags.target : undefined;
    const result = await sdk.plans.claim({ title, target, workspace });
    return {
      exitCode: 0,
      payload: result,
      human: `Claimed plan-${result.plan.summary.label}.md at ${result.commit.hash}.`
    };
  }

  if (command === "new") {
    const title = requireString(flags.title, "--title");
    const objective = requireString(flags.objective, "--objective");
    const requirements = requireString(flags.requirements, "--requirements");
    const forbidden = requireString(flags.forbidden, "--forbidden");
    const file = typeof flags.file === "string" ? flags.file : undefined;
    const useStdin = flags.stdin === true;
    if (Boolean(file) === useStdin) throw new UsageError("Use exactly one of --file or --stdin.");
    const prd = file ? await Bun.file(file).text() : await Bun.stdin.text();
    const target = typeof flags.target === "string" ? flags.target : undefined;
    const result = await sdk.plans.create({ title, prd, objective, requirements, forbidden, target, workspace });
    return {
      exitCode: 0,
      payload: result,
      human: `Created plan-${result.plan.summary.label}.md as a self-contained PRD with explicit goals at ${result.commit.hash}.`
    };
  }

  if (command === "set-status") {
    const id = positional[0];
    if (!id) throw new UsageError("Missing plan id.");
    const status = PlanStatusSchema.parse(requireString(flags.status, "--status"));
    const completionRaw = flags.completion;
    const completion = completionRaw === undefined ? undefined : Number(requireString(completionRaw, "--completion"));
    if (completion !== undefined && !Number.isFinite(completion)) throw new UsageError("--completion must be a number.");
    const overrideResolutions = flags["override-resolutions"] === true;
    const overrideRestatement = flags["override-restatement"] === true;
    const result = await sdk.plans.setStatus({ id, status, completion, workspace, overrideResolutions, overrideRestatement });
    const notice = "notices" in result ? backlogNotice(result.notices.backlog) : null;
    return {
      exitCode: 0,
      payload: result,
      human: [`Updated plan-${result.plan.summary.label}.md at ${result.commit.hash}.`, notice].filter(Boolean).join("\n")
    };
  }

  if (command === "complete") {
    const id = positional[0];
    if (!id) throw new UsageError("Missing plan id.");
    const titles = stringValues(flags.defer).map((title) => title.trim()).filter(Boolean);
    const proofRequirements = stringValues(flags["defer-proof"]).map((title) => title.trim()).filter(Boolean);
    const category = typeof flags.category === "string" ? flags.category : "general";
    const reason = titles.length + proofRequirements.length > 0 ? requireString(flags.reason, "--reason") : "";
    const overrideResolutions = flags["override-resolutions"] === true;
    const overrideRestatement = flags["override-restatement"] === true;
    const result = await sdk.plans.complete({
      id,
      workspace,
      overrideResolutions,
      overrideRestatement,
      deferrals: [
        ...titles.map((title) => ({ title, category, reason })),
        ...proofRequirements.map((proofRequirement) => ({
          title: proofRequirement,
          category,
          reason,
          proofRequirement
        }))
      ]
    });
    return {
      exitCode: 0,
      payload: result,
      human: [
        `Completed plan-${result.plan.summary.label}.md at ${result.commit.hash}.`,
        ...result.backlog.map((item) => `Deferred ${item.summary.label} [${item.summary.category}] ${item.summary.title}`)
      ].join("\n")
    };
  }

  if (command === "backlog") {
    const subcommand = positional[0];
    if (subcommand === "list") {
      const backlog = await sdk.backlog.list(workspace);
      return {
        exitCode: 0,
        payload: { backlog },
        human: table(backlog.map((item) => ({ id: item.label, status: item.status, category: item.category, source: item.sourcePlan, title: item.title })))
      };
    }
    if (subcommand === "get") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing backlog id.");
      const backlog = await sdk.backlog.get(id, workspace);
      return { exitCode: 0, payload: { backlog }, human: table([{ id: backlog.summary.label, status: backlog.summary.status, title: backlog.summary.title }]) };
    }
    if (subcommand === "add") {
      const title = requireString(flags.title, "--title");
      const category = requireString(flags.category, "--category");
      const reason = requireString(flags.reason, "--reason");
      const sourcePlan = typeof flags["source-plan"] === "string" ? flags["source-plan"] : undefined;
      const result = await sdk.backlog.add({ title, category, reason, sourcePlan, workspace });
      return { exitCode: 0, payload: result, human: `Added ${result.backlog.summary.label} at ${result.commit.hash}.` };
    }
    if (subcommand === "done") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing backlog id.");
      const result = await sdk.backlog.done(id, workspace);
      return { exitCode: 0, payload: result, human: `Completed ${result.backlog.summary.label} at ${result.commit.hash}.` };
    }
    throw new UsageError("Unknown backlog command.");
  }

  if (command === "sections-list") {
    const sections = await sdk.sections.list(workspace);
    return {
      exitCode: 0,
      payload: { sections },
      human: table(sections.map((section) => ({ id: section.id, enabled: section.enabled, files: section.fileCount })))
    };
  }

  if (command === "resolutions") {
    const subcommand = positional[0];

    if (subcommand === "list") {
      const resolutions = await sdk.resolutions.list(workspace);
      return {
        exitCode: 0,
        payload: { resolutions },
        human: table(
          resolutions.map((resolution) => ({
            id: resolution.id,
            status: resolution.status,
            plans: resolution.plans.join(","),
            title: resolution.title
          }))
        )
      };
    }

    if (subcommand === "get") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing resolution id.");
      const resolution = await sdk.resolutions.get(id, workspace);
      return {
        exitCode: 0,
        payload: { resolution },
        human: table([{ id: resolution.summary.id, status: resolution.summary.status, title: resolution.summary.title }])
      };
    }

    if (subcommand === "open") {
      const title = requireString(flags.title, "--title");
      const plans = splitCsv(requireString(flags.plans, "--plans"));
      const parties = splitCsv(requireString(flags.party, "--party"));
      const conflict = requireString(flags.conflict, "--conflict");
      const result = await sdk.resolutions.open({ title, plans, parties, conflict, workspace });
      return {
        exitCode: 0,
        payload: result,
        human: `Opened resolution-${result.resolution.summary.id}.md at ${result.commit.hash}.`
      };
    }

    if (subcommand === "respond") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing resolution id.");
      const party = requireString(flags.party, "--party");
      const position = requireString(flags.position, "--position");
      const result = await sdk.resolutions.respond({ id, party, position, workspace });
      return {
        exitCode: 0,
        payload: result,
        human: `Responded to resolution-${result.resolution.summary.id}.md at ${result.commit.hash}.`
      };
    }

    if (subcommand === "decide") {
      const id = positional[1];
      if (!id) throw new UsageError("Missing resolution id.");
      const decision = requireString(flags.decision, "--decision");
      const status = flags.status === undefined ? undefined : ResolutionStatusSchema.parse(requireString(flags.status, "--status"));
      const result = await sdk.resolutions.decide({ id, decision, status, workspace });
      return {
        exitCode: 0,
        payload: result,
        human: `Decided resolution-${result.resolution.summary.id}.md at ${result.commit.hash}.`
      };
    }

    throw new UsageError("Unknown resolutions command.");
  }

  throw new UsageError("Unknown command.");
}

const jsonMode = process.argv.includes("--json");

// Pull-only resolutions stall negotiations: surface open ones on every
// human-mode command so no thread can miss being summoned. (stderr only —
// JSON stdout stays a single object; agents get the guard on set-status.)
async function openResolutionsBanner(args: string[]): Promise<string | null> {
  if (args[0] === "resolutions" || args[0] === "init") return null;
  try {
    const { flags } = parseFlags(args.slice(1));
    const workspace = typeof flags.workspace === "string" ? flags.workspace : undefined;
    const open = (await createPlansmanSdk().resolutions.list(workspace)).filter(
      (resolution) => resolution.status === "open"
    );
    if (open.length === 0) return null;
    const lines = open.map(
      (resolution) => `  resolution-${resolution.id} [plans ${resolution.plans.join(", ")}] ${resolution.title}`
    );
    return `⚠ ${open.length} open resolution(s) — check before plan work (plansman resolutions get <n>):\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

try {
  const result = await run(process.argv.slice(2));
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result.payload ?? { ok: result.exitCode === 0 })}\n`);
  } else {
    if (result.human) process.stdout.write(`${result.human}\n`);
    const banner = await openResolutionsBanner(process.argv.slice(2));
    if (banner) process.stderr.write(`${banner}\n`);
  }
  process.exit(result.exitCode);
} catch (error) {
  const isUsage = error instanceof UsageError;
  const exitCode = isUsage ? 2 : 1;
  const message = error instanceof Error ? error.message : String(error);
  if (jsonMode) process.stdout.write(`${JSON.stringify({ error: { code: isUsage ? "USAGE" : "DOMAIN", message } })}\n`);
  process.stderr.write(`${message}\n${isUsage ? usage() : ""}${isUsage ? "\n" : ""}`);
  process.exit(exitCode);
}
