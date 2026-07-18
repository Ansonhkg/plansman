import { Effect } from "effect";
import {
  type BacklogSummary,
  PlanFrontMatterSchema,
  type PlanDetail,
  type PlanStatus,
  type ResolutionStatus,
  type WorkspaceSection
} from "../contracts/plansman.v1";
import { makeFsGitPlanStore, type FsGitPlanStoreOptions } from "../../src/adapters/fs-git-plan-store";
import { agentProtocolStartPlanId, goalRestatementNeedsFilling } from "../../src/core/agent-protocol";
import { parseFrontMatter } from "../../src/core/front-matter";
import {
  addIdea,
  addIdeaNote,
  addBacklog,
  type BacklogItemInput,
  completePlanWithBacklog,
  dismissIdea,
  getBacklog,
  getIdea,
  listBacklog,
  listIdeas,
  markBacklogDone,
  promoteIdea,
  shapeIdea,
  type ShapeIdeaInput
} from "../../src/core/backlog";
import { lintPlanCorpus } from "../../src/core/lint";
import {
  claimPlanFileName,
  type PlanGoals,
  parseClaimPlanTarget,
  parsePlanDetail,
  renderClaimedPlan,
  sortPlanFiles,
  updatePlanStatus
} from "../../src/core/plans";
import {
  decideResolution,
  getResolution,
  listResolutions,
  openResolution,
  openResolutionsNamingPlan,
  respondResolution
} from "../../src/core/resolutions";
import { initWorkspace, type InitInput } from "../../src/core/repo-binding";
import { discoverWorkspaces, getWorkspace, listSectionFiles, readSectionFile, toggleSection } from "../../src/core/workspaces";
import { PlanStore, type PlanStoreService } from "../../src/ports/plan-store";

export type PlansmanSdkOptions = Pick<FsGitPlanStoreOptions, "rootDir">;

export type ClaimPlanInput = {
  title: string;
  target?: string | number;
  workspace?: string;
};

export type CreatePlanInput = ClaimPlanInput & PlanGoals & { prd: string };

export type SetStatusInput = {
  id: string | number;
  status: PlanStatus;
  completion?: number;
  workspace?: string;
  // Escape hatch for the open-resolution guard on `done`.
  overrideResolutions?: boolean;
  // Escape hatch for the Goal Restatement guard on `running`/`done`.
  overrideRestatement?: boolean;
};

export type ClaimPlanResult = {
  plan: PlanDetail;
  commit: {
    hash: string;
    message: string;
  };
};

export type SetStatusResult = ClaimPlanResult;

export type CompletePlanInput = {
  id: string | number;
  deferrals?: BacklogItemInput[];
  workspace?: string;
  overrideResolutions?: boolean;
  overrideRestatement?: boolean;
};

export type AddBacklogInput = BacklogItemInput & { workspace?: string };

export type AddIdeaInput = {
  title: string;
  workspace?: string;
};

export type NoteIdeaInput = {
  id: string | number;
  note: string;
  workspace?: string;
};

export type DismissIdeaInput = {
  id: string | number;
  reason: string;
  workspace?: string;
};

export type ShapeIdeaSdkInput = ShapeIdeaInput & { workspace?: string };

export type PromoteIdeaSdkInput = Partial<PlanGoals> & {
  id: string | number;
  target?: string | number;
  workspace?: string;
};

export type OpenResolutionInput = {
  title: string;
  plans: string[];
  parties: string[];
  conflict: string;
  workspace?: string;
};

export type RespondResolutionInput = {
  id: string | number;
  party: string;
  position: string;
  workspace?: string;
};

export type DecideResolutionInput = {
  id: string | number;
  decision: string;
  status?: ResolutionStatus;
  workspace?: string;
};

function planFileNameFromId(id: string | number): string {
  const value = String(id);
  // Numeric ids resolve canonical plans; fileName stems address the whole
  // corpus, where plan_id alone is not unique (plan-14.md vs plan-14-review-gate.md).
  if (/^\d+[a-z]?$/.test(value)) return `plan-${value}.md`;
  if (/^plan-[A-Za-z0-9-]+$/.test(value)) return `${value}.md`;
  throw new Error(`Invalid plan id: ${value}`);
}

function runWithStore<A>(store: PlanStoreService, effect: Effect.Effect<A, unknown, PlanStore>): Promise<A> {
  return Effect.runPromise(Effect.provideService(effect, PlanStore, store));
}

