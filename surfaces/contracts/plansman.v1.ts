import { z } from "zod";

export const PlanStatusSchema = z.enum(["done", "running", "not started"]);

export const PlanFrontMatterSchema = z
  .object({
    plan_id: z.number().finite(),
    sub_plan: z.string().regex(/^[a-z]$/).optional(),
    title: z.string(),
    completion: z.number().finite().min(0).max(100),
    status: PlanStatusSchema,
    diagram_updated: z.boolean(),
    follow_up: z.number().finite().min(1).optional(),
    implementation_branch: z.string().optional(),
    deferred_backlog: z.array(z.string()).optional(),
    touches: z.array(z.string()).optional(),
    follows: z.array(z.number().finite()).optional(),
    repo: z.string().optional(),
    source_idea: z.string().regex(/^B-\d+$/).optional(),
    plan_format: z.literal("prd-v1").optional()
  })
  .strict();

export const PlanSummarySchema = z.object({
  id: z.number(),
  label: z.string(),
  fileName: z.string(),
  title: z.string(),
  completion: z.number(),
  status: PlanStatusSchema,
  diagramUpdated: z.boolean(),
  subPlan: z.string().optional(),
  followUp: z.number().optional(),
  sourceIdea: z.string().optional()
});

export const PlanDetailSchema = z.object({
  summary: PlanSummarySchema,
  frontMatter: PlanFrontMatterSchema,
  body: z.string(),
  raw: z.string()
});

export const LintFindingSchema = z.object({
  fileName: z.string(),
  message: z.string()
});

export const LintReportSchema = z.object({
  ok: z.boolean(),
  planCount: z.number(),
  findings: z.array(LintFindingSchema),
  byFile: z.record(z.array(LintFindingSchema))
});

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export const WorkspaceSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  fileCount: z.number().int().nonnegative()
});

export const WorkspaceSchema = z.object({
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  plansDir: z.string(),
  legacy: z.boolean(),
  sections: z.array(WorkspaceSectionSchema),
  openResolutionCount: z.number().int().nonnegative().optional(),
  lastActivity: z.number().optional()
});

export const SectionFileSchema = z.object({
  name: z.string(),
  title: z.string(),
  path: z.string()
});

export const ResolutionStatusSchema = z.enum(["open", "agreed", "withdrawn"]);

export const ResolutionFrontMatterSchema = z
  .object({
    resolution_id: z.number().int().positive(),
    title: z.string(),
    status: ResolutionStatusSchema,
    plans: z.array(z.string()),
    parties: z.array(z.string()),
    created: z.string(),
    decided: z.string().optional()
  })
  .strict();

export const ResolutionSummarySchema = z.object({
  id: z.number().int().positive(),
  fileName: z.string(),
  title: z.string(),
  status: ResolutionStatusSchema,
  plans: z.array(z.string()),
  parties: z.array(z.string()),
  created: z.string(),
  decided: z.string().optional()
});

export const ResolutionDetailSchema = z.object({
  summary: ResolutionSummarySchema,
  frontMatter: ResolutionFrontMatterSchema,
  body: z.string(),
  raw: z.string()
});

export const BacklogKindSchema = z.enum(["work", "idea"]);

export const BacklogStatusSchema = z.enum(["inbox", "shaped", "open", "done", "dismissed", "promoted"]);

export const BacklogFrontMatterSchema = z
  .object({
    backlog_id: z.number().int().positive(),
    kind: BacklogKindSchema.default("work"),
    title: z.string(),
    status: BacklogStatusSchema,
    category: z.string().optional(),
    source_plan: z.string().optional(),
    proof_requirement: z.string().optional(),
    promoted_plan: z.string().optional(),
    reason: z.string().optional(),
    created: z.string(),
    shaped: z.string().optional(),
    objective: z.string().optional(),
    requirements: z.string().optional(),
    forbidden: z.string().optional(),
    completed: z.string().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "work") {
      if (!value.category?.trim() || !value.reason?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "work backlog items require category and reason"
        });
      }
      if (value.status !== "open" && value.status !== "done") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "work backlog items use open or done status"
        });
      }
    }
    if (value.kind === "idea") {
      if (!["inbox", "shaped", "promoted", "dismissed"].includes(value.status)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "ideas use inbox, shaped, promoted, or dismissed status" });
      }
      if (value.status === "shaped") {
        if (!value.shaped?.trim() || !value.objective?.trim() || !value.requirements?.trim() || !value.forbidden?.trim()) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: "shaped ideas require shaped, objective, requirements, and forbidden" });
        }
      }
      if (value.status === "promoted" && !value.promoted_plan?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "promoted ideas require promoted_plan" });
      }
      if (value.status === "dismissed" && !value.reason?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "dismissed ideas require reason" });
      }
    }
  });

export const BacklogSummarySchema = z.object({
  id: z.number().int().positive(),
  label: z.string(),
  fileName: z.string(),
  kind: BacklogKindSchema,
  title: z.string(),
  status: BacklogStatusSchema,
  category: z.string().optional(),
  sourcePlan: z.string().optional(),
  proofRequirement: z.string().optional(),
  promotedPlan: z.string().optional(),
  reason: z.string().optional(),
  created: z.string(),
  shaped: z.string().optional(),
  completed: z.string().optional()
});

export const BacklogDetailSchema = z.object({
  summary: BacklogSummarySchema,
  frontMatter: BacklogFrontMatterSchema,
  body: z.string(),
  raw: z.string()
});

export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type PlanFrontMatter = z.infer<typeof PlanFrontMatterSchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export type PlanDetail = z.infer<typeof PlanDetailSchema>;
export type LintFinding = z.infer<typeof LintFindingSchema>;
export type LintReport = z.infer<typeof LintReportSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
export type WorkspaceSection = z.infer<typeof WorkspaceSectionSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type SectionFile = z.infer<typeof SectionFileSchema>;
export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;
export type ResolutionFrontMatter = z.infer<typeof ResolutionFrontMatterSchema>;
export type ResolutionSummary = z.infer<typeof ResolutionSummarySchema>;
export type ResolutionDetail = z.infer<typeof ResolutionDetailSchema>;
export type BacklogKind = z.infer<typeof BacklogKindSchema>;
export type BacklogStatus = z.infer<typeof BacklogStatusSchema>;
export type BacklogFrontMatter = z.infer<typeof BacklogFrontMatterSchema>;
export type BacklogSummary = z.infer<typeof BacklogSummarySchema>;
export type BacklogDetail = z.infer<typeof BacklogDetailSchema>;
