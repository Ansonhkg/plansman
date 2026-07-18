export const agentProtocolStartPlanId = 34;

export const agentProtocolBlockLines = [
  "> [!AGENT]",
  "> Before any implementation work: restate the Main Objective, Non-Negotiable",
  "> Requirements, and Forbidden Substitute Solutions in your own words in the",
  "> `## Goal Restatement` section below. Then run `node plan.js lint` and fix all",
  "> findings before proceeding. Re-run lint after every plan edit."
];

export const agentProtocolBlock = agentProtocolBlockLines.join("\n");

export const goalRestatementHeading = "## Goal Restatement";

export const goalRestatementPlaceholder =
  "_Not restated yet — the executing agent must rewrite the objective, non-negotiable requirements, and forbidden substitutes in its own words before implementation._";

// Extract the body of a `## `-level markdown section, or null when the heading
// is absent. Shared by lint and the set-status gate so both agree on where the
// Goal Restatement lives.
export function getMarkdownSection(content: string, heading: string): string | null {
  const headingIndex = content.indexOf(`${heading}\n`);
  if (headingIndex === -1) return null;

  const sectionStart = headingIndex + heading.length + 1;
  const rest = content.slice(sectionStart);
  const nextHeadingMatch = rest.match(/\n## /);
  const sectionEnd = nextHeadingMatch?.index === undefined ? content.length : sectionStart + nextHeadingMatch.index;

  return content.slice(sectionStart, sectionEnd);
}

// True when a plan carries the `## Goal Restatement` section but it is still the
// placeholder or empty. Plans without the section (pre-protocol) return false —
// the requirement only applies once the section is present.
export function goalRestatementNeedsFilling(content: string): boolean {
  if (!content.includes(goalRestatementHeading)) return false;
  const section = getMarkdownSection(content, goalRestatementHeading);
  return section === null || section.trim() === "" || section.includes(goalRestatementPlaceholder);
}
