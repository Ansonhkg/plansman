import {useEffect, useMemo, useRef, useState} from "react";

import {Button} from "@heroui/react";

import {buildPlanDag, type PlanDagData, type PlanDagEvent} from "../../../../src/core/plan-dag";
import {Iconify} from "../icons/iconify";
import {formatCompletion, STATE_MAP} from "../data/tracker";
import {useTracker} from "../state/tracker";

const PALETTE = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];
const OVERFLOW = "#898781";
const POSITION_STORAGE_KEY = "plansman.dagMinimapPosition";
const SIZE_STORAGE_KEY = "plansman.dagMinimapSize";
const ZOOM_STORAGE_KEY = "plansman.dagMinimapZoom";
const COMPACT_LABEL_LIMIT = 30;
const EXPANDED_LABEL_LIMIT = 54;
const MIN_PANEL_SIZE = {height: 260, width: 280};
const MAX_DOCKED_WIDTH = 560;
const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.5;

type Point = {x: number; y: number};
type PanelPosition = {x: number; y: number};
type PanelSize = {height: number; width: number};
type ResizeCorner = "ne" | "nw" | "se" | "sw";
type DagMiniMapPanelMode = "docked" | "floating";

function defaultPanelSize(expanded: boolean): PanelSize {
  return {
    height: expanded ? Math.min(window.innerHeight - 32, 720) : 390,
    width: expanded ? 560 : 320,
  };
}

function clampSize(size: PanelSize): PanelSize {
  return {
    height: Math.min(Math.max(MIN_PANEL_SIZE.height, size.height), Math.max(MIN_PANEL_SIZE.height, window.innerHeight - 16)),
    width: Math.min(Math.max(MIN_PANEL_SIZE.width, size.width), Math.max(MIN_PANEL_SIZE.width, window.innerWidth - 16)),
  };
}

function clampDockedSize(size: PanelSize): PanelSize {
  const maxWidth = Math.min(MAX_DOCKED_WIDTH, Math.max(MIN_PANEL_SIZE.width, window.innerWidth - 16));

  return {
    height: Math.min(Math.max(MIN_PANEL_SIZE.height, size.height), Math.max(MIN_PANEL_SIZE.height, window.innerHeight - 16)),
    width: Math.min(Math.max(MIN_PANEL_SIZE.width, size.width), maxWidth),
  };
}

function defaultPosition(expanded: boolean, size = defaultPanelSize(expanded)): PanelPosition {
  return {
    x: Math.max(16, window.innerWidth - size.width - 16),
    y: expanded ? 64 : 96,
  };
}

function clampPosition(position: PanelPosition, size: PanelSize): PanelPosition {
  return {
    x: Math.min(Math.max(8, position.x), Math.max(8, window.innerWidth - size.width - 8)),
    y: Math.min(Math.max(8, position.y), Math.max(8, window.innerHeight - size.height - 8)),
  };
}

function readStoredSize(expanded: boolean): PanelSize {
  try {
    const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return defaultPanelSize(expanded);
    const value = JSON.parse(raw) as Partial<PanelSize>;
    if (typeof value.width !== "number" || typeof value.height !== "number") return defaultPanelSize(expanded);
    return clampSize({height: value.height, width: value.width});
  } catch {
    return defaultPanelSize(expanded);
  }
}

function writeStoredSize(size: PanelSize) {
  try {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Ignore unavailable storage; resizing still works in memory.
  }
}

function readStoredPosition(expanded: boolean, size: PanelSize): PanelPosition {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return defaultPosition(expanded, size);
    const value = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof value.x !== "number" || typeof value.y !== "number") return defaultPosition(expanded, size);
    return clampPosition({x: value.x, y: value.y}, size);
  } catch {
    return defaultPosition(expanded, size);
  }
}

function writeStoredPosition(position: PanelPosition) {
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Ignore unavailable storage; dragging still works in memory.
  }
}

function clampZoom(zoom: number) {
  return Math.min(Math.max(ZOOM_MIN, zoom), ZOOM_MAX);
}

