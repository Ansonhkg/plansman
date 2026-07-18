import {useMemo} from "react";

import {Button, Spinner, Tabs} from "@heroui/react";
import {EmptyState, ListView} from "@heroui-pro/react";
import {useNavigate, useParams, useSearchParams} from "react-router";

import {IdeaDetailPanel} from "../components/idea-detail-panel";
import {NewIdeaModal} from "../components/new-idea-modal";
import type {IdeaStatus, IdeaSummary} from "../data/tracker";
import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

type IdeaFilter = "all" | IdeaStatus;

const FILTERS: Array<{id: IdeaFilter; label: string}> = [
  {id: "all", label: "All"},
  {id: "inbox", label: "Inbox"},
  {id: "shaped", label: "Shaped"},
  {id: "promoted", label: "Promoted"},
  {id: "dismissed", label: "Dismissed"},
];

function statusIcon(status: IdeaStatus) {
  if (status === "promoted") return "circle-check";
  if (status === "dismissed") return "archive";
  if (status === "shaped") return "file-lines";
  return "bulb";
}

function statusColor(status: IdeaStatus) {
  if (status === "promoted") return "text-success bg-success/10";
  if (status === "dismissed") return "text-muted bg-default";
  if (status === "shaped") return "text-primary bg-primary/10";
  return "text-accent bg-accent/10";
}

function IdeasList({ideas, filter}: {ideas: IdeaSummary[]; filter: IdeaFilter}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const visible = filter === "all" ? ideas : ideas.filter((idea) => idea.status === filter);
  const statusQuery = searchParams.get("status") ?? filter;

  if (visible.length === 0) {
    const isEmptyWorkspace = ideas.length === 0;
    return (
      <div className="flex min-h-[360px] items-center justify-center p-6">
        <EmptyState className="max-w-md" size="lg">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <Iconify className="size-5" icon={isEmptyWorkspace ? "bulb" : "magnifier"} />
            </EmptyState.Media>
            <EmptyState.Title>{isEmptyWorkspace ? "No ideas yet" : `No ${filter} ideas`}</EmptyState.Title>
            <EmptyState.Description className="max-w-sm text-pretty">
              {isEmptyWorkspace
                ? "Capture a rough thought now. You only need a title, and can shape it through discussion later."
                : "Choose another status to see the rest of the idea history."}
            </EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button size="sm" variant="primary" onPress={() => navigate("/ideas?capture=1")}>
              <Iconify className="size-4" icon="plus" />
              Capture idea
            </Button>
          </EmptyState.Content>
        </EmptyState>
      </div>
    );
  }

  return (
    <ListView
      aria-label={`${filter} ideas`}
      className="idea-list"
      items={visible}
      selectionMode="none"
      variant="secondary"
      onAction={(key) => navigate(`/ideas/${String(key)}?status=${encodeURIComponent(statusQuery)}`)}
    >
      {(idea) => (
        <ListView.Item id={idea.label} textValue={idea.title}>
          <ListView.ItemContent>
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${statusColor(idea.status)}`}>
              <Iconify className="size-4" icon={statusIcon(idea.status)} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <ListView.Title>{idea.title}</ListView.Title>
              <ListView.Description>
                {idea.label} · {idea.status === "promoted" ? `plan-${idea.promotedPlan}` : idea.status} · {idea.created}
              </ListView.Description>
            </div>
          </ListView.ItemContent>
          <ListView.ItemAction>
            <Iconify className="text-muted size-4" icon="chevron-right" />
          </ListView.ItemAction>
        </ListView.Item>
      )}
    </ListView>
  );
}

export function IdeasRoute() {
  const {ideaId} = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const {ideas, ideasError, ideasLoading, refreshIdeas} = useTracker();
  const requestedFilter = searchParams.get("status");
  const filter: IdeaFilter = FILTERS.some((item) => item.id === requestedFilter)
    ? requestedFilter as IdeaFilter
    : "all";
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(({id}) => [id, id === "all" ? ideas.length : ideas.filter((idea) => idea.status === id).length])),
    [ideas],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/70 shrink-0 border-b px-4 py-4">
        <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-foreground">Ideas</h1>
            <p className="text-muted mt-1 text-sm">A durable inbox for thoughts that are not plans yet.</p>
          </div>
          <div className="text-muted flex items-center gap-2 text-xs tabular-nums">
            <span>{(counts.inbox ?? 0) + (counts.shaped ?? 0)} active</span>
            <span>·</span>
            <span>{ideas.length} total</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-4xl">
          <Tabs
            className="w-full"
            selectedKey={filter}
            variant="secondary"
            onSelectionChange={(key) => setSearchParams({status: String(key)}, {replace: true})}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Idea status">
                {FILTERS.map((item) => (
                  <Tabs.Tab key={item.id} id={item.id}>
                    {item.label}
                    <span className="text-muted ml-1.5 text-xs tabular-nums">{counts[item.id] ?? 0}</span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>

            {FILTERS.map((item) => (
              <Tabs.Panel key={item.id} className="pt-4" id={item.id}>
                {ideasLoading ? (
                  <div className="text-muted flex min-h-64 items-center justify-center gap-2 text-sm" role="status">
                    <Spinner color="accent" size="sm" />
                    Loading ideas
                  </div>
                ) : ideasError ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
                    <span className="min-w-0">Ideas API error: {ideasError}</span>
                    <Button className="shrink-0" size="sm" variant="secondary" onPress={() => void refreshIdeas()}>
                      <Iconify className="size-4" icon="arrow-rotate-left" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <IdeasList filter={item.id} ideas={ideas} />
                )}
              </Tabs.Panel>
            ))}
          </Tabs>
        </div>
      </div>

      <NewIdeaModal />
      {ideaId ? <IdeaDetailPanel /> : null}
    </div>
  );
}
