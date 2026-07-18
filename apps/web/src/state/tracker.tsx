import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  ErrorEnvelope,
  IdeaDetail,
  IdeaSummary,
  LintReport,
  PlanDetail,
  PlanStatus,
  PlanSummary,
  ResolutionDetail,
  ResolutionSummary,
  SectionContent,
  Workspace,
  WorkspaceSection,
} from "../data/tracker";

export type FilterKind = "status" | "completion";
export type PlanSort = "plan-number" | "latest";

export interface ActiveFilter {
  id: string;
  kind: FilterKind;
  value: string;
  label: string;
}

interface ClaimPlanInput {
  title: string;
  target?: string;
}

interface PromoteIdeaInput {
  objective?: string;
  requirements?: string;
  forbidden?: string;
  target?: string;
}

interface ShapeIdeaInput {
  prd: string;
  objective: string;
  requirements: string;
  forbidden: string;
}

interface TrackerContextValue {
  workspaces: Workspace[];
  workspacesLoading: boolean;
  workspacesError: string | null;
  activeWorkspace: Workspace | null;
  currentWorkspaceSlug: string | null;
  setCurrentWorkspaceSlug: (slug: string) => void;
  refreshWorkspaces: () => Promise<void>;
  sections: WorkspaceSection[];
  toggleSection: (id: string, enabled: boolean) => Promise<void>;
  plans: PlanSummary[];
  plansLoading: boolean;
  plansError: string | null;
  refreshPlans: () => Promise<void>;
  openIssueId: string | null;
  openIssue: (id: string) => void;
  closeIssue: () => void;
  planDetails: Record<string, PlanDetail>;
  detailLoadingIds: Set<string>;
  detailErrors: Record<string, string>;
  getPlanDetail: (id: string) => Promise<PlanDetail | null>;
  setPlanStatus: (id: string, status: PlanStatus, completion?: number) => Promise<PlanDetail | null>;
  claimPlan: (input: ClaimPlanInput) => Promise<PlanDetail | null>;
  ideas: IdeaSummary[];
  ideasLoading: boolean;
  ideasError: string | null;
  refreshIdeas: () => Promise<void>;
  ideaDetails: Record<string, IdeaDetail>;
  ideaDetailLoadingIds: Set<string>;
  ideaDetailErrors: Record<string, string>;
  getIdeaDetail: (id: string) => Promise<IdeaDetail | null>;
  captureIdea: (title: string) => Promise<IdeaDetail>;
  addIdeaNote: (id: string, note: string) => Promise<IdeaDetail>;
  shapeIdea: (id: string, input: ShapeIdeaInput) => Promise<IdeaDetail>;
  dismissIdea: (id: string, reason: string) => Promise<IdeaDetail>;
  promoteIdea: (id: string, input: PromoteIdeaInput) => Promise<{idea: IdeaDetail; plan: PlanDetail}>;
  resolutions: ResolutionSummary[];
  resolutionsLoading: boolean;
  resolutionsError: string | null;
  refreshResolutions: () => Promise<void>;
  openResolutionId: number | null;
  openResolution: (id: number) => void;
  closeResolution: () => void;
  resolutionDetails: Record<number, ResolutionDetail>;
  resolutionDetailLoadingIds: Set<number>;
  resolutionDetailErrors: Record<number, string>;
  getResolutionDetail: (id: number) => Promise<ResolutionDetail | null>;
  openSectionDocument: SectionContent | null;
  sectionDocumentLoading: boolean;
  sectionDocumentError: string | null;
  openSectionFile: (sectionId: string, fileName: string) => Promise<void>;
  closeSectionDocument: () => void;
  lintReport: LintReport | null;
  lintLoading: boolean;
  lintError: string | null;
  refreshLint: () => Promise<void>;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  newIssueOpen: boolean;
  setNewIssueOpen: (open: boolean) => void;
  dagPreviewPlanId: string | null;
  setDagPreviewPlanId: (id: string | null) => void;
  pinnedDagPreviewPlanId: string | null;
  setPinnedDagPreviewPlanId: (id: string | null) => void;
  dagPreviewVisible: boolean;
  setDagPreviewVisible: (visible: boolean) => void;
  dagPreviewDocked: boolean;
  setDagPreviewDocked: (docked: boolean) => void;
  dagPreviewExpanded: boolean;
  setDagPreviewExpanded: (expanded: boolean) => void;
  planSort: PlanSort;
  setPlanSort: (sort: PlanSort) => void;
  filters: ActiveFilter[];
  addFilter: (filter: Omit<ActiveFilter, "id">) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;
  selectedIds: Set<string>;
  selectPlan: (id: string) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);
