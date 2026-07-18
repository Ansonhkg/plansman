import {useEffect} from "react";

import {Button, Drawer, Separator} from "@heroui/react";

import {Markdown} from "./markdown";
import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

function PropertyLabel({children}: {children: React.ReactNode}) {
  return <span className="text-muted w-24 shrink-0 text-xs">{children}</span>;
}

function FactRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <PropertyLabel>{label}</PropertyLabel>
      <span className="min-w-0 break-words text-[13px] text-foreground/85">{children}</span>
    </div>
  );
}

export function ResolutionDetailPanel() {
  const {
    closeResolution,
    getResolutionDetail,
    openResolutionId,
    resolutionDetailErrors,
    resolutionDetailLoadingIds,
    resolutionDetails,
  } = useTracker();
  const open = openResolutionId !== null;
  const detail = openResolutionId === null ? null : resolutionDetails[openResolutionId];
  const loading = openResolutionId === null ? false : resolutionDetailLoadingIds.has(openResolutionId);
  const error = openResolutionId === null ? null : resolutionDetailErrors[openResolutionId];

  useEffect(() => {
    if (openResolutionId !== null) void getResolutionDetail(openResolutionId);
  }, [getResolutionDetail, openResolutionId]);

  return (
    <Drawer>
      <Drawer.Backdrop
        isOpen={open}
        variant="blur"
        onOpenChange={(next) => {
          if (!next) closeResolution();
        }}
      >
        <Drawer.Content placement="right">
          <Drawer.Dialog aria-label="Resolution detail" className="w-full max-w-[820px]">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
                <span className="text-muted font-mono text-xs tabular-nums">
                  {detail ? detail.summary.fileName : openResolutionId ? `resolution-${openResolutionId}.md` : ""}
                </span>
                <Button
                  isIconOnly
                  aria-label="Close"
                  className="ml-auto"
                  size="sm"
                  slot="close"
                  variant="ghost"
                >
                  <Iconify className="size-4" icon="xmark" />
                </Button>
              </div>

              {error ? (
                <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
                  Resolution API error: {error}
                </div>
              ) : loading && !detail ? (
                <div className="text-muted flex h-40 items-center justify-center text-sm" role="status">
                  Loading resolution...
                </div>
              ) : detail ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-medium uppercase text-accent">
                        {detail.summary.status}
                      </span>
                    </div>
                    <h1 className="text-foreground text-xl font-semibold tracking-tight">
                      {detail.summary.title}
                    </h1>

                    <Separator className="my-6" />

                    <div className="markdown-body text-foreground/80 text-sm leading-relaxed">
                      <Markdown>{detail.body}</Markdown>
                    </div>
                  </div>

                  <aside className="border-border/70 bg-background/40 w-full shrink-0 space-y-1 border-t p-4 md:w-72 md:border-l md:border-t-0">
                    <FactRow label="Status">{detail.frontMatter.status}</FactRow>
                    <FactRow label="Plans">{detail.frontMatter.plans.join(", ")}</FactRow>
                    <FactRow label="Parties">{detail.frontMatter.parties.join(", ")}</FactRow>
                    <FactRow label="Created">{detail.frontMatter.created}</FactRow>
                    {detail.frontMatter.decided ? <FactRow label="Decided">{detail.frontMatter.decided}</FactRow> : null}
                    <FactRow label="File">{detail.summary.fileName}</FactRow>
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
