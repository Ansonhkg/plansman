import { Context, type Effect } from "effect";
import type { PlanFile } from "../core/plans";

export type CommitResult = {
  hash: string;
  message: string;
};

export type DraftSummary = {
  path: string;
  title: string;
  status: string;
  basePlanId: number | string;
  active: boolean;
};

export type LedgerSnapshot = {
  activeDraft: string | null;
  content: string | null;
};

export type PlanStoreService = {
  readonly rootDir: string;
  readonly plansDir: string;
  readonly relativePlansDir: string;
  listPlanFiles: Effect.Effect<PlanFile[], unknown>;
  readPlanFile: (fileName: string) => Effect.Effect<PlanFile, unknown>;
  writePlanFile: (fileName: string, content: string) => Effect.Effect<void, unknown>;
  readArchitectureTimeline: Effect.Effect<string | null, unknown>;
  commit: (message: string, paths: string[]) => Effect.Effect<CommitResult, unknown>;
  listDrafts: Effect.Effect<DraftSummary[], unknown>;
  getLedger: Effect.Effect<LedgerSnapshot, unknown>;
};

export class PlanStore extends Context.Tag("plansman/PlanStore")<PlanStore, PlanStoreService>() {}