export function createPlansmanSdk(options: PlansmanSdkOptions = {}) {
  async function createWorkspaceStore(workspaceSlug?: string): Promise<PlanStoreService> {
    const workspace = await getWorkspace(options.rootDir, workspaceSlug);
    return makeFsGitPlanStore({ rootDir: workspace.rootDir, plansDir: workspace.absolutePlansDir });
  }

  async function runInWorkspace<A>(workspaceSlug: string | undefined, effect: Effect.Effect<A, unknown, PlanStore>) {
    return runWithStore(await createWorkspaceStore(workspaceSlug), effect);
  }

  async function assertNoOpenResolutions(
    id: string | number,
    workspace: string | undefined,
    override = false
  ): Promise<void> {
    if (override) return;
    const resolved = await getWorkspace(options.rootDir, workspace);
    const stem = planFileNameFromId(id).replace(/\.md$/, "");
    const blocking = openResolutionsNamingPlan(await listResolutions(resolved), [id, stem]);
    if (blocking.length === 0) return;
    const refs = blocking.map((resolution) => `resolution-${resolution.id} ("${resolution.title}")`).join(", ");
    throw new Error(
      `Blocked: plan ${id} is named in open ${refs}. Settle it first (plansman resolutions respond/decide) or pass overrideResolutions/--override-resolutions.`
    );
  }

  function assertRestated(
    id: string | number,
    content: string,
    status: "running" | "done",
    override = false
  ): void {
    if (override) return;
    const planId = Number((parseFrontMatter(content).data ?? {}).plan_id);
    if (Number.isInteger(planId) && planId >= agentProtocolStartPlanId && goalRestatementNeedsFilling(content)) {
      throw new Error(
        `Blocked: plan ${id} cannot move to '${status}' while its \`## Goal Restatement\` is empty or the placeholder. Restate the Main Objective, Non-Negotiable Requirements, and Forbidden Substitute Solutions in your own words first, or pass overrideRestatement/--override-restatement.`
      );
    }
  }

  function writeNewPlan(input: ClaimPlanInput, definition?: PlanGoals & { prd: string }): Promise<ClaimPlanResult> {
    return runInWorkspace(
      input.workspace,
      Effect.gen(function* () {
        const planStore = yield* PlanStore;
        const files = yield* planStore.listPlanFiles;
        const fileNames = files.map((file) => file.fileName);
        const target = parseClaimPlanTarget(input.target, fileNames);
        const fileName = claimPlanFileName(target);
        const planLabel = `${target.planId}${target.subPlan ?? ""}`;
        const content = renderClaimedPlan(target, input.title, fileNames, definition, undefined, definition?.prd);
        yield* planStore.writePlanFile(fileName, content);
        const action = definition ? "create" : "claim";
        const message = `feat(plan): ${action} plan ${planLabel} - ${input.title}`;
        const commit = yield* planStore.commit(message, [`${planStore.relativePlansDir}/${fileName}`]);
        const file = yield* planStore.readPlanFile(fileName);
        return { plan: parsePlanDetail(file), commit };
      })
    );
  }

  const listEffect = Effect.gen(function* () {
    const planStore = yield* PlanStore;
    const files = yield* planStore.listPlanFiles;
    return sortPlanFiles(files).map((file) => parsePlanDetail(file).summary);
  });

  const lintEffect = (sourceIdeaLabels: string[]) => Effect.gen(function* () {
    const planStore = yield* PlanStore;
    const planFiles = yield* planStore.listPlanFiles;
    const architectureTimeline = yield* planStore.readArchitectureTimeline;
    return lintPlanCorpus({ planFiles, architectureTimeline, sourceIdeaLabels });
  });

  return {
    init: (input: InitInput = {}) => initWorkspace(input),
    workspaces: {
      list: async () => discoverWorkspaces(options.rootDir)
    },
    plans: {
      list: (workspace?: string) => runInWorkspace(workspace, listEffect),
      get: (id: string | number, workspace?: string) =>
        runInWorkspace(
          workspace,
          Effect.gen(function* () {
            const planStore = yield* PlanStore;
            const file = yield* planStore.readPlanFile(planFileNameFromId(id));
            return parsePlanDetail(file);
          })
        ),
      lint: async (workspace?: string) => {
        const resolved = await getWorkspace(options.rootDir, workspace);
        const sourceIdeaLabels = (await listIdeas(resolved)).map((idea) => idea.label);
        return runInWorkspace(workspace, lintEffect(sourceIdeaLabels));
      },
      claim: (input: ClaimPlanInput) => writeNewPlan(input),
      create: (input: CreatePlanInput) =>
        writeNewPlan(input, {
          objective: input.objective,
          requirements: input.requirements,
          forbidden: input.forbidden,
          prd: input.prd
        }),
      setStatus: async (input: SetStatusInput) => {
        // Done is a claim other threads rely on; an open resolution naming
        // this plan means the claim is contested — settle or override.
        if (input.status === "done") {
          await assertNoOpenResolutions(input.id, input.workspace, input.overrideResolutions);
        }
        const result = await runInWorkspace(
          input.workspace,
          Effect.gen(function* () {
            const planStore = yield* PlanStore;
            const fileName = planFileNameFromId(input.id);
            if (input.completion !== undefined && (input.completion < 0 || input.completion > 100)) {
              throw new Error("completion must be between 0 and 100");
            }
            PlanFrontMatterSchema.shape.status.parse(input.status);
            const file = yield* planStore.readPlanFile(fileName);
            // Starting (or completing) a plan is where the anti-drift restatement
            // must already be recorded — gate the transition, don't rely on a
            // later voluntary lint run to catch an empty restatement. Scoped to
            // plans on the agent protocol (>= 34), matching the lint rule.
            if (
              (input.status === "running" || input.status === "done") &&
              !input.overrideRestatement
            ) {
              assertRestated(input.id, file.content, input.status, input.overrideRestatement);
            }
            const content = updatePlanStatus(file.content, input.status, input.completion);
            yield* planStore.writePlanFile(fileName, content);
            const message = `chore(plan): set plan ${input.id} ${input.status}`;
            const commit = yield* planStore.commit(message, [`${planStore.relativePlansDir}/${fileName}`]);
            const updatedFile = yield* planStore.readPlanFile(fileName);
            return { plan: parsePlanDetail(updatedFile), commit };
          })
        );
        if (input.status !== "running") return result;
        const workspace = await getWorkspace(options.rootDir, input.workspace);
        const backlog = (await listBacklog(workspace)).filter((item) => item.status === "open");
        return { ...result, notices: { backlog } };
      },
      complete: async (input: CompletePlanInput) => {
        await assertNoOpenResolutions(input.id, input.workspace, input.overrideResolutions);
        const workspace = await getWorkspace(options.rootDir, input.workspace);
        const fileName = planFileNameFromId(input.id);
        const file = await runWithStore(
          await createWorkspaceStore(input.workspace),
          Effect.gen(function* () {
            const store = yield* PlanStore;
            return yield* store.readPlanFile(fileName);
          })
        );
        assertRestated(input.id, file.content, "done", input.overrideRestatement);
        const plan = parsePlanDetail(file);
        return completePlanWithBacklog(workspace, fileName, plan.summary.label, input.deferrals ?? []);
      }
    },
    ideas: {
      list: async (workspace?: string): Promise<BacklogSummary[]> =>
        listIdeas(await getWorkspace(options.rootDir, workspace)),
      get: async (id: string | number, workspace?: string) =>
        getIdea(await getWorkspace(options.rootDir, workspace), id),
      add: async (input: AddIdeaInput) =>
        addIdea(await getWorkspace(options.rootDir, input.workspace), input.title),
      note: async (input: NoteIdeaInput) =>
        addIdeaNote(await getWorkspace(options.rootDir, input.workspace), input.id, input.note),
      shape: async (input: ShapeIdeaSdkInput) =>
        shapeIdea(await getWorkspace(options.rootDir, input.workspace), input),
      dismiss: async (input: DismissIdeaInput) =>
        dismissIdea(await getWorkspace(options.rootDir, input.workspace), input.id, input.reason),
      promote: async (input: PromoteIdeaSdkInput) =>
        promoteIdea(await getWorkspace(options.rootDir, input.workspace), input.id, {
          objective: input.objective,
          requirements: input.requirements,
          forbidden: input.forbidden,
          target: input.target
        })
    },
    backlog: {
      list: async (workspace?: string): Promise<BacklogSummary[]> =>
        listBacklog(await getWorkspace(options.rootDir, workspace)),
      get: async (id: string | number, workspace?: string) =>
        getBacklog(await getWorkspace(options.rootDir, workspace), id),
      add: async (input: AddBacklogInput) =>
        addBacklog(await getWorkspace(options.rootDir, input.workspace), input),
      done: async (id: string | number, workspace?: string) =>
        markBacklogDone(await getWorkspace(options.rootDir, workspace), id)
    },
    sections: {
      list: async (workspace?: string): Promise<WorkspaceSection[]> => {
        const resolved = await getWorkspace(options.rootDir, workspace);
        return resolved.sections;
      },
      toggle: async (workspace: string, id: string, enabled: boolean) => toggleSection(options.rootDir, workspace, id, enabled),
      files: async (workspace: string | undefined, id: string) => listSectionFiles(options.rootDir, workspace, id),
      read: async (workspace: string | undefined, id: string, fileName: string) =>
        readSectionFile(options.rootDir, workspace, id, fileName)
    },
    resolutions: {
      list: async (workspace?: string) => {
        const resolved = await getWorkspace(options.rootDir, workspace);
        return listResolutions(resolved);
      },
      get: async (id: string | number, workspace?: string) => {
        const resolved = await getWorkspace(options.rootDir, workspace);
        return getResolution(resolved, id);
      },
      open: async (input: OpenResolutionInput) => {
        const resolved = await getWorkspace(options.rootDir, input.workspace);
        return openResolution(resolved, input);
      },
      respond: async (input: RespondResolutionInput) => {
        const resolved = await getWorkspace(options.rootDir, input.workspace);
        return respondResolution(resolved, input);
      },
      decide: async (input: DecideResolutionInput) => {
        const resolved = await getWorkspace(options.rootDir, input.workspace);
        return decideResolution(resolved, { ...input, status: input.status ?? "agreed" });
      }
    },
    ledger: {
      get: (workspace?: string) =>
        runInWorkspace(
          workspace,
          Effect.gen(function* () {
            const planStore = yield* PlanStore;
            return yield* planStore.getLedger;
          })
        )
    },
    drafts: {
      list: (workspace?: string) =>
        runInWorkspace(
          workspace,
          Effect.gen(function* () {
            const planStore = yield* PlanStore;
            return yield* planStore.listDrafts;
          })
        )
    }
  };
}

export const sdk = createPlansmanSdk();
