import { type LintFinding, type LintReport } from "../../surfaces/contracts/plansman.v1";
import {
  agentProtocolBlock,
  agentProtocolStartPlanId,
  getMarkdownSection,
  goalRestatementHeading,
  goalRestatementNeedsFilling
} from "./agent-protocol";
import { parseFrontMatter } from "./front-matter";
import { numberedPlanPattern, planPattern, sortPlanFiles, type PlanFile } from "./plans";
import { validatePrd } from "./prd";

const instructionLink = "./AGENTS.md";
const layeredTimelineStartPlanId = 11;
const antiDriftStartPlanId = 27;
const layeredTimelineColumns = [
  "Surface column",
  "Control-plane column",
  "Runtime data-plane column",
  "Thread system column",
  "Storage provider column",
  "Agent Runtime Adapter column",
  "SandboxRuntimeProvider column",
  "Model Provider Adapter column",
  "Capability / tool adapter column",
  "Platform workflow-host column"
];
const antiDriftRequiredSections = [
  "## Main Objective",
  "## Canonical Ownership Discovery",
  "## Surface And Mode Contract",
  "## Non-Negotiable Requirements",
  "## Forbidden Substitute Solutions",
  "## Runtime And User-Surface Proofs",
  "## Visual And Asset Proofs",
  "## Browser E2E Acceptance",
  "## Proof Matrix",
  "## Implementation Plan",
  "## Verification",
  "## Completion Review"
];
const blockingProofStatuses = new Set(["FAIL", "NOT CHECKED"]);

const requiredFields = ["plan_id", "title", "completion", "status", "diagram_updated"];
const properties: Record<string, { type: string; enum?: string[]; minimum?: number; maximum?: number; pattern?: string }> = {
  plan_id: { type: "number" },
  sub_plan: { type: "string", pattern: "^[a-z]$" },
  title: { type: "string" },
  completion: { type: "number", minimum: 0, maximum: 100 },
  status: { type: "string", enum: ["done", "running", "not started"] },
  diagram_updated: { type: "boolean" },
  follow_up: { type: "number", minimum: 1 },
  implementation_branch: { type: "string" },
  deferred_backlog: { type: "object" },
  touches: { type: "object" },
  follows: { type: "object" },
  repo: { type: "string" },
  source_idea: { type: "string", pattern: "^B-\\d+$" },
  plan_format: { type: "string", enum: ["prd-v1"] }
};

type ParsedPlan = {
  fileName: string;
  data: Record<string, unknown>;
};

function finding(fileName: string, message: string): LintFinding {
  return { fileName, message };
}

function validateType(value: unknown, type: string): boolean {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  if (type === "object") return typeof value === "object" && value !== null;
  return true;
}

function validatePlan(fileName: string, data: Record<string, unknown>, sourceIdeaLabels?: Set<string>): LintFinding[] {
  const findings: LintFinding[] = [];

  requiredFields.forEach((field) => {
    if (!Object.hasOwn(data, field)) findings.push(finding(fileName, `missing required field \`${field}\``));
  });

  Object.keys(data).forEach((field) => {
    if (!Object.hasOwn(properties, field)) findings.push(finding(fileName, `unknown field \`${field}\``));
  });

  Object.entries(properties).forEach(([field, rule]) => {
    if (!Object.hasOwn(data, field)) return;

    const value = data[field];

    if (!validateType(value, rule.type)) {
      findings.push(finding(fileName, `\`${field}\` must be ${rule.type}`));
      return;
    }

    if (Array.isArray(rule.enum) && !rule.enum.includes(String(value))) {
      findings.push(finding(fileName, `\`${field}\` must be one of: ${rule.enum.join(", ")}`));
    }

    if (typeof rule.minimum === "number" && typeof value === "number" && value < rule.minimum) {
      findings.push(finding(fileName, `\`${field}\` must be >= ${rule.minimum}`));
    }

    if (typeof rule.maximum === "number" && typeof value === "number" && value > rule.maximum) {
      findings.push(finding(fileName, `\`${field}\` must be <= ${rule.maximum}`));
    }

    if (typeof rule.pattern === "string" && typeof value === "string" && !new RegExp(rule.pattern).test(value)) {
      findings.push(finding(fileName, `\`${field}\` must match pattern ${rule.pattern}`));
    }
  });

  if (typeof data.follow_up === "number") {
    const followUpFileName = `plan-${data.follow_up}.md`;
    if (!currentPlanFileNames.has(followUpFileName)) {
      findings.push(finding(fileName, `\`follow_up\` references missing ./plan-${data.follow_up}.md`));
    }
  }

  if (typeof data.source_idea === "string" && sourceIdeaLabels && !sourceIdeaLabels.has(data.source_idea)) {
    findings.push(finding(fileName, `\`source_idea\` references missing ${data.source_idea}`));
  }

  return findings;
}

let currentPlanFileNames = new Set<string>();

