import {createBrowserRouter} from "react-router";

import App from "./App";
import {AppShell} from "./components/app-shell";
import {PreviewErrorBoundary} from "./components/preview-error-boundary";
import {IndexRoute} from "./routes";
import {IdeasRoute} from "./routes/ideas";
import {BoardRoute} from "./routes/board";
import {DagRoute} from "./routes/dag";
import {NotFoundRoute} from "./routes/not-found";
import {ResolutionsRoute} from "./routes/resolutions";
import {SectionRoute} from "./routes/section";
import {SettingsRoute} from "./routes/settings";

const routerBasename =
  (import.meta.env.VITE_PLANSMAN_DEMO === "true" &&
  typeof window !== "undefined" &&
  window.location.protocol === "file:"
    ? window.location.pathname.replace(/\/(?:index\.html)?$/, "")
    : import.meta.env.VITE_PLANSMAN_ROUTER_BASENAME || undefined);

export const router = createBrowserRouter([
  {
    Component: App,
    ErrorBoundary: PreviewErrorBoundary,
    path: "/",
    children: [
      {
        Component: AppShell,
        children: [
          {Component: IndexRoute, index: true},
          {Component: IndexRoute, path: "index.html"},
          {Component: BoardRoute, path: "board"},
          {Component: DagRoute, path: "dag"},
          {Component: IdeasRoute, path: "ideas"},
          {Component: IdeasRoute, path: "ideas/:ideaId"},
          {Component: ResolutionsRoute, path: "resolutions"},
          {Component: SectionRoute, path: "sections/:sectionId"},
          {Component: SettingsRoute, path: "settings"},
        ],
      },
      {Component: NotFoundRoute, path: "*"},
    ],
  },
], routerBasename ? {basename: routerBasename} : undefined);
