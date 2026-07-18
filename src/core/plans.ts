import {
  type PlanDetail,
  type PlanFrontMatter,
  PlanFrontMatterSchema,
  type PlanStatus,
  type PlanSummary
} from "../../surfaces/contracts/plansman.v1";
import { agentProtocolBlock, goalRestatementPlaceholder } from "./agent-protocol";
import { formatFrontMatter, parseFrontMatter, quoteYamlString } from "./front-matter";
import { renderPrdScaffold, validatePrd } from "./prd";

export const planPattern = /^plan-.*\.md$/;
export const numberedPlanPattern = /^plan-(\d+)([a-z])?\.md$/;
export const frontMatterOrder = [
  "plan_id",
  "sub_plan",
  "title",
  "completion",
  "status",
  "diagram_updated",
  "follow_up",
  "implementation_branch",
  "deferred_backlog",
  "touches",
  "follows",
  "repo",
  "source_idea",
  "plan_format"
];

export type PlanFile = {
  fileName: string;
  content: string;
};

export type PlanGoals = {
  objective: string;
  requirements: string;
  forbidden: string;
};

const goalInputPlaceholders = new Set([
  "one sentence. what must be true when this plan is complete?",
  "must ...",
  "do not satisfy this by ...",
  goalRestatementPlaceholder.toLowerCase()
]);

function requireConcreteGoal(value: string, field: keyof PlanGoals): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required when creating a plan.`);
  if (goalInputPlaceholders.has(normalized.toLowerCase())) {
    throw new Error(`${field} must state a concrete goal, not a template placeholder.`);
  }
  return normalized;
}

export function normalizePlanGoals(goals: PlanGoals): PlanGoals {
  return {
    objective: requireConcreteGoal(goals.objective, "objective"),
    requirements: requireConcreteGoal(goals.requirements, "requirements"),
    forbidden: requireConcreteGoal(goals.forbidden, "forbidden")
  };
}

function renderGoalBullets(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

export function sortPlanFiles(files: PlanFile[]): PlanFile[] {
  return [...files]
    .filter((file) => planPattern.test(file.fileName))
    .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { numeric: true }));
}

export function planLabel(frontMatter: PlanFrontMatter): string {
  return `${frontMatter.plan_id}${frontMatter.sub_plan ?? ""}`;
}

export function toPlanSummary(fileName: string, frontMatter: PlanFrontMatter): PlanSummary {
  return {
    id: frontMatter.plan_id,
    label: planLabel(frontMatter),
    fileName,
    title: frontMatter.title,
    completion: frontMatter.completion,
    status: frontMatter.status,
    diagramUpdated: frontMatter.diagram_updated,
    subPlan: frontMatter.sub_plan,
    followUp: frontMatter.follow_up,
    sourceIdea: frontMatter.source_idea
  };
}

export function parsePlanDetail(file: PlanFile): PlanDetail {
  const parsed = parseFrontMatter(file.content);
  if (!parsed.data) {
    throw new Error(`${file.fileName}: invalid front matter`);
  }
  const frontMatter = PlanFrontMatterSchema.parse(parsed.data);
  return {
    summary: toPlanSummary(file.fileName, frontMatter),
    frontMatter,
    body: parsed.body.replace(/^\n/, ""),
    raw: file.content
  };
}

export function getNextPlanId(fileNames: string[]): number {
  const existingIds = fileNames
    .map((fileName) => fileName.match(numberedPlanPattern))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]));

  return existingIds.length === 0 ? 1 : Math.max(...existingIds) + 1;
}

export function latestExistingPlanIdBefore(fileNames: string[], planId: number): number | null {
  const ids = fileNames
    .map((fileName) => fileName.match(/^plan-(\d+)\.md$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]))
    .filter((id) => id < planId);

  return ids.length > 0 ? Math.max(...ids) : null;
}

export type ClaimPlanTarget = {
  planId: number;
  subPlan?: string;
};

export function parseClaimPlanTarget(target: string | number | undefined, fileNames: string[]): ClaimPlanTarget {
  if (target === undefined || String(target).trim() === "") {
    return { planId: getNextPlanId(fileNames) };
  }

  const value = String(target).trim().replace(/^plan-/, "");
  const match = value.match(/^(\d+)([a-z])?$/);

  if (!match) {
    throw new Error(`Invalid plan target: ${target}. Use a plan id like 33 or a sub-plan id like 30b.`);
  }

  const parsed: ClaimPlanTarget = {
    planId: Number(match[1]),
    ...(match[2] ? { subPlan: match[2] } : {})
  };
  const fileName = `plan-${parsed.planId}${parsed.subPlan ?? ""}.md`;

  if (fileNames.includes(fileName)) throw new Error(`${fileName} already exists.`);
  const seriesPattern = new RegExp(`^plan-${parsed.planId}[a-z]?\\.md$`);
  if (parsed.subPlan && !fileNames.some((name) => seriesPattern.test(name))) {
    throw new Error(
      `Cannot create ${fileName}: no plan-${parsed.planId}.md or plan-${parsed.planId}<letter>.md exists.`,
    );
  }

  return parsed;
}

export function claimPlanFileName(target: ClaimPlanTarget): string {
  return `plan-${target.planId}${target.subPlan ?? ""}.md`;
}

export function renderClaimedPlan(
  target: ClaimPlanTarget,
  title: string,
  fileNames: string[],
  goals?: PlanGoals,
  sourceIdea?: string,
  prd?: string
): string {
  const normalizedGoals = goals ? normalizePlanGoals(goals) : null;
  if (normalizedGoals && !prd) throw new Error("PRD content is required when creating a plan.");
  if (!normalizedGoals && prd) throw new Error("PRD content requires explicit plan goals.");
  const productRequirements = prd ? validatePrd(prd) : renderPrdScaffold();
  const planLabel = `${target.planId}${target.subPlan ?? ""}`;
  const escapedTitle = quoteYamlString(title || `Plan ${planLabel}`);
  const subPlanLine = target.subPlan ? `sub_plan: '${target.subPlan}'\n` : "";
  const followUpPlanId = target.subPlan
    ? null
    : latestExistingPlanIdBefore(fileNames, target.planId) ?? (target.planId > 1 ? target.planId - 1 : null);
  const followUpLine = followUpPlanId === null ? "" : `follow_up: ${followUpPlanId}\n`;
  const sourceIdeaLine = sourceIdea ? `source_idea: '${sourceIdea}'\n` : "";
  const relationshipLine = target.subPlan
    ? fileNames.includes(`plan-${target.planId}.md`)
      ? `This is a sub-plan for ./plan-${target.planId}.md`
      : `This is a sub-plan in the plan-${target.planId} series.`
    : followUpPlanId === null
      ? "This is the root plan for this workspace."
      : `This is a follow up plan for ./plan-${followUpPlanId}.md`;

  return `---
