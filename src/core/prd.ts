export const prdHeadings = [
  "Problem Statement",
  "Solution",
  "User Stories",
  "Implementation Decisions",
  "Testing Decisions",
  "Release Decisions",
  "Documentation Decisions",
  "Out of Scope",
  "Further Notes"
] as const;

export const prdStartMarker = "<!-- plansman:prd:start -->";
export const prdEndMarker = "<!-- plansman:prd:end -->";

const prdScaffoldPrompts: Record<(typeof prdHeadings)[number], string> = {
  "Problem Statement": "Describe the problem, who experiences it, and why it matters.",
  Solution: "Describe the intended product behavior and approach.",
  "User Stories": "List concrete user stories and acceptance expectations.",
  "Implementation Decisions": "Record decided implementation constraints and ownership.",
  "Testing Decisions": "Record required automated, integration, and manual proof.",
  "Release Decisions": "Record rollout, migration, compatibility, and release expectations.",
  "Documentation Decisions": "Record documentation that must change.",
  "Out of Scope": "State what this plan intentionally will not do.",
  "Further Notes": "Preserve any remaining context needed for implementation."
};

export function renderPrdScaffold(): string {
  return prdHeadings
    .map((heading) => `## ${heading}\n\n${prdScaffoldPrompts[heading]}`)
    .join("\n\n");
}

export function validatePrd(rawPrd: string): string {
  const prd = rawPrd.trim();
  if (!prd) throw new Error("PRD content is required");

  const sections = prdHeadings.map((heading) => {
    const match = new RegExp(`^## ${heading}$`, "m").exec(prd);
    if (!match) throw new Error(`PRD requires ordered section ## ${heading}`);
    return { heading, index: match.index, contentStart: match.index + match[0].length };
  });

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const previous = sections[index - 1];
    if (previous && section.index <= previous.index) {
      throw new Error(`PRD requires ordered section ## ${section.heading}`);
    }
    const end = sections[index + 1]?.index ?? prd.length;
    if (!prd.slice(section.contentStart, end).trim()) {
      throw new Error(`PRD section ## ${section.heading} must not be empty`);
    }
  }

  return prd;
}

export function managedPrdFromBody(body: string): string | null {
  const start = body.indexOf(prdStartMarker);
  const end = body.indexOf(prdEndMarker);
  if (start === -1 || end <= start) return null;
  return body.slice(start + prdStartMarker.length, end).trim() || null;
}

export function upsertManagedPrd(body: string, rawPrd: string): string {
  const prd = validatePrd(rawPrd);
  const managed = `${prdStartMarker}\n${prd}\n${prdEndMarker}`;
  const start = body.indexOf(prdStartMarker);
  const end = body.indexOf(prdEndMarker);
  if (start !== -1 && end > start) {
    return `${body.slice(0, start)}${managed}${body.slice(end + prdEndMarker.length)}`.trimEnd();
  }
  return `${managed}\n\n${body.trimStart()}`.trimEnd();
}