function readStoredZoom() {
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return 1;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 1;
    return clampZoom(value);
  } catch {
    return 1;
  }
}

function writeStoredZoom(zoom: number) {
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // Ignore unavailable storage; zoom still works in memory.
  }
}

function branchColor(data: PlanDagData, branchId: string) {
  const index = data.branches.findIndex((branch) => branch.id === branchId);
  return index >= 0 && index < PALETTE.length ? PALETTE[index] : OVERFLOW;
}

function edgePath(from: Point, to: Point) {
  if (from.x === to.x) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  const span = Math.min(42, Math.max(14, to.y - from.y));
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

function useMiniLayout(data: PlanDagData, expanded: boolean) {
  return useMemo(() => {
    const laneGap = expanded ? 44 : 28;
    const availableHeight = expanded ? 520 : 260;
    const rowGap = Math.max(expanded ? 14 : 10, Math.min(expanded ? 26 : 18, availableHeight / Math.max(data.events.length, 1)));
    const padLeft = 20;
    const padTop = 20;
    const nodeRadius = expanded ? 4 : 3;
    const lanes = new Map(data.branches.map((branch, index) => [branch.id, index]));
    const graphWidth = Math.max(0, data.branches.length - 1) * laneGap;
    const width = Math.max(expanded ? 500 : 300, padLeft * 2 + graphWidth);
    const height = padTop * 2 + Math.max(0, data.events.length - 1) * rowGap;
    const graphLeft = (width - graphWidth) / 2;
    const positions = new Map<string, Point>();

    data.events.forEach((event, index) => {
      positions.set(event.id, {
        x: graphLeft + (lanes.get(event.branch) ?? 0) * laneGap,
        y: padTop + index * rowGap,
      });
    });

    return {height, nodeRadius, positions, width};
  }, [data, expanded]);
}

function truncateTitle(title: string, expanded: boolean) {
  const limit = expanded ? EXPANDED_LABEL_LIMIT : COMPACT_LABEL_LIMIT;
  if (title.length <= limit) return title;
  return `${title.slice(0, limit - 1)}...`;
}

function labelMetrics(title: string, expanded: boolean) {
  const label = truncateTitle(title, expanded);

  return {
    label,
    width: Math.min(expanded ? 320 : 210, Math.max(86, label.length * 6.2 + 20)),
  };
}

function labelPosition(point: Point, width: number, layoutWidth: number, layoutHeight: number) {
  return {
    x: Math.min(point.x + 12, layoutWidth - width - 4),
    y: Math.max(6, Math.min(point.y - 15, layoutHeight - 28)),
  };
}

function requestDagPlanFocus(id: string) {
  window.dispatchEvent(new CustomEvent("plansman:focus-dag-plan", {detail: {id}}));
}

export function DagMiniMapPanel({mode}: {mode: DagMiniMapPanelMode}) {
  const {
    activeWorkspace,
    dagPreviewDocked,
    dagPreviewExpanded,
    dagPreviewPlanId,
    dagPreviewVisible,
    pinnedDagPreviewPlanId,
    plans,
    selectPlan,
    selectedIds,
    setDagPreviewDocked,
    setDagPreviewExpanded,
    setDagPreviewPlanId,
    setDagPreviewVisible,
    setPinnedDagPreviewPlanId,
  } = useTracker();
  const diagramScrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PanelSize>(() => readStoredSize(false));
  const [position, setPosition] = useState<PanelPosition>(() => readStoredPosition(false, readStoredSize(false)));
  const [zoom, setZoom] = useState(readStoredZoom);
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
  const isDocked = mode === "docked";
  const layoutExpanded = isDocked || dagPreviewExpanded;
  const data = useMemo(
    () => buildPlanDag(plans, `${activeWorkspace?.name ?? "Workspace"} DAG`),
    [activeWorkspace?.name, plans],
  );
  const eventIds = useMemo(() => new Set(data.events.map((event) => event.id)), [data.events]);
  const fallbackFocus =
    data.events.find((event) => selectedIds.has(event.id))?.id ?? data.events[0]?.id ?? null;
  const focused = [hoveredPlanId, dagPreviewPlanId, pinnedDagPreviewPlanId, fallbackFocus].find(
    (id): id is string => Boolean(id && eventIds.has(id)),
  ) ?? null;
  const layout = useMiniLayout(data, layoutExpanded);
  const focusedEvent = focused ? data.events.find((event) => event.id === focused) : null;
  const focusedPoint = focused ? layout.positions.get(focused) : null;
  const hoveredEvent = hoveredPlanId ? data.events.find((event) => event.id === hoveredPlanId) : null;
  const hoveredPoint = hoveredPlanId ? layout.positions.get(hoveredPlanId) : null;
  const displayedEvent = hoveredEvent ?? focusedEvent;
  const displayedPoint = hoveredPoint ?? focusedPoint;
  const lineageFocus = hoveredPlanId ?? focused;
  const lineage = lineageFocus ? lineageOf(lineageFocus, data.events) : null;

  useEffect(() => {
    if (!focusedPoint) return;

    const container = diagramScrollRef.current;
    if (!container) return;

    container.scrollTo({
      behavior: "smooth",
      left: Math.max(0, focusedPoint.x * zoom - container.clientWidth / 2),
      top: Math.max(0, focusedPoint.y * zoom - container.clientHeight / 2),
    });
  }, [focusedPoint?.x, focusedPoint?.y, zoom]);

  useEffect(() => {
    if (!dagPreviewVisible || isDocked) return;

    setPosition((current) => {
      const clamped = clampPosition(current, clampSize(size));
      if (clamped.x === current.x && clamped.y === current.y) return current;
      writeStoredPosition(clamped);
      return clamped;
    });
  }, [dagPreviewVisible, isDocked, size]);

  useEffect(() => {
    const reset = () => setHoveredPlanId(null);

    window.addEventListener("plansman:reset-interaction-state", reset);

    return () => window.removeEventListener("plansman:reset-interaction-state", reset);
  }, []);

  if (!dagPreviewVisible) return null;
  if (!focused || !focusedEvent) return null;

  const isPinned = pinnedDagPreviewPlanId === focused;
  const clampedSize = isDocked ? clampDockedSize(size) : clampSize(size);
  const clampedPosition = clampPosition(position, clampedSize);
  const displayedLabel = displayedEvent ? labelMetrics(displayedEvent.title, layoutExpanded) : null;
  const displayedLabelPosition = displayedPoint && displayedLabel
    ? labelPosition(displayedPoint, displayedLabel.width, layout.width, layout.height)
    : null;
  const labelIsHovered = Boolean(hoveredPlanId && displayedEvent?.id === hoveredPlanId);
  const labelIsLivePreview = labelIsHovered || Boolean(!pinnedDagPreviewPlanId && displayedEvent?.id === dagPreviewPlanId);
  const zoomPercent = Math.round(zoom * 100);

  const updateZoom = (nextZoom: number) => {
    const value = clampZoom(Math.round(nextZoom * 100) / 100);
    setZoom(value);
    writeStoredZoom(value);
  };

  const focusMiniNode = (id: string) => {
    selectPlan(id);
    setDagPreviewPlanId(id);
    setPinnedDagPreviewPlanId(id);
    requestDagPlanFocus(id);
  };

  const previewMiniNode = (id: string) => {
    setHoveredPlanId(id);
    setDagPreviewPlanId(id);
  };

  const toggleDocked = () => {
    const nextDocked = !dagPreviewDocked;
    const nextSize = nextDocked
      ? clampDockedSize({height: window.innerHeight - 88, width: Math.max(360, size.width)})
      : clampSize(defaultPanelSize(false));
    const nextPosition = clampPosition(position, nextSize);

    setDagPreviewDocked(nextDocked);
    setDagPreviewExpanded(false);
    setSize(nextSize);
    setPosition(nextPosition);
    writeStoredSize(nextSize);
    writeStoredPosition(nextPosition);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDocked) return;
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = clampedPosition;

    event.currentTarget.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const next = clampPosition(
        {
          x: startPosition.x + moveEvent.clientX - startX,
          y: startPosition.y + moveEvent.clientY - startY,
        },
        clampedSize,
      );
      setPosition(next);
    };
    const up = (upEvent: PointerEvent) => {
      const next = clampPosition(
        {
          x: startPosition.x + upEvent.clientX - startX,
          y: startPosition.y + upEvent.clientY - startY,
        },
        clampedSize,
      );
      setPosition(next);
      writeStoredPosition(next);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (corner: ResizeCorner, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = clampedPosition;
    const startSize = clampedSize;
    const pullsLeft = corner.includes("w") || isDocked;
    const pullsTop = !isDocked && corner.includes("n");

    event.currentTarget.setPointerCapture(event.pointerId);

    const nextFrame = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextSize = (isDocked ? clampDockedSize : clampSize)({
        height: isDocked ? startSize.height : startSize.height + (pullsTop ? -deltaY : deltaY),
        width: startSize.width + (pullsLeft ? -deltaX : deltaX),
      });
      const nextPosition = clampPosition(
        {
          x: pullsLeft ? startPosition.x + startSize.width - nextSize.width : startPosition.x,
          y: pullsTop ? startPosition.y + startSize.height - nextSize.height : startPosition.y,
        },
        nextSize,
      );

      setSize(nextSize);
      setPosition(nextPosition);
      return {nextPosition, nextSize};
    };

    const move = (moveEvent: PointerEvent) => {
      nextFrame(moveEvent);
    };
    const up = (upEvent: PointerEvent) => {
      const {nextPosition, nextSize} = nextFrame(upEvent);
      writeStoredSize(nextSize);
      writeStoredPosition(nextPosition);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startDiagramPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest("[data-dag-node]")) return;

    const viewport = diagramScrollRef.current;
    if (!viewport) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = viewport.scrollLeft;
    const startScrollTop = viewport.scrollTop;

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    const move = (moveEvent: PointerEvent) => {
      viewport.scrollLeft = startScrollLeft - (moveEvent.clientX - startX);
      viewport.scrollTop = startScrollTop - (moveEvent.clientY - startY);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const panel = (
    <aside
      className={[
        "bg-background/95 flex flex-col p-3 backdrop-blur-md",
        isDocked
          ? "border-border/80 relative h-full shrink-0 self-stretch border-l"
          : "border-border/80 shadow-overlay fixed z-40 rounded-lg border",
      ].join(" ")}
      style={
        isDocked
          ? {width: clampedSize.width}
          : {height: clampedSize.height, left: clampedPosition.x, top: clampedPosition.y, width: clampedSize.width}
      }
    >
      <div
        className={[
          "mb-2 flex touch-none items-center gap-2",
          isDocked ? "" : "cursor-grab active:cursor-grabbing",
        ].join(" ")}
        title={isDocked ? undefined : "Drag to move. Double-click to reset position."}
        onDoubleClick={() => {
          const nextSize = isDocked ? clampDockedSize(defaultPanelSize(layoutExpanded)) : clampSize(defaultPanelSize(layoutExpanded));
          const nextPosition = defaultPosition(layoutExpanded, nextSize);
          setSize(nextSize);
          setPosition(nextPosition);
          writeStoredSize(nextSize);
          writeStoredPosition(nextPosition);
        }}
        onPointerDown={startDrag}
      >
        <span className="text-foreground text-sm font-medium">DAG position</span>
        <span className="text-muted min-w-0 flex-1 truncate font-mono text-[11px]">{focusedEvent.label}</span>
        <Button
          isIconOnly
          aria-label="Zoom out DAG"
          size="sm"
          variant="ghost"
          onPointerDown={(event) => event.stopPropagation()}
          onPress={() => updateZoom(zoom - ZOOM_STEP)}
        >
          <Iconify className="size-3.5" icon="minus" />
        </Button>
        <button
          className="text-muted hover:text-foreground h-7 min-w-10 rounded-md px-1.5 text-[11px] tabular-nums transition-colors"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => updateZoom(1)}
        >
          {zoomPercent}%
        </button>
        <Button
          isIconOnly
          aria-label="Zoom in DAG"
          size="sm"
          variant="ghost"
          onPointerDown={(event) => event.stopPropagation()}
          onPress={() => updateZoom(zoom + ZOOM_STEP)}
        >
          <Iconify className="size-3.5" icon="plus" />
        </Button>
        <Button
          isIconOnly
          aria-label={isPinned ? "Unpin DAG panel" : "Pin DAG panel"}
          size="sm"
          variant={isPinned ? "secondary" : "ghost"}
          onPointerDown={(event) => event.stopPropagation()}
          onPress={() => setPinnedDagPreviewPlanId(isPinned ? null : focused)}
        >
          <Iconify className="size-3.5" icon={isPinned ? "pin-fill" : "pin"} />
        </Button>
        <Button
          isIconOnly
          aria-label={isDocked ? "Float DAG panel" : "Dock DAG panel"}
          size="sm"
          variant="ghost"
          onPointerDown={(event) => event.stopPropagation()}
          onPress={toggleDocked}
        >
          <Iconify className="size-3.5" icon="square" />
        </Button>
        <Button
          isIconOnly
          aria-label="Close DAG panel"
          size="sm"
          variant="ghost"
          onPointerDown={(event) => event.stopPropagation()}
          onPress={() => {
            setDagPreviewPlanId(null);
            setPinnedDagPreviewPlanId(null);
            setDagPreviewDocked(false);
            setDagPreviewVisible(false);
          }}
        >
          <Iconify className="size-3.5" icon="xmark" />
        </Button>
      </div>

      <div
        ref={diagramScrollRef}
        className="scrollbar-none bg-surface/80 border-border/60 min-h-0 w-full flex-1 cursor-grab overflow-auto rounded-md border p-2 active:cursor-grabbing"
        onPointerDown={startDiagramPan}
      >
        <svg
          className="block min-h-[160px]"
          height={layout.height}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{
            height: Math.max(160, layout.height * zoom),
            width: layout.width * zoom,
          }}
          onMouseLeave={() => setHoveredPlanId(null)}
        >
          <title>Mini DAG overview</title>
          <g>
            {data.events.flatMap((event) => {
              const to = layout.positions.get(event.id);
              if (!to) return [];

              return event.parents.map((parentId) => {
                const from = layout.positions.get(parentId);
                if (!from) return null;
                const active = !lineage || (lineage.has(parentId) && lineage.has(event.id));

                return (
                  <path
                    key={`${parentId}-${event.id}`}
                    d={edgePath(from, to)}
                    fill="none"
                    opacity={active ? 0.95 : 0.16}
                    stroke={branchColor(data, event.branch)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={active ? 2.4 : 1.4}
                  />
                );
              });
            })}
          </g>
          <g>
            {data.events.map((event) => {
              const point = layout.positions.get(event.id);
              if (!point) return null;
              const isFocused = event.id === focused;
              const isHovered = event.id === hoveredPlanId;
              const isSelected = selectedIds.has(event.id);
              const active = !lineage || lineage.has(event.id);

              return (
                <g
                  key={event.id}
                  opacity={active ? 1 : 0.22}
                >
                  <circle
                    className="cursor-pointer outline-none"
                    cx={point.x}
                    cy={point.y}
                    data-dag-node="true"
                    fill="transparent"
                    r={layout.nodeRadius + 8}
                    role="button"
                    tabIndex={0}
                    onClick={() => focusMiniNode(event.id)}
                    onMouseEnter={() => previewMiniNode(event.id)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        focusMiniNode(event.id);
                      }
                    }}
                  >
                    <title>{event.title}</title>
                  </circle>
                  {isSelected ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="none"
                      pointerEvents="none"
                      r={layout.nodeRadius + 8}
                      stroke="var(--accent)"
                      strokeOpacity={0.75}
                      strokeWidth={2}
                    />
                  ) : null}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    fill={isFocused ? "var(--foreground)" : branchColor(data, event.branch)}
                    pointerEvents="none"
                    r={isFocused || isHovered || isSelected ? layout.nodeRadius + 2.5 : layout.nodeRadius}
                    stroke={isSelected ? "var(--accent)" : isFocused || isHovered ? branchColor(data, event.branch) : "transparent"}
                    strokeWidth={isFocused || isHovered || isSelected ? 2 : 0}
                  />
                </g>
              );
            })}
          </g>
          <g opacity={0.68}>
            {data.events.map((event) => {
              if (!selectedIds.has(event.id) || event.id === hoveredPlanId || event.id === focused) return null;
              const point = layout.positions.get(event.id);
              if (!point) return null;
              const metrics = labelMetrics(event.title, layoutExpanded);
              const position = labelPosition(point, metrics.width, layout.width, layout.height);

              return (
                <g key={`selected-label-${event.id}`} pointerEvents="none">
                  <rect
                    fill="var(--surface)"
                    height={24}
                    opacity={0.55}
                    rx={6}
                    stroke="var(--border)"
                    strokeOpacity={0.6}
                    width={metrics.width}
                    x={position.x}
                    y={position.y}
                  />
                  <text
                    dominantBaseline="middle"
                    fill="var(--muted)"
                    fontSize={layoutExpanded ? 12 : 11}
                    fontWeight={600}
                    x={position.x + 10}
                    y={position.y + 12}
                  >
                    {metrics.label}
                  </text>
                </g>
              );
            })}
          </g>
          {displayedPoint && displayedLabel && displayedLabelPosition ? (
            <g>
              <circle
                cx={displayedPoint.x}
                cy={displayedPoint.y}
                fill="none"
                opacity={0.85}
                r={layout.nodeRadius + 6}
                stroke="var(--foreground)"
                strokeWidth={1.5}
              />
              <rect
                fill="var(--surface)"
                height={24}
                opacity={labelIsLivePreview ? 0.94 : 0.58}
                rx={6}
                stroke="var(--border)"
                strokeOpacity={labelIsLivePreview ? 1 : 0.65}
                width={displayedLabel.width}
                x={displayedLabelPosition.x}
                y={displayedLabelPosition.y}
              />
              <text
                dominantBaseline="middle"
                fill={labelIsLivePreview ? "var(--foreground)" : "var(--muted)"}
                fontSize={layoutExpanded ? 12 : 11}
                fontWeight={600}
                opacity={labelIsLivePreview ? 1 : 0.72}
                x={displayedLabelPosition.x + 10}
                y={displayedLabelPosition.y + 12}
              >
                {displayedLabel.label}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="mt-3">
        <div className="text-foreground truncate text-sm font-semibold">{focusedEvent.title}</div>
        <div className="text-muted mt-1 flex items-center gap-2 text-xs">
          <span>{STATE_MAP[focusedEvent.status].name}</span>
          <span>{formatCompletion(focusedEvent.completion)}</span>
          <span className="truncate">{focusedEvent.fileName}</span>
        </div>
      </div>
      {isDocked ? (
        <div
          aria-label="Resize DAG pane"
          className="group absolute -left-1 top-0 z-10 h-full w-2 cursor-ew-resize touch-none"
          role="separator"
          onPointerDown={(event) => startResize("nw", event)}
        >
          <div className="bg-accent/0 group-hover:bg-accent/45 mx-auto h-full w-px transition-colors" />
        </div>
      ) : null}
      {(["nw", "ne", "sw", "se"] as ResizeCorner[])
        .filter((corner) => !isDocked || corner.includes("w"))
        .map((corner) => (
        <div
          key={corner}
          aria-label={`Resize DAG panel ${corner}`}
          className={[
            "absolute size-4 touch-none",
            corner.includes("n") ? "-top-1" : "-bottom-1",
            corner.includes("w") ? "-left-1" : "-right-1",
            corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
          ].join(" ")}
          role="separator"
          onPointerDown={(event) => startResize(corner, event)}
        />
      ))}
    </aside>
  );

  return panel;
}
