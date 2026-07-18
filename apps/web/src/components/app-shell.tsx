import {Toast} from "@heroui/react";
import {Sidebar} from "@heroui-pro/react";
import {Outlet, useLocation, useNavigate} from "react-router";

import {AppSidebar} from "./app-sidebar";
import {CommandPalette} from "./command-palette";
import {DagMiniMapPanel} from "./dag-minimap-panel";
import {IssueDetailPanel} from "./issue-detail-panel";
import {NewIssueModal} from "./new-issue-modal";
import {SectionDocumentPanel} from "./section-document-panel";
import {TopBar} from "./top-bar";
import {TrackerProvider} from "../state/tracker";
import {useTracker} from "../state/tracker";

function AppChrome() {
  const navigate = useNavigate();
  const {pathname} = useLocation();
  const {dagPreviewDocked, dagPreviewVisible} = useTracker();
  const supportsDagPreview = pathname === "/" || pathname === "/board" || pathname === "/dag";
  const showDockedDagPreview = supportsDagPreview && dagPreviewVisible && dagPreviewDocked;

  return (
    <>
      <Sidebar.Provider collapsible="icon" navigate={(href) => navigate(href)}>
        <AppSidebar />
        <Sidebar.Main className="bg-background flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden">
          <TopBar />
          <div className="flex h-[calc(100dvh-2.75rem)] min-h-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
              <Outlet />
            </div>
            {showDockedDagPreview ? <DagMiniMapPanel mode="docked" /> : null}
          </div>
        </Sidebar.Main>
      </Sidebar.Provider>
      <CommandPalette />
      <IssueDetailPanel />
      <SectionDocumentPanel />
      <NewIssueModal />
      {supportsDagPreview && dagPreviewVisible && !dagPreviewDocked ? <DagMiniMapPanel mode="floating" /> : null}
      <Toast.Provider placement="bottom end" />
    </>
  );
}

export function AppShell() {
  return (
    <TrackerProvider>
      <AppChrome />
    </TrackerProvider>
  );
}
