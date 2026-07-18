## Problem Statement

Implementation plans can preserve task mechanics while losing the product context that explains what users need and why decisions were made.

## Solution

Create one self-contained plan that embeds the complete accepted PRD before the execution, verification, and proof sections.

## User Stories

1. As an implementer, I want the full product context in the active plan, so that I can make grounded decisions without finding another artifact.
2. As a reviewer, I want requirements and execution evidence in one file, so that I can evaluate whether the delivered behavior matches the intent.

## Implementation Decisions

- Use the canonical Plansman PRD headings in their documented order.
- Keep the PRD in the plan Markdown itself.

## Testing Decisions

- Validate the PRD before creating the plan.
- Test the rendered file through CLI, SDK, REST, MCP, and idea promotion.

## Release Decisions

- Ship the format through the existing Plansman CLI and package.
- Preserve legacy plan readability.

## Documentation Decisions

- Document `--file` and `--stdin` for direct plan creation.
- Explain that ideas must be shaped before promotion.

## Out of Scope

- Automatically inventing product requirements when no PRD has been supplied.

## Further Notes

`plansman claim` remains the explicit escape hatch for reserving a blank PRD scaffold.
