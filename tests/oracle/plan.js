#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeDraft,
  checkpointDraft,
  createDraft,
  listDrafts,
} from "./drafts.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(ROOT, "schema.json");
const ARCHITECTURE_TIMELINE_PATH = path.join(ROOT, "architecture-timeline.md");
const PLAN_PATTERN = /^plan-.*\.md$/;
const NUMBERED_PLAN_PATTERN = /^plan-(\d+)([a-z])?\.md$/;
const INSTRUCTION_LINK = "./AGENTS.md";
const COMMANDS = new Set(["lint", "new", "draft", "drafts", "active", "checkpoint"]);
const LAYERED_TIMELINE_START_PLAN_ID = 11;
const ANTI_DRIFT_START_PLAN_ID = 27;
const LAYERED_TIMELINE_COLUMNS = [
  "Surface column",
  "Control-plane column",
  "Runtime data-plane column",
  "Thread system column",
  "Storage provider column",
  "Agent Runtime Adapter column",
  "SandboxRuntimeProvider column",
  "Model Provider Adapter column",
  "Capability / tool adapter column",
  "Platform workflow-host column",
];
const ANTI_DRIFT_REQUIRED_SECTIONS = [
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
  "## Completion Review",
];
const BLOCKING_PROOF_STATUSES = new Set(["FAIL", "NOT CHECKED"]);
const AGENT_PROTOCOL_START_PLAN_ID = 34;
const AGENT_PROTOCOL_BLOCK_LINES = [
  "> [!AGENT]",
  "> Before any implementation work: restate the Main Objective, Non-Negotiable",
  "> Requirements, and Forbidden Substitute Solutions in your own words in the",
  "> `## Goal Restatement` section below. Then run `node plan.js lint` and fix all",
  "> findings before proceeding. Re-run lint after every plan edit.",
];
const AGENT_PROTOCOL_BLOCK = AGENT_PROTOCOL_BLOCK_LINES.join("\n");
const GOAL_RESTATEMENT_HEADING = "## Goal Restatement";
const GOAL_RESTATEMENT_PLACEHOLDER =
  "_Not restated yet — the executing agent must rewrite the objective, non-negotiable requirements, and forbidden substitutes in its own words before implementation._";

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const requiredFields = schema.required ?? [];
const properties = schema.properties ?? {};

function parseScalar(rawValue) {
  const value = rawValue.trim();

  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);

  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) return quoted[2].replaceAll(`${quoted[1]}${quoted[1]}`, quoted[1]);

  return value;
}

function parseFrontMatter(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  if (lines[0] !== "---") {
    return {
      data: null,
      errors: ["missing opening front matter delimiter `---` on line 1"],
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closingIndex === -1) {
    return {
      data: null,
      errors: ["missing closing front matter delimiter `---`"],
    };
  }

  const data = {};
  const errors = [];

  lines.slice(1, closingIndex).forEach((line, index) => {
    const lineNumber = index + 2;
    const trimmed = line.trim();

    if (trimmed === "") return;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);

    if (!match) {
      errors.push(`line ${lineNumber}: expected \`key: value\``);
      return;
    }

    const [, key, value] = match;
    data[key] = parseScalar(value);
  });

  return { data, errors };
}

function validateType(value, type) {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";

  return true;
}

function validatePlan(fileName, data) {
  const errors = [];

  requiredFields.forEach((field) => {
    if (!Object.hasOwn(data, field)) {
      errors.push(`missing required field \`${field}\``);
    }
  });

  Object.keys(data).forEach((field) => {
    if (!Object.hasOwn(properties, field)) {
      errors.push(`unknown field \`${field}\``);
    }
  });

  Object.entries(properties).forEach(([field, rule]) => {
    if (!Object.hasOwn(data, field)) return;

    const value = data[field];

    if (!validateType(value, rule.type)) {
      errors.push(`\`${field}\` must be ${rule.type}`);
      return;
    }

    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
      errors.push(`\`${field}\` must be one of: ${rule.enum.join(", ")}`);
    }

    if (typeof rule.minimum === "number" && value < rule.minimum) {
      errors.push(`\`${field}\` must be >= ${rule.minimum}`);
    }

    if (typeof rule.maximum === "number" && value > rule.maximum) {
      errors.push(`\`${field}\` must be <= ${rule.maximum}`);
    }

    if (
      typeof rule.pattern === "string" &&
      typeof value === "string" &&
      !new RegExp(rule.pattern).test(value)
    ) {
      errors.push(`\`${field}\` must match pattern ${rule.pattern}`);
    }
  });

  if (typeof data.follow_up === "number") {
    const followUpPath = path.join(ROOT, `plan-${data.follow_up}.md`);

    if (!fs.existsSync(followUpPath)) {
      errors.push(`\`follow_up\` references missing ./plan-${data.follow_up}.md`);
    }
  }

  if (errors.length > 0) {
    return [`${fileName}:`, ...errors.map((error) => `  - ${error}`)];
  }

  return [];
}