function validatePlanFileName(fileName: string, data: Record<string, unknown>): LintFinding[] {
  const match = fileName.match(numberedPlanPattern);
  if (!match) return [];

  const findings: LintFinding[] = [];
  const filePlanId = Number(match[1]);
  const fileSubPlan = match[2];

  if (data.plan_id !== filePlanId) findings.push(finding(fileName, `\`plan_id\` must be ${filePlanId} to match the file name`));
  if (fileSubPlan !== undefined && data.sub_plan !== fileSubPlan) findings.push(finding(fileName, `\`sub_plan\` must be '${fileSubPlan}' to match the file name`));
  if (fileSubPlan === undefined && Object.hasOwn(data, "sub_plan")) findings.push(finding(fileName, "`sub_plan` is only allowed for plan-<id><letter>.md files"));

  return findings;
}

function validatePlanContent(fileName: string, content: string): LintFinding[] {
  return content.includes(instructionLink) ? [] : [finding(fileName, `must link back to ${instructionLink}`)];
}

function validatePrdPlanContent(fileName: string, data: Record<string, unknown>, content: string): LintFinding[] {
  if (data.plan_format !== "prd-v1") return [];
  try {
    validatePrd(content);
    return [];
  } catch (error) {
    return [finding(fileName, error instanceof Error ? error.message : String(error))];
  }
}

function validateAntiDriftPlanContent(fileName: string, data: Record<string, unknown>, content: string): LintFinding[] {
  if (!Number.isInteger(data.plan_id) || Number(data.plan_id) < antiDriftStartPlanId) return [];

  return antiDriftRequiredSections
    .filter((section) => !content.includes(section))
    .map((section) => finding(fileName, `missing anti-drift section \`${section}\``));
}

function validateAgentProtocolContent(fileName: string, data: Record<string, unknown>, content: string): LintFinding[] {
  if (!Number.isInteger(data.plan_id) || Number(data.plan_id) < agentProtocolStartPlanId) return [];

  const findings: LintFinding[] = [];
  const lines = content.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trimEnd() === "> [!AGENT]");

  if (markerIndex === -1) {
    findings.push(finding(fileName, "missing agent protocol block `> [!AGENT]`"));
  } else if (data.status === "not started" || data.status === "running") {
    const block: string[] = [];
    for (let index = markerIndex; index < lines.length && lines[index].startsWith(">"); index += 1) {
      block.push(lines[index].trimEnd());
    }
    if (block.join("\n") !== agentProtocolBlock) {
      findings.push(finding(fileName, "agent protocol block must exactly match the canonical text while status is 'not started' or 'running'"));
    }
  }

  if (!content.includes(goalRestatementHeading)) {
    findings.push(finding(fileName, "missing `## Goal Restatement` section"));
  } else if ((data.status === "running" || data.status === "done") && goalRestatementNeedsFilling(content)) {
    findings.push(finding(fileName, "`## Goal Restatement` must be filled in (placeholder removed, non-empty) once status is 'running' or 'done'"));
  }

  return findings;
}

function parseProofMatrixRows(section: string): string[][] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3)
    .filter((cells) => {
      const [requirement, status] = cells;
      return requirement !== "Requirement" && !/^[-: ]+$/.test(requirement) && !/^[-: ]+$/.test(status);
    });
}

function validateCompletionProofMatrix(fileName: string, data: Record<string, unknown>, content: string): LintFinding[] {
  if (!Number.isInteger(data.plan_id) || Number(data.plan_id) < antiDriftStartPlanId) return [];
  const isComplete = data.status === "done" || data.completion === 100;
  if (!isComplete) return [];

  const proofMatrix = getMarkdownSection(content, "## Proof Matrix");
  if (!proofMatrix) return [finding(fileName, "completed anti-drift plan must include ## Proof Matrix")];

  const rows = parseProofMatrixRows(proofMatrix);
  const findings: LintFinding[] = [];

  if (rows.length === 0) findings.push(finding(fileName, "completed anti-drift plan proof matrix must include at least one evidence row"));

  rows.forEach((cells) => {
    const [requirement, status] = cells;
    if (blockingProofStatuses.has(status.toUpperCase())) {
      findings.push(finding(fileName, `completed anti-drift plan has blocking proof status \`${status}\` for \`${requirement}\``));
    }
  });

  return findings;
}

