import {useEffect, useState} from "react";

import {Button, Dropdown, Label, Modal, Separator, toast} from "@heroui/react";
import {useNavigate} from "react-router";

import {CompletionBar, StatusIcon} from "./atoms";
import {Markdown} from "./markdown";
import {Iconify} from "../icons/iconify";
import {formatCompletion, formatPlanId, STATES, STATE_MAP, type PlanStatus} from "../data/tracker";
import {useTracker} from "../state/tracker";

function PropertyLabel({children}: {children: React.ReactNode}) {
  return <span className="text-muted w-28 shrink-0 text-xs">{children}</span>;
}

function FactRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <PropertyLabel>{label}</PropertyLabel>
      <span className="min-w-0 break-words text-[13px] text-foreground/85">{children}</span>
    </div>
  );
}

function triggerClass() {
  return "hover:bg-surface-secondary flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] outline-none transition-colors data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-accent";
}

export function IssueDetailPanel() {
  const navigate = useNavigate();
  const {
    openIssueId,
    closeIssue,
    getPlanDetail,
    planDetails,
    detailErrors,
    detailLoadingIds,
    setPlanStatus,
  } = useTracker();
  const open = Boolean(openIssueId);
  const detail = openIssueId ? planDetails[openIssueId] : null;
  const loading = openIssueId ? detailLoadingIds.has(openIssueId) : false;
  const error = openIssueId ? detailErrors[openIssueId] : null;
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (openIssueId) void getPlanDetail(openIssueId);
  }, [getPlanDetail, openIssueId]);

  useEffect(() => {
    if (!open) setShowDetails(false);
  }, [open]);

  const updateStatus = async (status: PlanStatus) => {
    if (!openIssueId || !detail) return;
    const result = await setPlanStatus(openIssueId, status, detail.summary.completion);

    if (result) toast(`Set ${formatPlanId(result.summary)} ${STATE_MAP[status].name}`, {timeout: 2200});
  };

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={open}
        variant="blur"
        onOpenChange={(next) => {
          if (!next) closeIssue();
        }}
      >
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog
            aria-label="Plan detail"
            className="h-[min(90vh,900px)] w-[min(1180px,calc(100vw-32px))] max-w-none overflow-hidden"
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
                <span className="text-muted font-mono text-xs tabular-nums">
                  {detail ? formatPlanId(detail.summary) : openIssueId ? `plan-${openIssueId}` : ""}
                </span>
                {detail ? (
                  <Button
                    isIconOnly
                    aria-label="Copy plan ID"
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      void navigator.clipboard?.writeText(formatPlanId(detail.summary));
                      toast("Copied plan ID", {timeout: 2000});
                    }}
                  >
                    <Iconify className="size-3.5" icon="copy" />
                  </Button>
                ) : null}
                {detail ? (
                  <Button
                    isIconOnly
                    aria-label={showDetails ? "Hide plan details" : "Show plan details"}
                    aria-pressed={showDetails}
                    className="ml-auto"
                    size="sm"
                    variant={showDetails ? "secondary" : "ghost"}
                    onPress={() => setShowDetails((value) => !value)}
                  >
                    <Iconify className="size-4" icon="layout-side-content-right" />
                  </Button>
                ) : null}
                <Button
                  isIconOnly
                  aria-label="Close"
                  className={detail ? "" : "ml-auto"}
                  size="sm"
                  slot="close"
                  variant="ghost"
                >
                  <Iconify className="size-4" icon="xmark" />
                </Button>
              </div>

              {error ? (
                <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
                  Plan API error: {error}
                </div>
              ) : loading && !detail ? (
                <div className="text-muted flex h-40 items-center justify-center text-sm" role="status">
                  Loading plan...
                </div>
              ) : detail ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    <div className="mb-2 flex items-center gap-2">
                      <StatusIcon size={16} state={detail.summary.status} />
                      <span className="text-muted text-xs">{STATE_MAP[detail.summary.status].name}</span>
                    </div>
                    <h1 className="text-foreground text-xl font-semibold tracking-tight">
                      {detail.summary.title}
                    </h1>

                    <div className="mt-4 flex items-center gap-3">
                      <CompletionBar completion={detail.summary.completion} />
                      <span className="text-muted text-xs tabular-nums">
                        {formatCompletion(detail.summary.completion)}
                      </span>
                    </div>

                    <Separator className="my-6" />

                    <div className="markdown-body text-foreground/80 text-sm leading-relaxed">
                      <Markdown>{detail.body}</Markdown>
                    </div>
                  </div>

                  {showDetails ? (
                  <aside className="border-border/70 bg-background/40 w-full shrink-0 space-y-1 border-t p-4 md:w-72 md:border-l md:border-t-0">
                    <div className="flex items-center gap-2">
                      <PropertyLabel>Status</PropertyLabel>
                      <Dropdown>
                        <Dropdown.Trigger aria-label="Set status" className={triggerClass()}>
                          <StatusIcon size={16} state={detail.summary.status} />
                          <span className="truncate">{STATE_MAP[detail.summary.status].name}</span>
                        </Dropdown.Trigger>
                        <Dropdown.Popover className="w-48" placement="bottom end">
                          <Dropdown.Menu
                            aria-label="Status options"
                            onAction={(key) => void updateStatus(key as PlanStatus)}
                          >
                            {STATES.map((state) => (
                              <Dropdown.Item key={state.id} id={state.id} textValue={state.name}>
                                <StatusIcon size={16} state={state.id} />
                                <Label>{state.name}</Label>
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown>
                    </div>

                    <Separator className="my-3" />

                    <FactRow label="Plan ID">{detail.frontMatter.plan_id}</FactRow>
                    <FactRow label="Completion">{formatCompletion(detail.frontMatter.completion)}</FactRow>
                    <FactRow label="Diagram updated">
                      {detail.frontMatter.diagram_updated ? "yes" : "no"}
                    </FactRow>
                    {detail.frontMatter.follow_up ? (
                      <FactRow label="Follow up">{detail.frontMatter.follow_up}</FactRow>
                    ) : null}
                    {detail.frontMatter.implementation_branch ? (
                      <FactRow label="Branch">{detail.frontMatter.implementation_branch}</FactRow>
                    ) : null}
                    {detail.frontMatter.sub_plan ? (
                      <FactRow label="Sub plan">{detail.frontMatter.sub_plan}</FactRow>
                    ) : null}
                    {detail.frontMatter.repo ? (
                      <FactRow label="Repo">{detail.frontMatter.repo}</FactRow>
                    ) : null}
                    {detail.frontMatter.source_idea ? (
                      <FactRow label="Source idea">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            closeIssue();
                            navigate(`/ideas/${detail.frontMatter.source_idea}?status=promoted`);
                          }}
                        >
                          {detail.frontMatter.source_idea}
                        </Button>
                      </FactRow>
                    ) : null}
                    <FactRow label="File">{detail.summary.fileName}</FactRow>
                  </aside>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
