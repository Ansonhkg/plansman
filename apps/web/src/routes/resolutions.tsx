import {useMemo} from "react";

import {RESOLUTION_GROUP_ORDER, type ResolutionSummary, type ResolutionStatus} from "../data/tracker";
import {useTracker} from "../state/tracker";
import {ResolutionDetailPanel} from "../components/resolution-detail-panel";

const STATUS_LABELS: Record<ResolutionStatus, string> = {
  open: "Open",
  agreed: "Agreed",
  withdrawn: "Withdrawn",
};

function ResolutionRow({resolution}: {resolution: ResolutionSummary}) {
  const {openResolution} = useTracker();

  return (
    <button
      className="tracker-row border-border/60 hover:bg-surface-secondary grid w-full grid-cols-[72px_minmax(0,1fr)_160px] items-center gap-3 border-b px-4 py-3 text-left outline-none transition-colors data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-accent"
      type="button"
      onClick={() => openResolution(resolution.id)}
    >
      <span className="text-muted font-mono text-xs tabular-nums">#{resolution.id}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{resolution.title}</span>
        <span className="text-muted mt-0.5 block truncate text-xs">
          {resolution.plans.join(", ")} - {resolution.parties.join(", ")}
        </span>
      </span>
      <span className="text-muted justify-self-end text-xs">{resolution.created}</span>
    </button>
  );
}

export function ResolutionsRoute() {
  const {resolutions, resolutionsError, resolutionsLoading} = useTracker();

  const grouped = useMemo(
    () =>
      RESOLUTION_GROUP_ORDER.map((status) => ({
        status,
        resolutions: resolutions.filter((resolution) => resolution.status === status),
      })).filter((group) => group.resolutions.length > 0),
    [resolutions],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-border/70 flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Resolutions</h1>
        </div>
        <span className="text-muted text-xs tabular-nums">
          {resolutions.filter((resolution) => resolution.status === "open").length} open
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {resolutionsLoading ? (
          <div className="text-muted flex h-32 items-center justify-center text-sm" role="status">
            Loading resolutions...
          </div>
        ) : resolutionsError ? (
          <div className="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
            Resolutions API error: {resolutionsError}
          </div>
        ) : grouped.length > 0 ? (
          grouped.map((group) => (
            <section key={group.status}>
              <div className="bg-background/80 border-border/70 sticky top-0 z-10 flex h-9 items-center gap-2 border-b px-4">
                <h2 className="text-muted text-xs font-semibold uppercase tracking-normal">{STATUS_LABELS[group.status]}</h2>
                <span className="text-muted text-xs tabular-nums">{group.resolutions.length}</span>
              </div>
              {group.resolutions.map((resolution) => (
                <ResolutionRow key={resolution.id} resolution={resolution} />
              ))}
            </section>
          ))
        ) : (
          <div className="text-muted flex h-32 items-center justify-center text-sm">
            No resolutions for this workspace.
          </div>
        )}
      </div>

      <ResolutionDetailPanel />
    </div>
  );
}
