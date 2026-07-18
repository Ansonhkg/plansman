import {RouterProvider} from "react-aria-components";
import {Outlet, useHref, useNavigate} from "react-router";

export default function App() {
  const navigate = useNavigate();

  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <div className="bg-background text-foreground h-dvh overflow-hidden">
        <Outlet />
      </div>
    </RouterProvider>
  );
}
