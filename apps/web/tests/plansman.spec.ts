import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {expect, test} from "@playwright/test";

type PlanSummary = {
  id: number;
  fileName: string;
  title: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const testResultsDir = path.resolve(here, "../test-results");
const stateFile = path.join(testResultsDir, "e2e-state.json");
const apiBaseUrl = `http://127.0.0.1:${process.env.PLANSMAN_TEST_API_PORT ?? 4000}`;
const browserPrd = `## Problem Statement

Product intent disappears before implementation.

## Solution

Store a shaped PRD with the idea.

## User Stories

1. As a planner, I want durable requirements, so that plans retain product context.

## Implementation Decisions

- Reuse idea records.

## Testing Decisions

- Test the browser lifecycle.

## Release Decisions

- Use the existing release.

## Documentation Decisions

- Document shaping.

## Out of Scope

- Embedded AI.

## Further Notes

Promotion freezes the PRD.`;

function cloneDir() {
  return JSON.parse(fs.readFileSync(stateFile, "utf8")) as {cloneDir: string};
}

test("workspace sections and dynamic plan claim work from fixture clone", async ({page, request}) => {
  const fatalErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") fatalErrors.push(message.text());
  });
  page.on("pageerror", (error) => fatalErrors.push(error.message));
  page.on("requestfailed", (failedRequest) => {
    const url = failedRequest.url();
    if (url.includes("/api/") || url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      fatalErrors.push(`${failedRequest.method()} ${url}: ${failedRequest.failure()?.errorText}`);
    }
  });

  const apiPlans = (await request.get(`${apiBaseUrl}/api/workspaces/alpha/plans`).then((response) =>
    response.json(),
  )) as {plans: PlanSummary[]};
  const nextId = Math.max(...apiPlans.plans.map((plan) => plan.id)) + 1;
  const expectedFileName = `plan-${nextId}.md`;

  await page.goto("/");

  await expect(page.getByText("Alpha Workspace").first()).toBeVisible();
  await expect(page.getByRole("row", {name: /Running/i})).toHaveCount(0);
  await expect(page.getByRole("row", {name: /Corpus/i})).toHaveCount(0);
  await expect(page.getByRole("row", {name: /Lint/i})).toHaveCount(0);
  await expect(page.getByRole("row", {name: /Roadmap/i})).toHaveCount(0);
  await expect(page.getByRole("row", {name: /Import/i})).toHaveCount(0);
  await expect(page.getByRole("row", {name: /Invite people/i})).toHaveCount(0);

  await expect(page.locator(".tracker-row")).toHaveCount(apiPlans.plans.length);
  await expect(page.locator(".tracker-row").filter({hasText: "Alpha First Plan"})).toBeVisible();
  await expect(page.getByRole("row", {name: /Drafts/i})).toHaveCount(0);
  // The row's accessible name is its textValue ("Resolutions"); the open
  // count renders inside the gridcell, so assert it as contained text.
  await expect(page.getByRole("row", {name: "Resolutions"})).toBeVisible();
  await expect(page.getByRole("row", {name: "Resolutions"})).toContainText("1");
  await expect(page.getByRole("row", {name: "DAG"})).toBeVisible();

  await page.getByRole("row", {name: /Resolutions/i}).click();
  await expect(page.getByRole("heading", {name: "Resolutions"})).toBeVisible();
  await expect(page.getByText("Fixture Architecture Choice")).toBeVisible();
  await expect(page.getByText("plan-1, plan-2")).toBeVisible();
  await page.getByText("Fixture Architecture Choice").click();
  await expect(page.getByRole("dialog", {name: "Resolution detail"})).toBeVisible();
  await expect(page.getByText("open").first()).toBeVisible();
  await expect(page.getByText("plan-1, plan-2").last()).toBeVisible();
  await expect(page.getByRole("heading", {name: "Conflict"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Position: alpha-agent"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Decision"})).toBeVisible();
  await page.getByRole("dialog", {name: "Resolution detail"}).getByRole("button", {name: "Close"}).click();

  await page.getByRole("button", {name: "Settings"}).click();
  await expect(page.getByRole("heading", {name: "Alpha Workspace"})).toBeVisible();
  // React Aria renders the real input behind the styled control; force
  // bypasses the pointer-interception of the visual checkbox.
  await page.getByLabel("Enable Drafts").click({force: true});
  await expect(page.getByRole("row", {name: /Drafts/i})).toBeVisible();
  expect(execFileSync("git", ["log", "-1", "--pretty=%s"], {
    cwd: cloneDir().cloneDir,
    encoding: "utf8",
  })).toContain("enable drafts in alpha");

  await page.reload();
  await expect(page.getByRole("row", {name: /Drafts/i})).toBeVisible();

  await page.getByRole("row", {name: /Drafts/i}).click();
  await expect(page.getByText("Alpha Draft Note")).toBeVisible();
  await page.getByText("Alpha Draft Note").click();
  await expect(page.getByRole("dialog", {name: "Markdown document"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Alpha Draft Heading"})).toBeVisible();
  await page.getByRole("dialog", {name: "Markdown document"}).getByRole("button", {name: "Close"}).click();

  await page.getByRole("row", {name: /^Plans/i}).click();
  await page.getByRole("button", {name: "New plan"}).click();
  await page.getByLabel("Plan title").fill("Browser Claim Smoke");
  await page.getByRole("button", {name: "Claim plan"}).click();
  await expect(page.getByRole("dialog", {name: "Plan detail"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Browser Claim Smoke", exact: true})).toBeVisible();
  await page.getByRole("dialog", {name: "Plan detail"}).getByRole("button", {name: "Close"}).click();

  await expect(page.locator(".tracker-row")).toHaveCount(apiPlans.plans.length + 1);
  await expect(page.locator(".tracker-row").filter({hasText: expectedFileName})).toContainText(
    "Browser Claim Smoke",
  );
  expect(execFileSync("git", ["log", "-1", "--pretty=%s"], {
    cwd: cloneDir().cloneDir,
    encoding: "utf8",
  })).toContain(`claim plan ${nextId}`);

  await page.getByRole("row", {name: /Resolutions/i}).click();
  await page.screenshot({fullPage: true, path: path.join(testResultsDir, "plan-34-resolutions.png")});
  expect(fatalErrors).toEqual([]);
});

test("ideas can be captured, discussed, shaped, promoted, and dismissed", async ({page, request}) => {
  const fatalErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") fatalErrors.push(message.text());
  });
  page.on("pageerror", (error) => fatalErrors.push(error.message));
  const shot = async (name: string) => {
    await page.waitForTimeout(450);
    await page.screenshot({fullPage: true, path: path.join(testResultsDir, name)});
  };

  const seeded = await request.post(`${apiBaseUrl}/api/workspaces/alpha/ideas`, {
    data: {title: "Browser idea discussion"},
  });
  expect(seeded.ok()).toBe(true);
  const seededLabel = ((await seeded.json()) as {idea: {summary: {label: string}}}).idea.summary.label;

  await page.goto("/ideas?status=inbox");
  await page.addStyleTag({
    content: "*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }",
  });
  await expect(page.getByRole("heading", {name: "Ideas", exact: true})).toBeVisible();
  await expect(page.getByText("Browser idea discussion")).toBeVisible();
  await page.getByText("Browser idea discussion").click();
  await expect(page.getByRole("dialog", {name: "Idea detail"})).toBeVisible();
  await expect(page.getByRole("button", {name: "Shape first"})).toBeDisabled();
  await shot("plan-12-01-captured-shape-first.png");

  await page.getByLabel("Discussion note").fill("Dependencies should remain explicit for agents.");
  await page.getByRole("button", {name: "Add note"}).click();
  await expect(page.locator(".markdown-body").getByText("Dependencies should remain explicit for agents.")).toBeVisible();
  await shot("plan-12-02-discussed.png");

  await page.reload();
  await expect(page.getByRole("dialog", {name: "Idea detail"})).toBeVisible();
  await expect(page.locator(".markdown-body").getByText("Dependencies should remain explicit for agents.")).toBeVisible();
  await shot("plan-12-03-persisted.png");

  await page.getByRole("button", {name: "Shape", exact: true}).click();
  await page.getByLabel("PRD Markdown").fill(browserPrd);
  await page.getByLabel("Objective").fill("Plans declare enforceable dependencies.");
  await page.getByLabel("Requirements").fill("Expose dependencies across every Plansman surface.");
  await page.getByLabel("Forbidden substitutes").fill("Do not infer dependencies only from numbering.");
  await shot("plan-12-04-shape-form.png");
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole("heading", {name: "Shape into a PRD"}).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot("plan-12-04-shape-form-mobile.png");
  await page.setViewportSize({width: 1280, height: 720});
  let guardedUnsavedPrd = false;
  page.once("dialog", async (dialog) => {
    guardedUnsavedPrd = dialog.message() === "Discard unsaved PRD changes?";
    await dialog.dismiss();
  });
  await page.getByRole("dialog", {name: "Idea detail"}).getByRole("button", {name: "Close"}).click();
  expect(guardedUnsavedPrd).toBe(true);
  await expect(page.getByRole("dialog", {name: "Idea detail"})).toBeVisible();
  let guardedModeSwitch = false;
  page.once("dialog", async (dialog) => {
    guardedModeSwitch = dialog.message() === "Discard unsaved PRD changes?";
    await dialog.dismiss();
  });
  await page.getByRole("dialog", {name: "Idea detail"}).getByText("Dismiss", {exact: true}).click();
  expect(guardedModeSwitch).toBe(true);
  await expect(page.getByRole("heading", {name: "Shape into a PRD"})).toBeVisible();
  await page.getByRole("button", {name: "Save PRD"}).click();
  await expect(page.getByText("shaped", {exact: true})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Problem Statement"})).toBeVisible();
  await shot("plan-12-05-shaped.png");

  await page.getByRole("button", {name: "Promote"}).click();
  await expect(page.getByText("The full stored PRD—not only its goal fields—will be embedded in the new plan.")).toBeVisible();
  await shot("plan-12-06-promotion-contract.png");
  await page.getByRole("button", {name: "Create plan"}).click();
  await expect(page.getByText("promoted", {exact: true})).toBeVisible();
  await expect(page.getByText(/This idea became plan-/)).toBeVisible();
  await shot("plan-12-07-promoted.png");
  await page.getByRole("button", {name: /Open plan-/}).click();
  await expect(page.getByRole("dialog", {name: "Plan detail"})).toBeVisible();
  await page.getByRole("button", {name: "Show plan details"}).click();
  await expect(page.getByRole("heading", {name: "Problem Statement"})).toBeVisible();
  await expect(page.getByText("Product intent disappears before implementation.")).toBeVisible();
  await shot("plan-12-08-plan-prd-source.png");
  await page.getByRole("button", {name: seededLabel, exact: true}).click();
  await expect(page.getByRole("dialog", {name: "Idea detail"})).toBeVisible();
  await expect(page.getByText("promoted", {exact: true})).toBeVisible();
  await shot("plan-12-09-source-idea.png");

  await page.getByRole("dialog", {name: "Idea detail"}).getByRole("button", {name: "Close"}).click();
  await page.getByRole("button", {name: "New idea"}).click();
  await expect(page.getByRole("dialog", {name: "Capture idea"})).toBeVisible();
  await page.getByLabel("Idea title").fill("A second browser idea");
  await page.getByRole("button", {name: "Capture idea"}).click();
  await expect(page.getByRole("dialog", {name: "Idea detail"})).toBeVisible();
  await shot("plan-12-10-second-captured.png");
  await page.getByRole("dialog", {name: "Idea detail"}).getByText("Dismiss", {exact: true}).click();
  await page.getByLabel("Reason").fill("Covered by an existing plan.");
  await page.getByRole("button", {name: "Dismiss idea"}).click();
  await expect(page.getByText("dismissed", {exact: true})).toBeVisible();
  await expect(page.getByText("Covered by an existing plan.", {exact: true})).toBeVisible();
  await shot("plan-12-11-dismissed.png");
  await page.waitForTimeout(2300);
  await shot("plan-12-11-dismissed-settled.png");

  const ideaDialog = page.getByRole("dialog", {name: "Idea detail"});
  await ideaDialog.getByRole("button", {name: "Close"}).click();
  await expect(ideaDialog).not.toBeVisible();
  await page.getByRole("tab", {name: /All/}).click();
  await expect(page.locator(".idea-list").getByText("Browser idea discussion")).toBeVisible();
  await expect(page.locator(".idea-list").getByText("A second browser idea")).toBeVisible();
  await shot("plan-11-11-idea-history.png");

  await page.setViewportSize({width: 390, height: 844});
  await page.locator(".idea-list").getByText("A second browser idea").click();
  await expect(page.getByRole("dialog", {name: "Idea detail"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Outcome"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Discussion"})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot("plan-11-12-mobile.png");

  expect(fatalErrors).toEqual([]);
});