function validatePlanFileName(fileName, data) {
  const match = fileName.match(NUMBERED_PLAN_PATTERN);
  if (!match) return [];

  const errors = [];
  const filePlanId = Number(match[1]);
  const fileSubPlan = match[2];

  if (data.plan_id !== filePlanId) {
    errors.push(`  - \`plan_id\` must be ${filePlanId} to match the file name`);
  }

  if (fileSubPlan !== undefined && data.sub_plan !== fileSubPlan) {
    errors.push(`  - \`sub_plan\` must be '${fileSubPlan}' to match the file name`);
  }

  if (fileSubPlan === undefined && Object.hasOwn(data, "sub_plan")) {
    errors.push("  - `sub_plan` is only allowed for plan-<id><letter>.md files");
  }

  if (errors.length === 0) return [];

  return [`${fileName}:`, ...errors];
}

function validatePlanContent(fileName, content) {
  if (content.includes(INSTRUCTION_LINK)) return [];

  return [`${fileName}:`, `  - must link back to ${INSTRUCTION_LINK}`];
}

function validateAntiDriftPlanContent(fileName, data, content) {
  if (!Number.isInteger(data.plan_id) || data.plan_id < ANTI_DRIFT_START_PLAN_ID) {
    return [];
  }

  const errors = [];

  ANTI_DRIFT_REQUIRED_SECTIONS.forEach((section) => {
    if (!content.includes(section)) {
      errors.push(`  - missing anti-drift section \`${section}\``);
    }
  });

  if (errors.length === 0) return [];

  return [`${fileName}:`, ...errors];
}

function validateAgentProtocolContent(fileName, data, content) {
  if (!Number.isInteger(data.plan_id) || data.plan_id < AGENT_PROTOCOL_START_PLAN_ID) {
    return [];
  }

  const errors = [];
  const lines = content.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trimEnd() === "> [!AGENT]");

  if (markerIndex === -1) {
    errors.push("  - missing agent protocol block `> [!AGENT]`");
  } else if (data.status === "not started" || data.status === "running") {
    const block = [];
    for (let index = markerIndex; index < lines.length && lines[index].startsWith(">"); index += 1) {
      block.push(lines[index].trimEnd());
    }
    if (block.join("\n") !== AGENT_PROTOCOL_BLOCK) {
      errors.push("  - agent protocol block must exactly match the canonical text while status is 'not started' or 'running'");
    }
  }

  if (!content.includes(GOAL_RESTATEMENT_HEADING)) {
    errors.push("  - missing `## Goal Restatement` section");
  } else if (data.status === "running" || data.status === "done") {
    const section = getMarkdownSection(content, GOAL_RESTATEMENT_HEADING);
    if (section === null || section.trim() === "" || section.includes(GOAL_RESTATEMENT_PLACEHOLDER)) {
      errors.push("  - `## Goal Restatement` must be filled in (placeholder removed, non-empty) once status is 'running' or 'done'");
    }
  }

  if (errors.length === 0) return [];

  return [`${fileName}:`, ...errors];
}

function getMarkdownSection(content, heading) {
  const headingIndex = content.indexOf(`${heading}\n`);

  if (headingIndex === -1) return null;

  const sectionStart = headingIndex + heading.length + 1;
  const rest = content.slice(sectionStart);
  const nextHeadingMatch = rest.match(/\n## /);
  const sectionEnd =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? sectionStart + nextHeadingMatch.index
      : content.length;

  return content.slice(sectionStart, sectionEnd);
}

function parseProofMatrixRows(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length >= 3)
    .filter((cells) => {
      const [requirement, status] = cells;
      return requirement !== "Requirement" && !/^[-: ]+$/.test(requirement) && !/^[-: ]+$/.test(status);
    });
}

