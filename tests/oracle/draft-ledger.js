export const LEDGER_HEADING = "## Problem Ledger";
export const CHECKPOINT_HEADING = "## Latest Checkpoint";

const LEDGER_COLUMNS = ["id", "problem", "status", "current_focus", "disposition"];
const PROMOTION_STATUSES = new Set(["resolved", "deferred", "out_of_scope"]);

export function getSection(content, heading) {
  const start = content.indexOf(heading);
  if (start === -1) return null;

  const afterHeading = content.slice(start + heading.length);
  const nextHeading = afterHeading.match(/\n## /);
  const end = nextHeading?.index === undefined ? content.length : start + heading.length + nextHeading.index;

  return content.slice(start, end);
}

function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

export function parseProblemLedger(content) {
  const section = getSection(content, LEDGER_HEADING);

  if (!section) {
    return { rows: [], errors: [`missing ${LEDGER_HEADING}`] };
  }

  const tableRows = section
    .split(/\r?\n/)
    .map(parseTableRow)
    .filter(Boolean);

  const header = tableRows[0];
  const separator = tableRows[1];
  const rows = tableRows.slice(2);
  const errors = [];

  if (!header || header.join("|") !== LEDGER_COLUMNS.join("|")) {
    errors.push(`problem ledger columns must be: ${LEDGER_COLUMNS.join(", ")}`);
  }

  if (!separator || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    errors.push("problem ledger must include a markdown separator row");
  }

  if (rows.length === 0) {
    errors.push("problem ledger must include at least one problem row");
  }

  return {
    errors,
    rows: rows.map(([id, problem, status, currentFocus, disposition]) => ({
      currentFocus,
      disposition,
      id,
      problem,
      status,
    })),
  };
}

export function formatCheckpoint(activeRelativePath, content) {
  const ledger = parseProblemLedger(content);
  const rows = ledger.rows;
  const active = rows.find((row) => row.status === "active" || row.currentFocus === "yes");
  const openRows = rows.filter((row) => row.status === "open");
  const blockers = rows.filter((row) => !PROMOTION_STATUSES.has(row.status));

  return [
    `Active draft: ${activeRelativePath}`,
    `Current focus: ${active ? `${active.id} ${active.problem}` : "none"}`,
    `Open queue: ${openRows.length === 0 ? "none" : openRows.map((row) => row.id).join(", ")}`,
    `Promotion blockers: ${blockers.length === 0 ? "none" : blockers.map((row) => row.id).join(", ")}`,
  ].join("\n");
}
