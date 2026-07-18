import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {RouterProvider} from "react-router";

import {router} from "./router";
import {installDemoMockApi} from "./demo/mock-api";

import "./index.css";

if (import.meta.env.VITE_PLANSMAN_DEMO === "true") {
  installDemoMockApi();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