function getTimelineSection(content: string, planId: number): string | null {
  const sectionHeader = new RegExp(`^## Plan ${planId}$`, "m");
  const headerMatch = content.match(sectionHeader);
  if (!headerMatch || headerMatch.index === undefined) return null;

  const sectionStart = headerMatch.index;
  const rest = content.slice(sectionStart + headerMatch[0].length);
  const nextPlanMatch = rest.match(/\n## Plan \d+\n/);
  const sectionEnd = nextPlanMatch?.index === undefined ? content.length : sectionStart + headerMatch[0].length + nextPlanMatch.index;

  return content.slice(sectionStart, sectionEnd);
}

function getFirstTimelinePlanId(content: string): number | null {
  const match = content.match(/^## Plan (\d+)$/m);
  return match ? Number(match[1]) : null;
}

function getArchitectureDiagram(section: string, planId: number): string | null {
  const heading = `## Plan ${planId} Architecture Diagram`;
  const headingIndex = section.indexOf(heading);
  if (headingIndex === -1) return null;

  const diagramMatch = section.slice(headingIndex + heading.length).match(/```mermaid\n([\s\S]*?)\n```/);
  return diagramMatch ? diagramMatch[1] : null;
}

function validateTimelinePlan(fileName: string, data: Record<string, unknown>, architectureTimeline: string | null): LintFinding[] {
  if (data.status !== "done" || data.diagram_updated !== true) return [];
  if (architectureTimeline === null) return [finding("architecture-timeline.md", "missing timeline file")];

  const planId = Number(data.plan_id);
  const section = getTimelineSection(architectureTimeline, planId);
  const findings: LintFinding[] = [];

  if (!section) return [finding("architecture-timeline.md", `missing ## Plan ${planId} section for completed diagram_updated plan`)];

  if (!section.includes(`Changes from Plan ${data.follow_up ?? planId - 1}:`)) {
    findings.push(finding("architecture-timeline.md", `Plan ${planId} section must include changes from previous plan before the diagram`));
  }

  const diagram = getArchitectureDiagram(section, planId);

  if (!diagram) {
    findings.push(finding("architecture-timeline.md", `Plan ${planId} section must include a Mermaid architecture diagram`));
  } else if (Number.isInteger(planId) && planId >= layeredTimelineStartPlanId) {
    if (!diagram.startsWith("flowchart LR")) {
      findings.push(finding("architecture-timeline.md", `Plan ${planId} architecture diagram must use flowchart LR layered snapshot format`));
    }

    layeredTimelineColumns.forEach((column) => {
      if (!diagram.includes(column)) findings.push(finding("architecture-timeline.md", `Plan ${planId} architecture diagram missing ${column}`));
    });
  }

  return findings;
}

function validateTimelineOrdering(parsedPlans: ParsedPlan[], architectureTimeline: string | null): LintFinding[] {
  if (architectureTimeline === null) return [finding("architecture-timeline.md", "missing timeline file")];

  const latestPlanId = parsedPlans
    .map((plan) => plan.data)
    .filter((data) => Number.isInteger(data.plan_id))
    .filter((data) => data.status === "done" && data.diagram_updated === true)
    .map((data) => Number(data.plan_id))
    .sort((left, right) => right - left)[0];

  if (!latestPlanId) return [];

  const firstTimelinePlanId = getFirstTimelinePlanId(architectureTimeline);
  if (firstTimelinePlanId === latestPlanId) return [];

  return [finding("architecture-timeline.md", `latest completed diagram plan must be topmost section: expected Plan ${latestPlanId}, found Plan ${firstTimelinePlanId ?? "none"}`)];
}

export function lintPlanCorpus(input: {
  planFiles: PlanFile[];
  architectureTimeline: string | null;
  sourceIdeaLabels?: string[];
}): LintReport {
  const planFiles = sortPlanFiles(input.planFiles);
  const findings: LintFinding[] = [];
  const parsedPlans: ParsedPlan[] = [];

  currentPlanFileNames = new Set(planFiles.map((file) => file.fileName));

  planFiles.forEach((file) => {
    const parsed = parseFrontMatter(file.content);

    if (parsed.errors.length > 0) {
      findings.push(...parsed.errors.map((error) => finding(file.fileName, error)));
      return;
    }

    if (!parsed.data) return;

    findings.push(...validatePlan(file.fileName, parsed.data, input.sourceIdeaLabels ? new Set(input.sourceIdeaLabels) : undefined));
    findings.push(...validatePlanFileName(file.fileName, parsed.data));
    findings.push(...validatePlanContent(file.fileName, file.content));
    findings.push(...validatePrdPlanContent(file.fileName, parsed.data, file.content));
    findings.push(...validateAntiDriftPlanContent(file.fileName, parsed.data, file.content));
    findings.push(...validateAgentProtocolContent(file.fileName, parsed.data, file.content));
    findings.push(...validateCompletionProofMatrix(file.fileName, parsed.data, file.content));
    findings.push(...validateTimelinePlan(file.fileName, parsed.data, input.architectureTimeline));
    parsedPlans.push({ fileName: file.fileName, data: parsed.data });
  });

  findings.push(...validateTimelineOrdering(parsedPlans, input.architectureTimeline));

  const byFile = findings.reduce<Record<string, LintFinding[]>>((accumulator, item) => {
    accumulator[item.fileName] ??= [];
    accumulator[item.fileName].push(item);
    return accumulator;
  }, {});

  return {
    ok: findings.length === 0,
    planCount: planFiles.filter((file) => planPattern.test(file.fileName)).length,
    findings,
    byFile
  };
}