const WORKSPACE_STORAGE_KEY = "plansman.currentWorkspaceSlug";
const DAG_PREVIEW_VISIBLE_STORAGE_KEY = "plansman.dagPreviewVisible";
const DAG_PREVIEW_DOCKED_STORAGE_KEY = "plansman.dagPreviewDocked";
const DAG_PREVIEW_EXPANDED_STORAGE_KEY = "plansman.dagPreviewExpanded";
const PLAN_SORT_STORAGE_KEY = "plansman.planSort";

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ErrorEnvelope).error?.message === "string"
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const value = contentType.includes("application/json")
    ? (await response.json().catch(() => null)) as unknown
    : null;

  if (!response.ok) {
    const message = isErrorEnvelope(value)
      ? value.error.message
      : `${response.status} ${response.statusText}`.trim();

    throw new Error(message);
  }

  if (value === null) {
    throw new Error(`Expected JSON from ${response.url || "Plansman API"}, received ${contentType || "an empty response"}.`);
  }

  return value as T;
}

function sortPlans(plans: PlanSummary[], sort: PlanSort) {
  return [...plans].sort((a, b) => {
    const idCompare = sort === "latest" ? b.id - a.id : a.id - b.id;

    return idCompare || (a.subPlan ?? "").localeCompare(b.subPlan ?? "");
  });
}

function workspacePath(workspace: string, suffix: string) {
  return `/api/workspaces/${encodeURIComponent(workspace)}${suffix}`;
}

function planIdentity(plan: Pick<PlanSummary, "fileName">) {
  return plan.fileName.replace(/\.md$/, "");
}

function readStoredWorkspaceSlug() {
  try {
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredWorkspaceSlug(slug: string) {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, slug);
  } catch {
    // Ignore unavailable storage; workspace switching still works in memory.
  }
}