function validateCompletionProofMatrix(fileName, data, content) {
  if (!Number.isInteger(data.plan_id) || data.plan_id < ANTI_DRIFT_START_PLAN_ID) {
    return [];
  }

  const isComplete = data.status === "done" || data.completion === 100;

  if (!isComplete) return [];

  const proofMatrix = getMarkdownSection(content, "## Proof Matrix");

  if (!proofMatrix) {
    return [`${fileName}:`, "  - completed anti-drift plan must include ## Proof Matrix"];
  }

  const rows = parseProofMatrixRows(proofMatrix);
  const errors = [];

  if (rows.length === 0) {
    errors.push("  - completed anti-drift plan proof matrix must include at least one evidence row");
  }

  rows.forEach((cells) => {
    const [requirement, status] = cells;
    const normalizedStatus = status.toUpperCase();

    if (BLOCKING_PROOF_STATUSES.has(normalizedStatus)) {
      errors.push(
        `  - completed anti-drift plan has blocking proof status \`${status}\` for \`${requirement}\``,
      );
    }
  });

  if (errors.length === 0) return [];

  return [`${fileName}:`, ...errors];
}

function getTimelineSection(content, planId) {
  const sectionHeader = new RegExp(`^## Plan ${planId}$`, "m");
  const headerMatch = content.match(sectionHeader);

  if (!headerMatch || headerMatch.index === undefined) return null;

  const sectionStart = headerMatch.index;
  const rest = content.slice(sectionStart + headerMatch[0].length);
  const nextPlanMatch = rest.match(/\n## Plan \d+\n/);
  const sectionEnd =
    nextPlanMatch && nextPlanMatch.index !== undefined
      ? sectionStart + headerMatch[0].length + nextPlanMatch.index
      : content.length;

  return content.slice(sectionStart, sectionEnd);
}

function getFirstTimelinePlanId(content) {
  const match = content.match(/^## Plan (\d+)$/m);
  if (!match) return null;

  return Number(match[1]);
}

function getArchitectureDiagram(section, planId) {
  const heading = `## Plan ${planId} Architecture Diagram`;
  const headingIndex = section.indexOf(heading);

  if (headingIndex === -1) return null;

  const afterHeading = section.slice(headingIndex + heading.length);
  const diagramMatch = afterHeading.match(/```mermaid\n([\s\S]*?)\n```/);

  return diagramMatch ? diagramMatch[1] : null;
}

function validateTimelinePlan(data) {
  if (data.status !== "done" || data.diagram_updated !== true) return [];

  if (!fs.existsSync(ARCHITECTURE_TIMELINE_PATH)) {
    return ["architecture-timeline.md:", "  - missing timeline file"];
  }

  const planId = data.plan_id;
  const timeline = fs.readFileSync(ARCHITECTURE_TIMELINE_PATH, "utf8");
  const section = getTimelineSection(timeline, planId);
  const errors = [];

  if (!section) {
    return [
      "architecture-timeline.md:",
      `  - missing ## Plan ${planId} section for completed diagram_updated plan`,
    ];
  }

  if (!section.includes(`Changes from Plan ${data.follow_up ?? planId - 1}:`)) {
    errors.push(
      `  - Plan ${planId} section must include changes from previous plan before the diagram`,
    );
  }

  const diagram = getArchitectureDiagram(section, planId);

  if (!diagram) {
    errors.push(`  - Plan ${planId} section must include a Mermaid architecture diagram`);
  } else if (
    Number.isInteger(planId) &&
    planId >= LAYERED_TIMELINE_START_PLAN_ID
  ) {
    if (!diagram.startsWith("flowchart LR")) {
      errors.push(
        `  - Plan ${planId} architecture diagram must use flowchart LR layered snapshot format`,
      );
    }

    LAYERED_TIMELINE_COLUMNS.forEach((column) => {
      if (!diagram.includes(column)) {
        errors.push(`  - Plan ${planId} architecture diagram missing ${column}`);
      }
    });
  }

  if (errors.length === 0) return [];

  return ["architecture-timeline.md:", ...errors];
}

function validateTimelineOrdering(parsedPlans) {
  if (!fs.existsSync(ARCHITECTURE_TIMELINE_PATH)) {
    return ["architecture-timeline.md:", "  - missing timeline file"];
  }

  const latestPlanId = parsedPlans
    .map((plan) => plan.data)
    .filter((data) => Number.isInteger(data.plan_id))
    .filter((data) => data.status === "done" && data.diagram_updated === true)
    .map((data) => data.plan_id)
    .sort((left, right) => right - left)[0];

  if (!latestPlanId) return [];

  const timeline = fs.readFileSync(ARCHITECTURE_TIMELINE_PATH, "utf8");
  const firstTimelinePlanId = getFirstTimelinePlanId(timeline);

  if (firstTimelinePlanId === latestPlanId) return [];

  return [
    "architecture-timeline.md:",
    `  - latest completed diagram plan must be topmost section: expected Plan ${latestPlanId}, found Plan ${firstTimelinePlanId ?? "none"}`,
  ];
}

function getPlanFiles() {
  return fs
    .readdirSync(ROOT)
    .filter((fileName) => PLAN_PATTERN.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function lintPlans() {
  const planFiles = getPlanFiles();
  const failures = [];
  const parsedPlans = [];

  planFiles.forEach((fileName) => {
    const filePath = path.join(ROOT, fileName);
    const parsed = parseFrontMatter(filePath);

    if (parsed.errors.length > 0) {
      failures.push(`${fileName}:`, ...parsed.errors.map((error) => `  - ${error}`));
      return;
    }

    failures.push(...validatePlan(fileName, parsed.data));
    failures.push(...validatePlanFileName(fileName, parsed.data));
    const content = fs.readFileSync(filePath, "utf8");
    failures.push(...validatePlanContent(fileName, content));
    failures.push(...validateAntiDriftPlanContent(fileName, parsed.data, content));
    failures.push(...validateAgentProtocolContent(fileName, parsed.data, content));
    failures.push(...validateCompletionProofMatrix(fileName, parsed.data, content));
    failures.push(...validateTimelinePlan(parsed.data));
    parsedPlans.push({ fileName, data: parsed.data });
  });

  failures.push(...validateTimelineOrdering(parsedPlans));

  if (failures.length > 0) {
    console.error(`Plan lint failed for ${planFiles.length} plan file(s):`);
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(`Plan lint passed for ${planFiles.length} plan file(s).`);
}

function getNextPlanId() {
  const existingIds = fs
    .readdirSync(ROOT)
    .map((fileName) => fileName.match(NUMBERED_PLAN_PATTERN))
    .filter(Boolean)
    .map((match) => Number(match[1]));

  if (existingIds.length === 0) return 1;

  return Math.max(...existingIds) + 1;
}

function parsePlanTarget(target) {
  if (target === undefined) return null;

  const match = String(target).match(/^(\d+)([a-z])$/);

  if (!match) {
    console.error(`Invalid plan target \`${target}\`. Use a sub-plan id like 30a.`);
    process.exit(1);
  }

  return { planId: Number(match[1]), subPlan: match[2] };
}

function latestExistingPlanIdBefore(planId) {
  const ids = fs
    .readdirSync(ROOT)
    .map((fileName) => fileName.match(/^plan-(\d+)\.md$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter((id) => id < planId);

  return ids.length > 0 ? Math.max(...ids) : null;
}

function createPlan(target) {
  const parsedTarget = parsePlanTarget(target);
  const planId = parsedTarget ? parsedTarget.planId : getNextPlanId();
  const subPlan = parsedTarget ? parsedTarget.subPlan : undefined;
  const followUpPlanId = subPlan
    ? (latestExistingPlanIdBefore(planId) ?? planId - 1)
    : planId - 1;
  const planLabel = `${planId}${subPlan ?? ""}`;
  const fileName = `plan-${planLabel}.md`;
  const filePath = path.join(ROOT, fileName);

  if (fs.existsSync(filePath)) {
    console.error(`${fileName} already exists.`);
    process.exit(1);
  }

  const subPlanLine = subPlan ? `\n   sub_plan: '${subPlan}'` : "";
  const content = `---
   plan_id: ${planId}${subPlanLine}
   title: 'Plan ${planLabel}'
   completion: 0
   status: 'not started'
   diagram_updated: false
follow_up: ${followUpPlanId}
---

# Plan ${planLabel}

Read [AGENTS.md](${INSTRUCTION_LINK}) before working on this plan.

${AGENT_PROTOCOL_BLOCK}

This is a follow up plan for ./plan-${followUpPlanId}.md

On completion with this plan, we need to update the architecture diagrams for this plan in ./architecture-timeline.md

From Plan 11 onward, use the layered \`flowchart LR\` architecture snapshot format from ./AGENTS.md.

## Main Objective

One sentence. What must be true when this plan is complete?

## Goal Restatement

${GOAL_RESTATEMENT_PLACEHOLDER}

## Canonical Ownership Discovery

Before implementation, identify the canonical owner for each major behavior.
If implementation would require a local substitute for a named package,
runtime, UI, protocol, data model, or service boundary, stop and mark the plan
blocked unless the owner explicitly approves extending or bypassing that
canonical owner.

| Behavior | Canonical owner | Existing API/path | Missing API? | Local substitute needed? |
| --- | --- | --- | --- | --- |
|  |  |  | yes/no | yes/no |

## Surface And Mode Contract

Name the exact user-facing product shape before implementation. If a plan
requires an app, define the documented run command, shell template/profile,
required surfaces, and forbidden fallback surfaces. A check against a different
surface, mode, fixture, harness, or adapter does not prove the plan works.

- Required run command:
- Required shell template/profile or runtime mode:
- Required traditional product UI surfaces:
- Required agentic/chat shell surfaces:
- Explicitly non-primary fixtures/adapters:

## Non-Negotiable Requirements

- MUST ...
- MUST NOT ...
- BLOCKED IF ...

## Forbidden Substitute Solutions

List plausible-but-wrong solutions that would look convincing while bypassing
the real goal.

- Do not satisfy this by ...
- Do not create a local replacement for ...
- Do not build a facade, fixture, mock, or harness and call it the product
  surface unless explicitly approved.

## Runtime And User-Surface Proofs

Define which proofs must execute the real runtime, browser bundle, CLI, API,
worker, provider, or user-facing surface. Source imports, HTML fetches, API
responses, and snapshot tests are not enough when the plan requires a real
interactive surface or runtime path.

- Required live/runtime proof:
- Required browser/UI proof:
- Required negative proof that proxy/facade paths are not primary:

## Visual And Asset Proofs

For browser or visual UI work, define the screenshot-level proof before calling
the plan complete. Console-clean rendering is not enough: prove the actual
user-facing page is styled, assets load, scoped theme wrappers and stylesheet
links match the canonical host, critical controls are visibly styled, and the
first workflow can be operated in the browser surface the user will see. DOM
nodes, class names, mounted React components, or package metadata are not
enough. If styling depends on new CSS, theme, font, or asset imports, prove the
actual resolver/install/build state used by the runtime surface. When the work
is meant for Codex Desktop, use the in-app Browser plugin or document why an
equivalent visual browser proof was used.

- Required screenshot proof:
- Required CSS/theme/asset loading proof:
- Required host wrapper or theme-scope proof:
- Required resolver/install/build proof for style assets:
- Required interaction proof:
- Browser surface used for verification:

## Browser E2E Acceptance

Define the end-to-end browser journeys that must pass before the plan can be
called working. Start from the documented run command, open the actual app in
the browser surface the user will use, perform the critical user action, and
assert the visible state changes. Unit/package checks, API smoke tests, server
fetches, DOM presence, screenshots without interaction, or a different shell
mode are not enough.

- Browser E2E for traditional product UI:
- Browser E2E for agentic/chat shell:
- Required visible state change after action:
- Required console/network error proof:
- Required screenshot or recording evidence:

## Proof Matrix

Any \`FAIL\` or \`NOT CHECKED\` status blocks completion.

| Requirement | Status | Evidence |
| --- | --- | --- |
|  | NOT CHECKED |  |

## Implementation Plan

## Verification

List commands, runtime/browser checks, targeted searches, and reviewer checks.

## Completion Review

Before marking this plan done, explain:

- Which canonical owners were used.
- Which canonical owners were not used and why.
- Which local substitutes were created, if any.
- Which runtime/user-surface proofs executed the actual target path.
- Which browser E2E journeys proved the required surface and mode contract.
- Why the proof matrix has no \`FAIL\` or \`NOT CHECKED\` rows.
`;

  fs.writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" });
  console.log(`Created ${fileName}.`);
}

function printUsage() {
  console.error(`Usage:
  node plan.js lint
  node plan.js new
  node plan.js draft "Short title"
  node plan.js drafts
  node plan.js active
  node plan.js checkpoint`);
}

function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!COMMANDS.has(command)) {
    printUsage();
    process.exit(1);
  }

  // Drafts and .active-draft live at the workspace root (one level above
  // plans/) in the docs/<workspace>/ layout; lint stays rooted here.
  const workspaceRoot = path.join(ROOT, "..");

  if (command === "lint") lintPlans();
  if (command === "new") createPlan(args[0]);
  if (command === "draft") createDraft({ root: workspaceRoot, getNextPlanId }, args);
  if (command === "drafts") listDrafts({ root: workspaceRoot, parseFrontMatter });
  if (command === "active") activeDraft({ root: workspaceRoot });
  if (command === "checkpoint") checkpointDraft({ root: workspaceRoot });
}

main();
