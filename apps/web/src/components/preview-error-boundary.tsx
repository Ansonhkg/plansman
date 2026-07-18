import {useEffect, useState} from "react";
import {useRouteError} from "react-router";

const GENERATION_STATE_MESSAGE_TYPE = "HEROUI_PREVIEW_GENERATION_STATE";
const GENERATION_STATE_REQUEST_TYPE = "HEROUI_PREVIEW_GENERATION_STATE_REQUEST";

function useIsFixing() {
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;

      if (!data || typeof data !== "object" || data.type !== GENERATION_STATE_MESSAGE_TYPE) {
        return;
      }

      setIsFixing(Boolean((data as {running?: unknown}).running));
    };

    window.addEventListener("message", handleMessage);
    window.parent?.postMessage({type: GENERATION_STATE_REQUEST_TYPE}, "*");

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return isFixing;
}

function useReloadOnHotUpdate() {
  useEffect(() => {
    const hot = (
      import.meta as {
        hot?: {on?(event: string, cb: () => void): void; off?(event: string, cb: () => void): void};
      }
    ).hot;

    if (!hot?.on) return;

    const reload = () => window.location.reload();

    hot.on("vite:afterUpdate", reload);

    return () => hot.off?.("vite:afterUpdate", reload);
  }, []);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as {message?: unknown}).message ?? "");
  }

  return typeof error === "string" ? error : "";
}

export function PreviewErrorBoundary() {
  const error = useRouteError();
  const isFixing = useIsFixing();

  useReloadOnHotUpdate();

  const message = getErrorMessage(error);

  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
      <section className="border-border bg-background shadow-surface flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border p-8 text-center">
        {isFixing ? (
          <>
            <span
              aria-hidden
              className="border-default border-t-foreground size-6 animate-spin rounded-full border-2"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-base font-medium">Fixing this error…</h1>
              <p className="text-muted text-sm">
                HeroUI is updating the code. The preview refreshes automatically when it&apos;s
                ready.
              </p>
            </div>
          </>
        ) : (
          <>
            <div
              aria-hidden
              className="bg-danger/10 text-danger flex size-10 items-center justify-center rounded-full text-xl font-semibold"
            >
              !
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-base font-medium">Something went wrong</h1>
              <p className="text-muted text-sm">The preview hit an error while rendering.</p>
            </div>
            {message ? (
              <pre className="border-border bg-default/40 text-muted max-h-40 w-full overflow-auto whitespace-pre-wrap break-words rounded-xl border p-3 text-left text-xs">
                {message}
              </pre>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