function readStoredDagPreviewVisible() {
  try {
    return window.localStorage.getItem(DAG_PREVIEW_VISIBLE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeStoredDagPreviewVisible(visible: boolean) {
  try {
    window.localStorage.setItem(DAG_PREVIEW_VISIBLE_STORAGE_KEY, String(visible));
  } catch {
    // Ignore unavailable storage; the toggle still works in memory.
  }
}

function readStoredDagPreviewExpanded() {
  try {
    return window.localStorage.getItem(DAG_PREVIEW_EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredDagPreviewExpanded(expanded: boolean) {
  try {
    window.localStorage.setItem(DAG_PREVIEW_EXPANDED_STORAGE_KEY, String(expanded));
  } catch {
    // Ignore unavailable storage; expansion still works in memory.
  }
}

function readStoredPlanSort(): PlanSort {
  try {
    const stored = window.localStorage.getItem(PLAN_SORT_STORAGE_KEY);
    return stored === "latest" ? "latest" : "plan-number";
  } catch {
    return "plan-number";
  }
}

function writeStoredPlanSort(sort: PlanSort) {
  try {
    window.localStorage.setItem(PLAN_SORT_STORAGE_KEY, sort);
  } catch {
    // Ignore unavailable storage; ordering still works in memory.
  }
}

function readStoredDagPreviewDocked() {
  try {
    return window.localStorage.getItem(DAG_PREVIEW_DOCKED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredDagPreviewDocked(docked: boolean) {
  try {
    window.localStorage.setItem(DAG_PREVIEW_DOCKED_STORAGE_KEY, String(docked));
  } catch {
    // Ignore unavailable storage; docking still works in memory.
  }
}

export function TrackerProvider({children}: {children: ReactNode}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [currentWorkspaceSlug, setCurrentWorkspaceSlugState] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [planDetails, setPlanDetails] = useState<Record<string, PlanDetail>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<Set<string>>(new Set());
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [lintReport, setLintReport] = useState<LintReport | null>(null);
  const [lintLoading, setLintLoading] = useState(true);
  const [lintError, setLintError] = useState<string | null>(null);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideaDetails, setIdeaDetails] = useState<Record<string, IdeaDetail>>({});
  const [ideaDetailLoadingIds, setIdeaDetailLoadingIds] = useState<Set<string>>(new Set());
  const [ideaDetailErrors, setIdeaDetailErrors] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<ResolutionSummary[]>([]);
  const [resolutionsLoading, setResolutionsLoading] = useState(true);
  const [resolutionsError, setResolutionsError] = useState<string | null>(null);
  const [openResolutionId, setOpenResolutionId] = useState<number | null>(null);
  const [resolutionDetails, setResolutionDetails] = useState<Record<number, ResolutionDetail>>({});
  const [resolutionDetailLoadingIds, setResolutionDetailLoadingIds] = useState<Set<number>>(new Set());
  const [resolutionDetailErrors, setResolutionDetailErrors] = useState<Record<number, string>>({});
  const [openSectionDocument, setOpenSectionDocument] = useState<SectionContent | null>(null);
  const [sectionDocumentLoading, setSectionDocumentLoading] = useState(false);
  const [sectionDocumentError, setSectionDocumentError] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [dagPreviewPlanId, setDagPreviewPlanId] = useState<string | null>(null);
  const [pinnedDagPreviewPlanId, setPinnedDagPreviewPlanId] = useState<string | null>(null);
  const [dagPreviewVisible, setDagPreviewVisibleState] = useState(readStoredDagPreviewVisible);
  const [dagPreviewDocked, setDagPreviewDockedState] = useState(readStoredDagPreviewDocked);
  const [dagPreviewExpanded, setDagPreviewExpandedState] = useState(readStoredDagPreviewExpanded);
  const [planSort, setPlanSortState] = useState<PlanSort>(readStoredPlanSort);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sortedPlans = useMemo(() => sortPlans(plans, planSort), [planSort, plans]);
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.slug === currentWorkspaceSlug) ?? null,
    [currentWorkspaceSlug, workspaces],
  );
  const sections = activeWorkspace?.sections ?? [];

  const refreshWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true);
    setWorkspacesError(null);

    try {
      const payload = await fetch("/api/workspaces").then((response) =>
        readJson<{workspaces: Workspace[]}>(response),
      );
      setWorkspaces(payload.workspaces);
      setCurrentWorkspaceSlugState((current) => {
        if (current && payload.workspaces.some((workspace) => workspace.slug === current)) return current;
        const stored = readStoredWorkspaceSlug();
        if (stored && payload.workspaces.some((workspace) => workspace.slug === stored)) return stored;
        return payload.workspaces[0]?.slug ?? null;
      });
    } catch (error) {
      setWorkspaces([]);
      setCurrentWorkspaceSlugState(null);
      setWorkspacesError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspacesLoading(false);
    }
  }, []);

  const refreshPlans = useCallback(async () => {
    if (!currentWorkspaceSlug) {
      setPlans([]);
      setPlansLoading(false);
      return;
    }

    setPlansLoading(true);
    setPlansError(null);

    try {
      const payload = await fetch(workspacePath(currentWorkspaceSlug, "/plans")).then((response) =>
        readJson<{plans: PlanSummary[]}>(response),
      );
      setPlans(payload.plans);
    } catch (error) {
      setPlans([]);
      setPlansError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlansLoading(false);
    }
  }, [currentWorkspaceSlug]);

  const refreshIdeas = useCallback(async () => {
    if (!currentWorkspaceSlug) {
      setIdeas([]);
      setIdeasLoading(false);
      return;
    }

    setIdeasLoading(true);
    setIdeasError(null);

    try {
      const payload = await fetch(workspacePath(currentWorkspaceSlug, "/ideas")).then((response) =>
        readJson<{ideas: IdeaSummary[]}>(response),
      );
      if (!Array.isArray(payload.ideas)) throw new Error("Ideas API response is missing the ideas list.");
      setIdeas([...payload.ideas].sort((a, b) => b.id - a.id));
    } catch (error) {
      setIdeas([]);
      setIdeasError(error instanceof Error ? error.message : String(error));
    } finally {
      setIdeasLoading(false);
    }
  }, [currentWorkspaceSlug]);

  const getIdeaDetail = useCallback(
    async (id: string) => {
      if (ideaDetails[id]) return ideaDetails[id];
      setIdeaDetailLoadingIds((prev) => new Set(prev).add(id));
      setIdeaDetailErrors((prev) => {
        const next = {...prev};
        delete next[id];
        return next;
      });

      try {
        if (!currentWorkspaceSlug) throw new Error("No workspace selected");
        const payload = await fetch(workspacePath(currentWorkspaceSlug, `/ideas/${encodeURIComponent(id)}`)).then(
          (response) => readJson<{idea: IdeaDetail}>(response),
        );
        setIdeaDetails((prev) => ({...prev, [id]: payload.idea}));
        return payload.idea;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setIdeaDetailErrors((prev) => ({...prev, [id]: message}));
        return null;
      } finally {
        setIdeaDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentWorkspaceSlug, ideaDetails],
  );

  const mutateIdea = useCallback(
    async (id: string, action: "notes" | "shape" | "dismiss", body: object) => {
      if (!currentWorkspaceSlug) throw new Error("No workspace selected");
      setIdeaDetailLoadingIds((prev) => new Set(prev).add(id));
      try {
        const payload = await fetch(workspacePath(currentWorkspaceSlug, `/ideas/${encodeURIComponent(id)}/${action}`), {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify(body),
        }).then((response) => readJson<{idea: IdeaDetail}>(response));
        setIdeaDetails((prev) => ({...prev, [id]: payload.idea}));
        await refreshIdeas();
        return payload.idea;
      } finally {
        setIdeaDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentWorkspaceSlug, refreshIdeas],
  );

  const captureIdea = useCallback(
    async (title: string) => {
      if (!currentWorkspaceSlug) throw new Error("No workspace selected");
      const payload = await fetch(workspacePath(currentWorkspaceSlug, "/ideas"), {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({title}),
      }).then((response) => readJson<{idea: IdeaDetail}>(response));
      setIdeaDetails((prev) => ({...prev, [payload.idea.summary.label]: payload.idea}));
      await refreshIdeas();
      return payload.idea;
    },
    [currentWorkspaceSlug, refreshIdeas],
  );

  const addIdeaNote = useCallback(
    (id: string, note: string) => mutateIdea(id, "notes", {note}),
    [mutateIdea],
  );

  const dismissIdea = useCallback(
    (id: string, reason: string) => mutateIdea(id, "dismiss", {reason}),
    [mutateIdea],
  );

  const shapeIdea = useCallback(
    (id: string, input: ShapeIdeaInput) => mutateIdea(id, "shape", input),
    [mutateIdea],
  );

  const promoteIdea = useCallback(
    async (id: string, input: PromoteIdeaInput) => {
      if (!currentWorkspaceSlug) throw new Error("No workspace selected");
      setIdeaDetailLoadingIds((prev) => new Set(prev).add(id));
      try {
        const payload = await fetch(workspacePath(currentWorkspaceSlug, `/ideas/${encodeURIComponent(id)}/promote`), {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify(input),
        }).then((response) => readJson<{idea: IdeaDetail; plan: PlanDetail}>(response));
        setIdeaDetails((prev) => ({...prev, [id]: payload.idea}));
        await Promise.all([refreshIdeas(), refreshPlans()]);
        return payload;
      } finally {
        setIdeaDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentWorkspaceSlug, refreshIdeas, refreshPlans],
  );

  const refreshLint = useCallback(async () => {
    if (!currentWorkspaceSlug) {
      setLintReport(null);
      setLintLoading(false);
      return;
    }

    setLintLoading(true);
    setLintError(null);

    try {
      const response = await fetch(workspacePath(currentWorkspaceSlug, "/lint"));
      const payload = await response.json().catch(() => null);

      if (!response.ok && isErrorEnvelope(payload)) {
        throw new Error(payload.error.message);
      }

      const report = payload as LintReport;
      setLintReport(report);
      if (!report.ok) setLintError(`${report.findings.length} finding(s)`);
    } catch (error) {
      setLintReport(null);
      setLintError(error instanceof Error ? error.message : String(error));
    } finally {
      setLintLoading(false);
    }
  }, [currentWorkspaceSlug]);

  const getPlanDetail = useCallback(
    async (id: string) => {
      if (planDetails[id]) return planDetails[id];

      setDetailLoadingIds((prev) => new Set(prev).add(id));
      setDetailErrors((prev) => {
        const next = {...prev};
        delete next[id];
        return next;
      });

      try {
        if (!currentWorkspaceSlug) throw new Error("No workspace selected");
        const payload = await fetch(workspacePath(currentWorkspaceSlug, `/plans/${encodeURIComponent(id)}`)).then((response) =>
          readJson<{plan: PlanDetail}>(response),
        );
        setPlanDetails((prev) => ({...prev, [id]: payload.plan}));
        return payload.plan;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDetailErrors((prev) => ({...prev, [id]: message}));
        return null;
      } finally {
        setDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentWorkspaceSlug, planDetails],
  );

  const setPlanStatus = useCallback(
    async (id: string, status: PlanStatus, completion?: number) => {
      setDetailLoadingIds((prev) => new Set(prev).add(id));

      try {
        if (!currentWorkspaceSlug) throw new Error("No workspace selected");
        const payload = await fetch(workspacePath(currentWorkspaceSlug, `/plans/${encodeURIComponent(id)}`), {
          method: "PATCH",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({status, ...(completion === undefined ? {} : {completion})}),
        }).then((response) => readJson<{plan: PlanDetail}>(response));

        setPlanDetails((prev) => ({...prev, [id]: payload.plan}));
        await refreshPlans();
        await refreshLint();
        return payload.plan;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDetailErrors((prev) => ({...prev, [id]: message}));
        return null;
      } finally {
        setDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentWorkspaceSlug, refreshLint, refreshPlans],
  );

  const claimPlan = useCallback(
    async ({title, target}: ClaimPlanInput) => {
      if (!currentWorkspaceSlug) throw new Error("No workspace selected");
      const payload = await fetch(workspacePath(currentWorkspaceSlug, "/plans"), {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({title, ...(target ? {target} : {})}),
      }).then((response) => readJson<{plan: PlanDetail}>(response));

      const id = payload.plan.summary.fileName.replace(/\.md$/, "");
      setPlanDetails((prev) => ({...prev, [id]: payload.plan}));
      await refreshPlans();
      await refreshLint();
      return payload.plan;
    },
    [currentWorkspaceSlug, refreshLint, refreshPlans],
  );

  const refreshResolutions = useCallback(async () => {
    if (!currentWorkspaceSlug) {
      setResolutions([]);
      setResolutionsLoading(false);
      return;
    }

    setResolutionsLoading(true);
    setResolutionsError(null);

    try {
      const payload = await fetch(workspacePath(currentWorkspaceSlug, "/resolutions")).then((response) =>
        readJson<{resolutions: ResolutionSummary[]}>(response),
      );
      setResolutions([...payload.resolutions].sort((a, b) => a.id - b.id));
    } catch (error) {
      setResolutions([]);
      setResolutionsError(error instanceof Error ? error.message : String(error));
    } finally {
      setResolutionsLoading(false);
    }
  }, [currentWorkspaceSlug]);

  const getResolutionDetail = useCallback(
    async (id: number) => {
      if (resolutionDetails[id]) return resolutionDetails[id];

      setResolutionDetailLoadingIds((prev) => new Set(prev).add(id));
      setResolutionDetailErrors((prev) => {
        const next = {...prev};
        delete next[id];
        return next;
      });

      try {
        if (!currentWorkspaceSlug) throw new Error("No workspace selected");
        const payload = await fetch(workspacePath(currentWorkspaceSlug, `/resolutions/${id}`)).then((response) =>
          readJson<{resolution: ResolutionDetail}>(response),
        );
        setResolutionDetails((prev) => ({...prev, [id]: payload.resolution}));
        return payload.resolution;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setResolutionDetailErrors((prev) => ({...prev, [id]: message}));
        return null;
      } finally {
        setResolutionDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentWorkspaceSlug, resolutionDetails],
  );

  const setCurrentWorkspaceSlug = useCallback((slug: string) => {
    writeStoredWorkspaceSlug(slug);
    setCurrentWorkspaceSlugState(slug);
  }, []);

  const toggleSection = useCallback(
    async (id: string, enabled: boolean) => {
      if (!currentWorkspaceSlug) throw new Error("No workspace selected");
      await fetch(workspacePath(currentWorkspaceSlug, `/sections/${encodeURIComponent(id)}`), {
        method: "PATCH",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({enabled}),
      }).then((response) => readJson(response));
      await refreshWorkspaces();
    },
    [currentWorkspaceSlug, refreshWorkspaces],
  );

  const openSectionFile = useCallback(
    async (sectionId: string, fileName: string) => {
      if (!currentWorkspaceSlug) return;
      setSectionDocumentLoading(true);
      setSectionDocumentError(null);

      try {
        const payload = await fetch(
          workspacePath(
            currentWorkspaceSlug,
            `/sections/${encodeURIComponent(sectionId)}/files/${encodeURIComponent(fileName)}`,
          ),
        ).then((response) => readJson<SectionContent>(response));
        setOpenSectionDocument(payload);
      } catch (error) {
        setSectionDocumentError(error instanceof Error ? error.message : String(error));
      } finally {
        setSectionDocumentLoading(false);
      }
    },
    [currentWorkspaceSlug],
  );

  const closeSectionDocument = useCallback(() => {
    setOpenSectionDocument(null);
    setSectionDocumentError(null);
  }, []);

  const openIssue = useCallback((id: string) => setOpenIssueId(id), []);
  const closeIssue = useCallback(() => setOpenIssueId(null), []);
  const openResolution = useCallback((id: number) => setOpenResolutionId(id), []);
  const closeResolution = useCallback(() => setOpenResolutionId(null), []);

  const addFilter = useCallback((filter: Omit<ActiveFilter, "id">) => {
    const id = `${filter.kind}-${filter.value}`;

    setFilters((prev) => (prev.some((item) => item.id === id) ? prev : [...prev, {...filter, id}]));
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== id));
  }, []);

  const clearFilters = useCallback(() => setFilters([]), []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  const selectPlan = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev;

      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const setPlanSort = useCallback((sort: PlanSort) => {
    setPlanSortState(sort);
    writeStoredPlanSort(sort);
  }, []);

  const setDagPreviewExpanded = useCallback((expanded: boolean) => {
    setDagPreviewExpandedState(expanded);
    writeStoredDagPreviewExpanded(expanded);
  }, []);

  const setDagPreviewVisible = useCallback((visible: boolean) => {
    setDagPreviewVisibleState(visible);
    writeStoredDagPreviewVisible(visible);
  }, []);

  const setDagPreviewDocked = useCallback((docked: boolean) => {
    setDagPreviewDockedState(docked);
    writeStoredDagPreviewDocked(docked);
  }, []);

  useEffect(() => {
    document.title = "Plansman";
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    setPlanDetails({});
    setIdeaDetails({});
    setIdeaDetailErrors({});
    setDetailErrors({});
    setOpenIssueId(null);
    setOpenResolutionId(null);
    setDagPreviewPlanId(null);
    setPinnedDagPreviewPlanId(null);
    setResolutionDetails({});
    setResolutionDetailErrors({});
    setOpenSectionDocument(null);
    if (currentWorkspaceSlug) {
      void refreshPlans();
      void refreshIdeas();
      void refreshLint();
      void refreshResolutions();
    }
  }, [currentWorkspaceSlug, refreshIdeas, refreshLint, refreshPlans, refreshResolutions]);

  useEffect(() => {
    if (!dagPreviewVisible || plans.length === 0) return;

    const planIds = new Set(plans.map(planIdentity));

    if (pinnedDagPreviewPlanId && !planIds.has(pinnedDagPreviewPlanId)) {
      setPinnedDagPreviewPlanId(null);
    }

    if (dagPreviewPlanId && !planIds.has(dagPreviewPlanId)) {
      setDagPreviewPlanId(null);
    }
  }, [dagPreviewPlanId, dagPreviewVisible, pinnedDagPreviewPlanId, plans]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }

      if (event.key === "Escape") {
        setDagPreviewPlanId(null);
        setPinnedDagPreviewPlanId(null);
        setSelectedIds(new Set());
        window.dispatchEvent(new CustomEvent("plansman:reset-interaction-state"));
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<TrackerContextValue>(
    () => ({
      workspaces,
      workspacesLoading,
      workspacesError,
      activeWorkspace,
      currentWorkspaceSlug,
      setCurrentWorkspaceSlug,
      refreshWorkspaces,
      sections,
      toggleSection,
      plans: sortedPlans,
      plansLoading,
      plansError,
      refreshPlans,
      openIssueId,
      openIssue,
      closeIssue,
      planDetails,
      detailLoadingIds,
      detailErrors,
      getPlanDetail,
      setPlanStatus,
      claimPlan,
      ideas,
      ideasLoading,
      ideasError,
      refreshIdeas,
      ideaDetails,
      ideaDetailLoadingIds,
      ideaDetailErrors,
      getIdeaDetail,
      captureIdea,
      addIdeaNote,
      shapeIdea,
      dismissIdea,
      promoteIdea,
      resolutions,
      resolutionsLoading,
      resolutionsError,
      refreshResolutions,
      openResolutionId,
      openResolution,
      closeResolution,
      resolutionDetails,
      resolutionDetailLoadingIds,
      resolutionDetailErrors,
      getResolutionDetail,
      openSectionDocument,
      sectionDocumentLoading,
      sectionDocumentError,
      openSectionFile,
      closeSectionDocument,
      lintReport,
      lintLoading,
      lintError,
      refreshLint,
      commandOpen,
      setCommandOpen,
      newIssueOpen,
      setNewIssueOpen,
      dagPreviewPlanId,
      setDagPreviewPlanId,
      pinnedDagPreviewPlanId,
      setPinnedDagPreviewPlanId,
      dagPreviewVisible,
      setDagPreviewVisible,
      dagPreviewDocked,
      setDagPreviewDocked,
      dagPreviewExpanded,
      setDagPreviewExpanded,
      planSort,
      setPlanSort,
      filters,
      addFilter,
      removeFilter,
      clearFilters,
      selectedIds,
      selectPlan,
      toggleSelected,
      clearSelection,
    }),
    [
      workspaces,
      workspacesLoading,
      workspacesError,
      activeWorkspace,
      currentWorkspaceSlug,
      setCurrentWorkspaceSlug,
      refreshWorkspaces,
      sections,
      toggleSection,
      sortedPlans,
      plansLoading,
      plansError,
      refreshPlans,
      openIssueId,
      openIssue,
      closeIssue,
      planDetails,
      detailLoadingIds,
      detailErrors,
      getPlanDetail,
      setPlanStatus,
      claimPlan,
      ideas,
      ideasLoading,
      ideasError,
      refreshIdeas,
      ideaDetails,
      ideaDetailLoadingIds,
      ideaDetailErrors,
      getIdeaDetail,
      captureIdea,
      addIdeaNote,
      shapeIdea,
      dismissIdea,
      promoteIdea,
      resolutions,
      resolutionsLoading,
      resolutionsError,
      refreshResolutions,
      openResolutionId,
      openResolution,
      closeResolution,
      resolutionDetails,
      resolutionDetailLoadingIds,
      resolutionDetailErrors,
      getResolutionDetail,
      openSectionDocument,
      sectionDocumentLoading,
      sectionDocumentError,
      openSectionFile,
      closeSectionDocument,
      lintReport,
      lintLoading,
      lintError,
      refreshLint,
      commandOpen,
      newIssueOpen,
      dagPreviewPlanId,
      pinnedDagPreviewPlanId,
      dagPreviewVisible,
      setDagPreviewVisible,
      dagPreviewDocked,
      setDagPreviewDocked,
      dagPreviewExpanded,
      planSort,
      setPlanSort,
      filters,
      addFilter,
      removeFilter,
      clearFilters,
      selectedIds,
      selectPlan,
      toggleSelected,
      clearSelection,
    ],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const context = useContext(TrackerContext);

  if (!context) {
    throw new Error("useTracker must be used within a TrackerProvider");
  }

  return context;
}
