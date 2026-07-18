import {useEffect, useMemo, useState} from "react";
import {useParams} from "react-router";

import {Button} from "@heroui/react";

import {Iconify} from "../icons/iconify";
import type {ErrorEnvelope, SectionFile} from "../data/tracker";
import {useTracker} from "../state/tracker";

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ErrorEnvelope).error?.message === "string"
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const value = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(isErrorEnvelope(value) ? value.error.message : response.statusText);
  return value as T;
}

export function SectionRoute() {
  const {sectionId = ""} = useParams();
  const {currentWorkspaceSlug, openSectionFile, sections} = useTracker();
  const [files, setFiles] = useState<SectionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const section = useMemo(() => sections.find((item) => item.id === sectionId), [sectionId, sections]);

  useEffect(() => {
    if (!currentWorkspaceSlug || !sectionId) return;
    setLoading(true);
    setError(null);

    fetch(
      `/api/workspaces/${encodeURIComponent(currentWorkspaceSlug)}/sections/${encodeURIComponent(sectionId)}/files`,
    )
      .then((response) => readJson<{files: SectionFile[]}>(response))
      .then((payload) => setFiles(payload.files))
      .catch((caught: unknown) => {
        setFiles([]);
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setLoading(false));
  }, [currentWorkspaceSlug, sectionId]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Iconify className="text-muted size-4" icon="file-text" />
        <span className="text-foreground text-sm font-medium">{section?.name ?? sectionId}</span>
        <span className="text-muted text-xs tabular-nums">{files.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-muted flex h-32 items-center justify-center text-sm" role="status">
            Loading files...
          </div>
        ) : error ? (
          <div className="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
            Section API error: {error}
          </div>
        ) : files.length > 0 ? (
          <div className="divide-border/60 divide-y">
            {files.map((file) => (
              <button
                key={file.name}
                className="hover:bg-foreground/[0.04] flex h-12 w-full items-center gap-3 px-3 text-left"
                type="button"
                onClick={() => void openSectionFile(sectionId, file.name)}
              >
                <Iconify className="text-muted size-4 shrink-0" icon="file-text" />
                <span className="text-foreground min-w-0 flex-1 truncate text-sm">{file.title}</span>
                <span className="text-muted hidden shrink-0 font-mono text-xs sm:inline">{file.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-muted flex h-32 items-center justify-center text-sm">No markdown files.</div>
        )}
      </div>

      {section ? null : (
        <div className="border-border/70 border-t p-3">
          <Button size="sm" variant="ghost" onPress={() => history.back()}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
