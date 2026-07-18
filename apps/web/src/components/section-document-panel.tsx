import {Button, Drawer} from "@heroui/react";

import {Markdown} from "./markdown";
import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

export function SectionDocumentPanel() {
  const {
    closeSectionDocument,
    openSectionDocument,
    sectionDocumentError,
    sectionDocumentLoading,
  } = useTracker();
  const open = Boolean(openSectionDocument) || sectionDocumentLoading || Boolean(sectionDocumentError);

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={open} variant="blur" onOpenChange={(next) => {
        if (!next) closeSectionDocument();
      }}>
        <Drawer.Content placement="right">
          <Drawer.Dialog aria-label="Markdown document" className="w-full max-w-[760px]">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
                <span className="text-muted min-w-0 truncate font-mono text-xs">
                  {openSectionDocument?.file.path ?? "Section file"}
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

              {sectionDocumentError ? (
                <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
                  Section API error: {sectionDocumentError}
                </div>
              ) : sectionDocumentLoading && !openSectionDocument ? (
                <div className="text-muted flex h-40 items-center justify-center text-sm" role="status">
                  Loading document...
                </div>
              ) : openSectionDocument ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <h1 className="text-foreground text-xl font-semibold tracking-tight">
                    {openSectionDocument.file.title}
                  </h1>
                  <div className="markdown-body text-foreground/80 mt-6 text-sm leading-relaxed">
                    <Markdown>{openSectionDocument.content}</Markdown>
                  </div>
                </div>
              ) : null}
            </div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