plan_id: ${target.planId}
${subPlanLine}title: ${escapedTitle}
completion: 0
status: 'not started'
diagram_updated: false
${followUpLine}${sourceIdeaLine}plan_format: 'prd-v1'
---

# Plan ${planLabel}: ${title || `Plan ${planLabel}`}

Read [AGENTS.md](./AGENTS.md) before working on this plan.

${agentProtocolBlock}

${relationshipLine}

${sourceIdea ? `Source product requirements: [${sourceIdea}](../backlog/backlog-${sourceIdea.replace(/^B-/, "")}.md).` : ""}

${productRequirements}

On completion with this plan, we need to update the architecture diagrams for this plan in ./architecture-timeline.md

From Plan 11 onward, use the layered \`flowchart LR\` architecture snapshot format from ./AGENTS.md.

## Main Objective

${normalizedGoals?.objective ?? "One sentence. What must be true when this plan is complete?"}

## Goal Restatement

${normalizedGoals
  ? `**Objective:** ${normalizedGoals.objective}\n\n**Non-negotiable requirements:** ${normalizedGoals.requirements}\n\n**Forbidden substitutes:** ${normalizedGoals.forbidden}`
  : goalRestatementPlaceholder}

## Canonical Ownership Discovery

| Behavior | Canonical owner | Existing API/path | Missing API? | Local substitute needed? |
| --- | --- | --- | --- | --- |
|  |  |  | yes/no | yes/no |

## Developer-Facing Code Examples

When this plan changes APIs, workflow definitions, configuration, commands,
integration boundaries, or other developer-facing behavior, replace the
placeholder with the smallest concrete current-state and intended-usage
examples that make the design easy to understand. Include multiple snippets
only when they clarify distinct boundaries. Mark proposed syntax as
illustrative until the public contract is approved.

If no meaningful code, command, configuration, or workflow-document example
applies, state why instead of inventing an API merely to fill this section.

\`\`\`ts
// Replace with a concise example when applicable.
\`\`\`

## Surface And Mode Contract

- Required run command:
- Required shell template/profile or runtime mode:
- Required traditional product UI surfaces:
- Required agentic/chat shell surfaces:
- Explicitly non-primary fixtures/adapters:

## Non-Negotiable Requirements

${normalizedGoals ? renderGoalBullets(normalizedGoals.requirements) : "- MUST ..."}

## Forbidden Substitute Solutions

${normalizedGoals ? renderGoalBullets(normalizedGoals.forbidden) : "- Do not satisfy this by ..."}

## Runtime And User-Surface Proofs

- Required live/runtime proof:

## Visual And Asset Proofs

- Required screenshot proof:

## Browser E2E Acceptance

- Browser E2E for traditional product UI:

## Proof Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
|  | NOT CHECKED |  |

## Implementation Plan

## Verification

## Completion Review
`;
}

export function updatePlanStatus(content: string, status: PlanStatus, completion?: number): string {
  const parsed = parseFrontMatter(content);
  if (!parsed.data) throw new Error("invalid front matter");

  const nextData = {
    ...parsed.data,
    status,
    ...(completion === undefined ? {} : { completion })
  };

  const nextFrontMatter = formatFrontMatter(nextData, frontMatterOrder);
  return `---\n${nextFrontMatter}\n---\n${parsed.body}`;
}

export function completePlanContent(content: string, backlogLabels: string[]): string {
  const parsed = parseFrontMatter(content);
  if (!parsed.data) throw new Error("invalid front matter");
  const existing = Array.isArray(parsed.data.deferred_backlog)
    ? parsed.data.deferred_backlog.map(String)
    : [];
  const nextData = {
    ...parsed.data,
    status: "done",
    completion: 100,
    ...(backlogLabels.length > 0
      ? { deferred_backlog: [...new Set([...existing, ...backlogLabels])] }
      : {})
  };
  return `---\n${formatFrontMatter(nextData, frontMatterOrder)}\n---\n${parsed.body}`;
}

export function completionProofBlockers(content: string): string[] {
  const heading = "## Proof Matrix";
  const start = content.indexOf(heading);
  if (start === -1) return [];
  const after = content.slice(start + heading.length);
  const nextHeading = after.search(/\n## /);
  const section = nextHeading === -1 ? after : after.slice(0, nextHeading);
  const blocking = new Set(["FAIL", "NOT CHECKED", "TODO", "PENDING", "BLOCKED"]);
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter(([requirement, status]) =>
      Boolean(requirement) &&
      requirement !== "Requirement" &&
      !/^[-: ]+$/.test(requirement) &&
      blocking.has(String(status).toUpperCase())
    )
    .map(([requirement, status]) => `${requirement}: ${status}`);
}
