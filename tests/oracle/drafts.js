import fs from "node:fs";
import path from "node:path";

import {
  LEDGER_HEADING,
  formatCheckpoint,
  getSection,
} from "./draft-ledger.js";

const DRAFTS_DIR_NAME = "drafts";
const DRAFT_PATTERN = /^draft-\d{8}-\d{6}(?:-[a-z0-9-]+)?\.md$/;
const DRAFT_TEMPLATE_FILE_NAME = "TEMPLATE.md";
const DRAFT_INSTRUCTION_LINK = "../AGENTS.md";
const ACTIVE_DRAFT_FILE = ".active-draft";

function quoteYamlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function formatDraftTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function getDraftTitle(args) {
  return args.join(" ").trim() || "Untitled Plan Draft";
}

function getDraftsDir(root) {
  return path.join(root, DRAFTS_DIR_NAME);
}

function getDraftTemplatePath(root) {
  return path.join(getDraftsDir(root), DRAFT_TEMPLATE_FILE_NAME);
}

function getActiveDraftPath(root) {
  return path.join(root, ACTIVE_DRAFT_FILE);
}

function ensureDraftsDir(root) {
  fs.mkdirSync(getDraftsDir(root), { recursive: true });
}

function getLatestPlanId(getNextPlanId) {
  return getNextPlanId() - 1;
}

function getDraftFiles(root) {
  const draftsDir = getDraftsDir(root);
  if (!fs.existsSync(draftsDir)) return [];

  return fs
    .readdirSync(draftsDir)
    .filter((fileName) => DRAFT_PATTERN.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function getDraftRelativePath(fileName) {
  return `${DRAFTS_DIR_NAME}/${fileName}`;
}

function readActiveDraftRelativePath(root) {
  const activePath = getActiveDraftPath(root);
  if (!fs.existsSync(activePath)) return null;

  return fs.readFileSync(activePath, "utf8").trim() || null;
}

function writeActiveDraft(root, fileName) {
  fs.writeFileSync(getActiveDraftPath(root), `${getDraftRelativePath(fileName)}\n`, "utf8");
}

function resolveDraftPath(root, input) {
  const draftInput = input ?? "";
  const draftsDir = getDraftsDir(root);
  const relativeInput = draftInput.startsWith(`${DRAFTS_DIR_NAME}/`)
    ? draftInput
    : path.join(DRAFTS_DIR_NAME, draftInput);
  const candidate = path.resolve(root, relativeInput);

  if (!candidate.startsWith(`${draftsDir}${path.sep}`)) {
    console.error("Draft path must be inside ./drafts.");
    process.exit(1);
  }

  return candidate;
}

function readDraftTemplate(root) {
  const templatePath = getDraftTemplatePath(root);
  if (!fs.existsSync(templatePath)) {
    console.error(`${DRAFTS_DIR_NAME}/${DRAFT_TEMPLATE_FILE_NAME} does not exist.`);
    process.exit(1);
  }

  return fs.readFileSync(templatePath, "utf8");
}

function renderDraftTemplate(template, values) {
  return Object.entries(values).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export function createDraft({ root, getNextPlanId }, args) {
  const title = getDraftTitle(args);
  const createdAt = new Date();
  const timestamp = formatDraftTimestamp(createdAt);
  const slug = slugify(title);
  const draftId = `draft-${timestamp}${slug ? `-${slug}` : ""}`;
  const fileName = `${draftId}.md`;
  const filePath = path.join(getDraftsDir(root), fileName);
  const basePlanId = getLatestPlanId(getNextPlanId);

  ensureDraftsDir(root);

  const content = renderDraftTemplate(readDraftTemplate(root), {
    base_plan_id: basePlanId,
    created_at_yaml: quoteYamlString(createdAt.toISOString()),
    draft_id: draftId,
    draft_id_yaml: quoteYamlString(draftId),
    draft_instruction_link: DRAFT_INSTRUCTION_LINK,
    draft_path: `${DRAFTS_DIR_NAME}/${fileName}`,
    title,
    title_yaml: quoteYamlString(title),
  });

  fs.writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" });
  writeActiveDraft(root, fileName);
  console.log(`Created ${DRAFTS_DIR_NAME}/${fileName}.`);
  console.log(`Active draft: ${DRAFTS_DIR_NAME}/${fileName}.`);
}

export function listDrafts({ root, parseFrontMatter }) {
  const draftFiles = getDraftFiles(root);
  const activeRelativePath = readActiveDraftRelativePath(root);

  if (draftFiles.length === 0) {
    console.log("No drafts.");
    return;
  }

  draftFiles.forEach((fileName) => {
    const filePath = path.join(getDraftsDir(root), fileName);
    const parsed = parseFrontMatter(filePath);
    const title = parsed.data?.title ?? "Untitled";
    const basePlanId = parsed.data?.base_plan_id ?? "unknown";
    const status = parsed.data?.status ?? "unknown";
    const activeMarker = activeRelativePath === getDraftRelativePath(fileName) ? "*" : "-";

    console.log(`${activeMarker} ${DRAFTS_DIR_NAME}/${fileName} | ${status} | base plan ${basePlanId} | ${title}`);
  });
}

export function activeDraft({ root }) {
  const activeRelativePath = readActiveDraftRelativePath(root);

  if (!activeRelativePath) {
    console.log("No active draft.");
    return;
  }

  const draftPath = resolveDraftPath(root, activeRelativePath);

  if (!fs.existsSync(draftPath)) {
    console.error(`${ACTIVE_DRAFT_FILE} points to missing ${activeRelativePath}.`);
    process.exit(1);
  }

  const content = fs.readFileSync(draftPath, "utf8");
  const ledger = getSection(content, LEDGER_HEADING);

  console.log(`Active draft: ${activeRelativePath}`);
  if (ledger) console.log(ledger.trim());
}

export function checkpointDraft({ root }) {
  const activeRelativePath = readActiveDraftRelativePath(root);

  if (!activeRelativePath) {
    console.log("No active draft.");
    return;
  }

  const draftPath = resolveDraftPath(root, activeRelativePath);

  if (!fs.existsSync(draftPath)) {
    console.error(`${ACTIVE_DRAFT_FILE} points to missing ${activeRelativePath}.`);
    process.exit(1);
  }

  console.log(formatCheckpoint(activeRelativePath, fs.readFileSync(draftPath, "utf8")));
}
