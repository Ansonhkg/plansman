import {useEffect, useState} from "react";

import {
  Button,
  Drawer,
  Input,
  Label,
  Separator,
  Spinner,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import {useNavigate, useParams, useSearchParams} from "react-router";

import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";
import {Markdown} from "./markdown";

function statusClasses(status: "inbox" | "shaped" | "promoted" | "dismissed") {
  if (status === "promoted") return "bg-success/12 text-success";
  if (status === "dismissed") return "bg-default text-muted";
  if (status === "shaped") return "bg-primary/12 text-primary";
  return "bg-accent/12 text-accent";
}

function prdFromBody(body: string) {
  const match = body.match(/<!-- plansman:prd:start -->\n([\s\S]*?)\n<!-- plansman:prd:end -->/);
  return match?.[1] ?? "";
}

function visibleIdeaBody(body: string) {
  const visible = body
    .replace(/^<!-- plansman:prd:start -->\n?/m, "")
    .replace(/^<!-- plansman:prd:end -->\n?/m, "")
    .replace(/\n## Outcome\n[\s\S]*$/m, "");
  return visible.trim() === "## Discussion" ? "" : visible;
}

function GoalContract({objective, requirements, forbidden}: {
  objective?: string;
  requirements?: string;
  forbidden?: string;
}) {
  if (!objective || !requirements || !forbidden) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-surface-secondary/35 p-3">
      <h2 className="text-sm font-semibold text-foreground">Goal contract</h2>
      <dl className="mt-3 space-y-3 text-xs">
        <div>
          <dt className="font-medium text-muted">Objective</dt>
          <dd className="mt-1 leading-relaxed text-foreground/85">{objective}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Requirements</dt>
          <dd className="mt-1 leading-relaxed text-foreground/85">{requirements}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Forbidden substitutes</dt>
          <dd className="mt-1 leading-relaxed text-foreground/85">{forbidden}</dd>
        </div>
      </dl>
    </div>
  );
}

export function IdeaDetailPanel() {
  const {ideaId} = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    addIdeaNote,
    dismissIdea,
    getIdeaDetail,
    ideaDetailErrors,
    ideaDetailLoadingIds,
    ideaDetails,
    openIssue,
    promoteIdea,
    shapeIdea,
  } = useTracker();
  const detail = ideaId ? ideaDetails[ideaId] : null;
  const loading = ideaId ? ideaDetailLoadingIds.has(ideaId) : false;
  const error = ideaId ? ideaDetailErrors[ideaId] : null;
  const [note, setNote] = useState("");
  const [prd, setPrd] = useState("");
  const [objective, setObjective] = useState("");
  const [requirements, setRequirements] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [target, setTarget] = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [mode, setMode] = useState<"discussion" | "shape" | "promote" | "dismiss">("discussion");

  const listStatus = searchParams.get("status") ?? "all";
  const isShapeDirty = mode === "shape" && Boolean(detail) && (
    prd !== prdFromBody(detail?.body ?? "")
    || objective !== (detail?.frontMatter.objective ?? "")
    || requirements !== (detail?.frontMatter.requirements ?? "")
    || forbidden !== (detail?.frontMatter.forbidden ?? "")
  );
  const changeMode = (nextMode: typeof mode) => {
    if (mode === "shape" && nextMode !== "shape" && isShapeDirty) {
      if (!window.confirm("Discard unsaved PRD changes?")) return;
      setPrd(prdFromBody(detail?.body ?? ""));
      setObjective(detail?.frontMatter.objective ?? "");
      setRequirements(detail?.frontMatter.requirements ?? "");
      setForbidden(detail?.frontMatter.forbidden ?? "");
    }
    setMode(nextMode);
  };
  const close = () => {
    if (isShapeDirty && !window.confirm("Discard unsaved PRD changes?")) return;
    navigate(`/ideas?status=${encodeURIComponent(listStatus)}`);
  };

  useEffect(() => {
    if (ideaId) void getIdeaDetail(ideaId);
  }, [getIdeaDetail, ideaId]);

  useEffect(() => {
    setNote("");
    setPrd("");
    setObjective("");
    setRequirements("");
    setForbidden("");
    setTarget("");
    setDismissReason("");
    setActionError(null);
    setMode("discussion");
  }, [ideaId]);

  useEffect(() => {
    if (!detail) return;
    setPrd(prdFromBody(detail.body));
    setObjective(detail.frontMatter.objective ?? "");
    setRequirements(detail.frontMatter.requirements ?? "");
    setForbidden(detail.frontMatter.forbidden ?? "");
  }, [detail]);

  const submitNote = async () => {
    if (!ideaId || !note.trim()) return;
    setActionError(null);
    try {
      await addIdeaNote(ideaId, note.trim());
      setNote("");
      toast(`Added a note to ${ideaId}`, {timeout: 2200});
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const submitPromotion = async () => {
    if (!ideaId || !detail) return;
    if (detail.summary.status !== "shaped") return;
    setActionError(null);
    try {
      const result = await promoteIdea(ideaId, {
        ...(target.trim() ? {target: target.trim()} : {}),
      });
      toast(`Promoted ${ideaId} to ${result.plan.summary.fileName}`, {variant: "accent", timeout: 2800});
      navigate(`/ideas/${ideaId}?status=promoted`, {replace: true});
      setMode("discussion");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const submitShape = async () => {
    if (!ideaId || !prd.trim() || !objective.trim() || !requirements.trim() || !forbidden.trim()) return;
    setActionError(null);
    try {
      await shapeIdea(ideaId, {
        prd: prd.trim(),
        objective: objective.trim(),
        requirements: requirements.trim(),
        forbidden: forbidden.trim(),
      });
      toast(`Shaped ${ideaId} into a PRD`, {variant: "accent", timeout: 2600});
      navigate(`/ideas/${ideaId}?status=shaped`, {replace: true});
      setMode("discussion");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const submitDismissal = async () => {
    if (!ideaId || !dismissReason.trim()) return;
    setActionError(null);
    try {
      await dismissIdea(ideaId, dismissReason.trim());
      toast(`Dismissed ${ideaId}`, {timeout: 2200});
      navigate(`/ideas/${ideaId}?status=dismissed`, {replace: true});
      setMode("discussion");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <Drawer>
      <Drawer.Backdrop
        isOpen={Boolean(ideaId)}
        variant="blur"
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Drawer.Content placement="right">
          <Drawer.Dialog
            aria-label="Idea detail"
            className={`w-full ${mode === "shape" ? "max-w-[1040px]" : "max-w-[860px]"}`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
                <Iconify className="text-accent size-4" icon="bulb" />
                <span className="text-muted font-mono text-xs tabular-nums">{ideaId ?? ""}</span>
                <Button isIconOnly aria-label="Close" className="ml-auto" size="sm" slot="close" variant="ghost">
                  <Iconify className="size-4" icon="xmark" />
                </Button>
              </div>

              {error ? (
                <div className="m-4 rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
                  Ideas API error: {error}
                </div>
              ) : loading && !detail ? (
                <div className="text-muted flex h-40 items-center justify-center gap-2 text-sm" role="status">
                  <Spinner color="accent" size="sm" />
                  Loading idea
                </div>
              ) : detail ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                  <div className={`min-h-0 overflow-y-auto px-5 py-5 ${
                    (detail.summary.status === "promoted" || detail.summary.status === "dismissed") && !visibleIdeaBody(detail.body)
                      ? "shrink-0 lg:flex-1"
                      : "flex-1"
                  }`}>
                    <h1 className="text-foreground text-xl font-semibold tracking-tight">{detail.summary.title}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-md px-2 py-1 font-medium capitalize ${statusClasses(detail.summary.status)}`}>
                        {detail.summary.status}
                      </span>
                      <span className="text-muted">Captured {detail.summary.created}</span>
                      {detail.summary.promotedPlan ? (
                        <span className="text-muted">Promoted to plan-{detail.summary.promotedPlan}</span>
                      ) : null}
                    </div>

                    {visibleIdeaBody(detail.body) ? (
                      <>
                        <Separator className="my-5" />
                        <div className="markdown-body text-foreground/80 text-sm leading-relaxed">
                          <Markdown>{visibleIdeaBody(detail.body)}</Markdown>
                        </div>
                      </>
                    ) : null}

                    {detail.summary.status === "inbox" || detail.summary.status === "shaped" ? (
                      <div className="border-border/70 mt-6 rounded-xl border bg-surface-secondary/35 p-3">
                        <Label htmlFor="idea-note">Continue the discussion</Label>
                        <TextArea
                          fullWidth
                          aria-label="Discussion note"
                          className="mt-2 min-h-24 resize-y"
                          id="idea-note"
                          placeholder="Add context, questions, constraints, or a possible direction..."
                          value={note}
                          variant="secondary"
                          onChange={(event) => setNote(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submitNote();
                          }}
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-muted text-xs">⌘ Enter to add note</span>
                          <Button isDisabled={!note.trim() || loading} size="sm" variant="primary" onPress={() => void submitNote()}>
                            {loading ? <Spinner color="current" size="sm" /> : <Iconify className="size-4" icon="comment" />}
                            Add note
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <aside className={`border-border/70 bg-background/55 w-full shrink-0 overflow-y-auto border-t p-4 lg:border-l lg:border-t-0 ${mode === "shape" ? "lg:w-[460px]" : "lg:w-[330px]"}`}>
                    {detail.summary.status === "inbox" || detail.summary.status === "shaped" ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            size="sm"
                            variant={mode === "shape" ? "primary" : "secondary"}
                            onPress={() => changeMode(mode === "shape" ? "discussion" : "shape")}
                          >
                            <Iconify className="size-4" icon="file-lines" />
                            {detail.summary.status === "shaped" ? "Revise" : "Shape"}
                          </Button>
                          <Button
                            size="sm"
                            variant={mode === "promote" ? "primary" : "secondary"}
                            isDisabled={detail.summary.status !== "shaped"}
                            onPress={() => changeMode(mode === "promote" ? "discussion" : "promote")}
                          >
                            <Iconify className="size-4" icon="arrow-up-right" />
                            {detail.summary.status === "shaped" ? "Promote" : "Shape first"}
                          </Button>
                          <Button
                            size="sm"
                            variant={mode === "dismiss" ? "danger" : "secondary"}
                            onPress={() => changeMode(mode === "dismiss" ? "discussion" : "dismiss")}
                          >
                            <Iconify className="size-4" icon="archive" />
                            Dismiss
                          </Button>
                        </div>

                        {mode === "shape" ? (
                          <div className="space-y-4">
                            <div>
                              <h2 className="text-sm font-semibold text-foreground">{detail.summary.status === "shaped" ? "Revise product requirements" : "Shape into a PRD"}</h2>
                              <p className="text-muted mt-1 text-xs leading-relaxed">Use the canonical PRD headings and keep the execution contract explicit.</p>
                            </div>
                            <TextField isRequired value={prd} onChange={setPrd}>
                              <Label>PRD Markdown</Label>
                              <TextArea rows={12} placeholder="## Problem Statement\n\n...\n\n## Solution\n\n..." variant="secondary" />
                            </TextField>
                            <TextField isRequired value={objective} onChange={setObjective}>
                              <Label>Objective</Label>
                              <TextArea rows={3} variant="secondary" />
                            </TextField>
                            <TextField isRequired value={requirements} onChange={setRequirements}>
                              <Label>Requirements</Label>
                              <TextArea rows={4} variant="secondary" />
                            </TextField>
                            <TextField isRequired value={forbidden} onChange={setForbidden}>
                              <Label>Forbidden substitutes</Label>
                              <TextArea rows={3} variant="secondary" />
                            </TextField>
                            <Button
                              fullWidth
                              isDisabled={!prd.trim() || !objective.trim() || !requirements.trim() || !forbidden.trim() || loading}
                              variant="primary"
                              onPress={() => void submitShape()}
                            >
                              {loading ? <Spinner color="current" size="sm" /> : <Iconify className="size-4" icon="file-lines" />}
                              Save PRD
                            </Button>
                          </div>
                        ) : mode === "promote" ? (
                          <div className="space-y-4">
                            <div>
                              <h2 className="text-sm font-semibold text-foreground">Promote to a plan</h2>
                              <p className="text-muted mt-1 text-xs leading-relaxed">Copy the accepted PRD and goal contract into one self-contained execution plan.</p>
                            </div>
                            <div className="rounded-xl bg-surface-secondary/45 p-3 text-xs text-foreground/80">
                              The full stored PRD—not only its goal fields—will be embedded in the new plan.
                            </div>
                            <TextField value={target} onChange={setTarget}>
                              <Label>Plan ID (optional)</Label>
                              <Input placeholder="e.g. 33 or 30b" variant="secondary" />
                            </TextField>
                            <Button
                              fullWidth
                              isDisabled={detail.summary.status !== "shaped" || loading}
                              variant="primary"
                              onPress={() => void submitPromotion()}
                            >
                              {loading ? <Spinner color="current" size="sm" /> : <Iconify className="size-4" icon="arrow-up-right" />}
                              Create plan
                            </Button>
                          </div>
                        ) : mode === "dismiss" ? (
                          <div className="space-y-4">
                            <div>
                              <h2 className="text-sm font-semibold text-foreground">Dismiss idea</h2>
                              <p className="text-muted mt-1 text-xs leading-relaxed">The idea and discussion remain available in history.</p>
                            </div>
                            <TextField isRequired value={dismissReason} onChange={setDismissReason}>
                              <Label>Reason</Label>
                              <TextArea rows={4} placeholder="Why are we not pursuing this?" variant="secondary" />
                            </TextField>
                            <Button
                              fullWidth
                              isDisabled={!dismissReason.trim() || loading}
                              variant="danger"
                              onPress={() => void submitDismissal()}
                            >
                              {loading ? <Spinner color="current" size="sm" /> : <Iconify className="size-4" icon="archive" />}
                              Dismiss idea
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="rounded-xl bg-surface-secondary/45 p-3">
                              <h2 className="text-sm font-semibold text-foreground">
                                {detail.summary.status === "shaped" ? "Ready for planning" : "Still exploring"}
                              </h2>
                              <p className="text-muted mt-1 text-xs leading-relaxed">
                                {detail.summary.status === "shaped"
                                  ? "The PRD and goal contract are ready to promote or revise."
                                  : "Add notes until the objective and constraints are clear enough to become a plan."}
                              </p>
                            </div>
                            {detail.summary.status === "shaped" ? (
                              <GoalContract
                                objective={detail.frontMatter.objective}
                                requirements={detail.frontMatter.requirements}
                                forbidden={detail.frontMatter.forbidden}
                              />
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-foreground">Outcome</h2>
                        <div className="rounded-xl bg-surface-secondary/45 p-3 text-sm text-foreground/80">
                          {detail.summary.status === "promoted"
                            ? `This idea became plan-${detail.summary.promotedPlan}.`
                            : detail.summary.reason ?? "This idea was dismissed."}
                        </div>
                        {detail.summary.status === "promoted" && detail.summary.promotedPlan ? (
                          <Button
                            fullWidth
                            variant="secondary"
                            onPress={() => {
                              navigate("/");
                              openIssue(`plan-${detail.summary.promotedPlan}`);
                            }}
                          >
                            <Iconify className="size-4" icon="arrow-up-right" />
                            Open plan-{detail.summary.promotedPlan}
                          </Button>
                        ) : null}
                        {detail.summary.status === "promoted" ? (
                          <GoalContract
                            objective={detail.frontMatter.objective}
                            requirements={detail.frontMatter.requirements}
                            forbidden={detail.frontMatter.forbidden}
                          />
                        ) : null}
                        {detail.summary.completed ? (
                          <p className="text-muted text-xs">Closed {detail.summary.completed}</p>
                        ) : null}
                      </div>
                    )}

                    {actionError ? (
                      <div className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">{actionError}</div>
                    ) : null}
                  </aside>
                </div>
              ) : null}
            </div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
