import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import {buildPlanDag, type PlanDagData, type PlanDagEvent} from "../../../../src/core/plan-dag";
import {CompletionBar, StatusIcon} from "./atoms";
import {DagBranchFilter} from "./dag-branch-filter";
import {Iconify} from "../icons/iconify";
import {formatCompletion, STATE_MAP} from "../data/tracker";
import {useTracker} from "../state/tracker";

const PALETTE = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];
const OVERFLOW = "#898781";
const SELECTED_LABEL_LIMIT = 32;

type Point = {x: number; y: number};

function branchColor(data: PlanDagData, branchId: string) {
  const index = data.branches.findIndex((branch) => branch.id === branchId);
  return index >= 0 && index < PALETTE.length ? PALETTE[index] : OVERFLOW;
}

function selectedLabel(title: string) {
  if (title.length <= SELECTED_LABEL_LIMIT) return title;
  return `${title.slice(0, SELECTED_LABEL_LIMIT - 1)}...`;
}

function edgePath(from: Point, to: Point) {
  if (from.x === to.x) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  const span = Math.min(58, Math.max(24, to.y - from.y));
  if (to.x > from.x) {
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + span * 0.7} ${to.x} ${from.y + span * 0.3} ${to.x} ${from.y + span} L ${to.x} ${to.y}`;
  }

  return `M ${from.x} ${from.y} L ${from.x} ${to.y - span} C ${from.x} ${to.y - span * 0.3} ${to.x} ${to.y - span * 0.7} ${to.x} ${to.y}`;
}

function lineageOf(id: string, events: PlanDagEvent[]) {
  const parentsByChild = new Map(events.map((event) => [event.id, event.parents]));
  const childrenByParent = new Map<string, string[]>();

  for (const event of events) {
    for (const parent of event.parents) {
      const children = childrenByParent.get(parent) ?? [];
      children.push(event.id);
      childrenByParent.set(parent, children);
    }
  }

  const lineage = new Set([id]);
  const up = [id];
  const down = [id];

  while (up.length > 0) {
    const next = up.pop();
    if (!next) continue;
    for (const parent of parentsByChild.get(next) ?? []) {
      if (!lineage.has(parent)) {
        lineage.add(parent);
        up.push(parent);
      }
    }
  }

  while (down.length > 0) {
    const next = down.pop();
    if (!next) continue;
    for (const child of childrenByParent.get(next) ?? []) {
      if (!lineage.has(child)) {
        lineage.add(child);
        down.push(child);
      }
    }
  }

  return lineage;
}

// The events that sit directly on the selected branches. Ancestors on other
// branches (e.g. the main path a fork springs from) are intentionally excluded
// so only the selected branches light up; everything else dims.
// Returns null when nothing is selected (no dimming).
function eventsOnBranches(data: PlanDagData, selectedBranches: Set<string>): Set<string> | null {
  if (selectedBranches.size === 0) return null;

  const ids = new Set<string>();
  for (const event of data.events) {
    if (selectedBranches.has(event.branch)) ids.add(event.id);
  }

  return ids;
}

function useTimelineLayout(data: PlanDagData) {
  return useMemo(() => {
    const laneGap = 48;
    const rowGap = 132;
    const padLeft = 44;
    const padTop = 34;
    const nodeRadius = 7;
    const cardWidth = 420;
    const lanes = new Map(data.branches.map((branch, index) => [branch.id, index]));
    const graphRight = padLeft + Math.max(0, lanes.size - 1) * laneGap + 26;
    const cardX = graphRight + 18;
    const width = cardX + cardWidth + 26;
    const height = padTop + Math.max(0, data.events.length - 1) * rowGap + rowGap;
    const positions = new Map<string, Point>();

    data.events.forEach((event, index) => {
      positions.set(event.id, {
        x: padLeft + (lanes.get(event.branch) ?? 0) * laneGap,
        y: padTop + index * rowGap,
      });
    });

    return {cardWidth, cardX, height, nodeRadius, positions, rowGap, width};
  }, [data]);
}

function EmptyDag() {
  return (
    <div className="text-muted flex h-full items-center justify-center text-sm">
      No plans are available for this workspace.
    </div>
  );
}

export function PlanDagView() {
  const {
    activeWorkspace,
    dagPreviewPlanId,
    openIssue,
    pinnedDagPreviewPlanId,
    plans,
    plansError,
    plansLoading,
    selectedIds,
    setDagPreviewPlanId,
    toggleSelected,
  } = useTracker();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const data = useMemo(
    () => buildPlanDag(plans, `${activeWorkspace?.name ?? "Workspace"} follow-up DAG`),
    [activeWorkspace?.name, plans],
  );
  const visibleData = data;
  const layout = useTimelineLayout(visibleData);
  const selectionEvents = useMemo(() => eventsOnBranches(data, selectedBranches), [data, selectedBranches]);
  const externalFocus = visibleData.events.some((event) => event.id === pinnedDagPreviewPlanId)
    ? pinnedDagPreviewPlanId
    : visibleData.events.some((event) => event.id === dagPreviewPlanId)
      ? dagPreviewPlanId
      : null;
  // Hovering a node always spotlights its lineage. Otherwise a branch selection
  // softly dims everything outside it; failing that, a clicked/previewed node spotlights.
  const spotlight = hovered ?? (selectedBranches.size === 0 ? selected ?? externalFocus : null);
  const spotlightLineage = useMemo(
    () => (spotlight ? lineageOf(spotlight, visibleData.events) : null),
    [visibleData.events, spotlight],
  );
  const activeLineage = hovered ? spotlightLineage : selectionEvents ?? spotlightLineage;
  const softDim = Boolean(selectionEvents) && !hovered;
  const eventsById = useMemo(() => new Map(visibleData.events.map((event) => [event.id, event])), [visibleData.events]);

  const focusPlan = useCallback((id: string, shouldScroll: boolean) => {
    setSelected(id);
    setHovered(null);
    setDagPreviewPlanId(id);

    if (!shouldScroll) return;

    const point = layout.positions.get(id);
    const scrollElement = scrollRef.current;
    if (!point || !scrollElement) return;

    scrollElement.scrollTo({
      behavior: "smooth",
      left: Math.max(0, layout.cardX - 80),
      top: Math.max(0, point.y - 72),
    });
  }, [layout.cardX, layout.positions, setDagPreviewPlanId]);

  useEffect(() => {
    const handleFocusPlan = (event: Event) => {
      const id = (event as CustomEvent<{id?: string}>).detail?.id;
      if (!id) return;

      if (!visibleData.events.some((dagEvent) => dagEvent.id === id)) {
        setSelectedBranches(new Set());
        setPendingFocus(id);
        return;
      }

      focusPlan(id, true);
    };

    window.addEventListener("plansman:focus-dag-plan", handleFocusPlan);

    return () => window.removeEventListener("plansman:focus-dag-plan", handleFocusPlan);
  }, [focusPlan, visibleData.events]);

  useEffect(() => {
    if (!pendingFocus) return;
    if (!visibleData.events.some((event) => event.id === pendingFocus)) return;

    focusPlan(pendingFocus, true);
    setPendingFocus(null);
  }, [focusPlan, pendingFocus, visibleData.events]);

  useEffect(() => {
    const reset = () => {
      setHovered(null);
      setPendingFocus(null);
      setSelected(null);
      setSelectedBranches(new Set());
    };

    window.addEventListener("plansman:reset-interaction-state", reset);

    return () => window.removeEventListener("plansman:reset-interaction-state", reset);
  }, []);

  const applyBranchFilter = (next: Set<string>) => {
    setHovered(null);
    setSelected(null);
    setSelectedBranches(next);
  };

  const activeBranches = data.branches.filter((branch) => selectedBranches.has(branch.id));

  if (plansLoading) {
    return (
      <div className="text-muted flex h-full items-center justify-center text-sm" role="status">
        Loading DAG...
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
        Plans API error: {plansError}
      </div>
    );
  }

  if (data.events.length === 0) return <EmptyDag />;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="border-border/70 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <DagBranchFilter
          colorForBranch={(branchId) => branchColor(data, branchId)}
          data={data}
          selected={selectedBranches}
          onChange={applyBranchFilter}
        />
        {activeBranches.map((branch) => (
          <button
            key={branch.id}
            className="border-accent/60 bg-accent/10 text-foreground hover:bg-accent/15 inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors"
            title={`Remove ${branch.name}`}
            type="button"
            onClick={() => {
              const next = new Set(selectedBranches);
              next.delete(branch.id);
              applyBranchFilter(next);
            }}
            onMouseEnter={() => {
              const first = data.events.find((event) => event.branch === branch.id);
              setHovered(first?.id ?? null);
            }}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="size-2 rounded-full" style={{backgroundColor: branchColor(data, branch.id)}} />
            <span className="max-w-40 truncate">{branch.name.replace(" fork from ", " · ")}</span>
            <Iconify className="text-muted size-3" icon="xmark" />
          </button>
        ))}
        {selectedBranches.size > 0 ? (
          <button
            className="border-border hover:bg-surface-secondary ml-auto inline-flex h-7 items-center rounded-full border px-3 text-xs text-muted transition-colors"
            type="button"
            onClick={() => applyBranchFilter(new Set())}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 py-5">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-foreground text-base font-semibold">{data.title}</h1>
          <span className="text-muted text-xs">{data.events.length} plans</span>
          {selectionEvents ? (
            <span className="text-muted text-xs">
              {selectionEvents.size} highlighted · {selectedBranches.size} branch filter{selectedBranches.size === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <svg
          className="block"
          height={layout.height}
          role="img"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          onMouseLeave={() => setHovered(null)}
        >
          <title>{visibleData.title}</title>
          <g>
            {visibleData.branches.map((branch) => {
              const branchEvents = visibleData.events.filter((event) => event.branch === branch.id);
              const first = branchEvents[0] ? layout.positions.get(branchEvents[0].id) : null;
              const last = branchEvents[branchEvents.length - 1]
                ? layout.positions.get(branchEvents[branchEvents.length - 1].id)
                : null;

              if (!first || !last || first.y === last.y) return null;

              return (
                <line
                  key={branch.id}
                  opacity={0.18}
                  stroke={branchColor(data, branch.id)}
                  strokeDasharray="3 7"
                  strokeLinecap="round"
                  strokeWidth={2}
                  x1={first.x}
                  x2={last.x}
                  y1={first.y}
                  y2={last.y}
                />
              );
            })}
          </g>
          <g>
            {visibleData.events.flatMap((event) => {
              const to = layout.positions.get(event.id);
              if (!to) return [];

              return event.parents.map((parentId) => {
                const from = layout.positions.get(parentId);
                const parent = eventsById.get(parentId);
                if (!from || !parent) return null;
                const active = !activeLineage || (activeLineage.has(parentId) && activeLineage.has(event.id));

                return (
                  <path
                    key={`${parentId}-${event.id}`}
                    d={edgePath(from, to)}
                    fill="none"
                    opacity={active ? 0.95 : softDim ? 0.34 : 0.22}
                    stroke={branchColor(data, event.branch)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                  />
                );
              });
            })}
          </g>

          <g>
            {visibleData.events.map((event) => {
              const point = layout.positions.get(event.id);
              if (!point) return null;
              const active = !activeLineage || activeLineage.has(event.id);
              const color = branchColor(data, event.branch);
              const isFocused = selected === event.id;
              const isPreviewed = dagPreviewPlanId === event.id || pinnedDagPreviewPlanId === event.id || hovered === event.id;
              const isMarked = selectedIds.has(event.id) || isFocused;

              return (
                <g
                  key={event.id}
                  opacity={active ? 1 : softDim ? 0.42 : 0.16}
                  onMouseEnter={() => {
                    setHovered(event.id);
                    setDagPreviewPlanId(event.id);
                  }}
                >
                  <line
                    opacity={active ? 0.42 : softDim ? 0.28 : 0.12}
                    stroke={color}
                    strokeLinecap="round"
                    strokeWidth={1.5}
                    x1={point.x + layout.nodeRadius + 5}
                    x2={layout.cardX - 8}
                    y1={point.y}
                    y2={point.y}
                  />
                  <g
                    aria-label={`Focus ${event.label}`}
                    className="cursor-pointer outline-none"
                    role="button"
                    tabIndex={0}
                    onClick={() => focusPlan(event.id, true)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        focusPlan(event.id, true);
                      }
                    }}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="var(--background)"
                      r={isMarked || isPreviewed ? layout.nodeRadius + 6 : layout.nodeRadius + 3}
                      stroke={isMarked ? "var(--accent)" : isPreviewed ? "var(--foreground)" : "transparent"}
                      strokeWidth={isMarked || isPreviewed ? 2 : 0}
                    />
                    {isMarked ? (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        fill="none"
                        r={layout.nodeRadius + 10}
                        stroke="var(--accent)"
                        strokeOpacity={0.36}
                        strokeWidth={2}
                      />
                    ) : null}
                    <circle cx={point.x} cy={point.y} fill={color} r={layout.nodeRadius} />
                  </g>
                  {isMarked ? (
                    <g opacity={0.68} pointerEvents="none">
                      <rect
                        fill="var(--surface)"
                        height={24}
                        rx={6}
                        stroke="var(--border)"
                        strokeOpacity={0.65}
                        width={Math.min(240, Math.max(90, selectedLabel(event.title).length * 6.4 + 20))}
                        x={point.x + 16}
                        y={point.y - 34}
                      />
                      <text
                        dominantBaseline="middle"
                        fill="var(--muted)"
                        fontSize={11}
                        fontWeight={600}
                        x={point.x + 26}
                        y={point.y - 22}
                      >
                        {selectedLabel(event.title)}
                      </text>
                    </g>
                  ) : null}
                  <foreignObject
                    height={layout.rowGap - 16}
                    width={layout.cardWidth}
                    x={layout.cardX}
                    y={point.y - 18}
                  >
                    <div
                      className={[
                        "bg-surface hover:bg-surface-secondary h-full cursor-pointer overflow-hidden rounded-md border p-3 transition-colors",
                        isMarked
                          ? "border-accent shadow-overlay"
                          : isPreviewed
                            ? "border-accent/70 bg-surface-secondary shadow-overlay"
                            : "border-border",
                      ].join(" ")}
                      role="button"
                      tabIndex={0}
                      onClick={(clickEvent) => {
                        if (clickEvent.metaKey || clickEvent.ctrlKey) {
                          clickEvent.preventDefault();
                          toggleSelected(event.id);
                          return;
                        }

                        openIssue(event.id);
                      }}
                      onKeyDown={(keyboardEvent) => {
                        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                          keyboardEvent.preventDefault();
                          openIssue(event.id);
                        }
                      }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-muted font-mono text-[11px] tabular-nums">{event.label}</span>
                        <StatusIcon className="shrink-0" size={14} state={event.status} />
                        <span className="text-muted truncate text-[11px]">{STATE_MAP[event.status].name}</span>
                        <span className="text-muted ml-auto truncate text-[11px]">{event.fileName}</span>
                      </div>
                      <h2 className="text-foreground line-clamp-2 text-sm font-semibold leading-snug">{event.title}</h2>
                      <p className="text-muted mt-1 truncate text-xs">{event.desc}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <CompletionBar completion={event.completion} />
                        <span className="text-muted text-[11px] tabular-nums">
                          {formatCompletion(event.completion)}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted">
                          <span className="size-1.5 rounded-full" style={{backgroundColor: color}} />
                          {data.branches.find((branch) => branch.id === event.branch)?.name ?? event.branch}
                        </span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
