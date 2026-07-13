import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  data,
  useFetchers,
  useLocation,
  useNavigation,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { FootballLoader } from "~/components/FootballLoader";
import { getThemeFromRequest } from "~/lib/theme.server";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const theme = await getThemeFromRequest(request);

  return data({
    theme,
  });
}

function isLobbyPath(pathname?: string) {
  if (!pathname) return false;

  return (
    pathname === "/" ||
    pathname === "/matches" ||
    pathname === "/tables" ||
    pathname === "/join" ||
    pathname === "/create" ||
    pathname.startsWith("/create/") ||
    pathname === "/me" ||
    pathname.startsWith("/me/")
  );
}

function GlobalLobbyLoader() {
  const location = useLocation();
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const navigationPath = navigation.location?.pathname;
  const isLobbyNavigation =
    navigation.state !== "idle" &&
    (isLobbyPath(location.pathname) || isLobbyPath(navigationPath));
  const isLobbyFetcherBusy = fetchers.some((fetcher) => {
    if (fetcher.state === "idle") return false;

    const action = fetcher.formAction;
    const actionPath = action ? new URL(action, "http://local").pathname : null;

    return isLobbyPath(location.pathname) || isLobbyPath(actionPath ?? undefined);
  });

  return isLobbyNavigation || isLobbyFetcherBusy ? <FootballLoader /> : null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme } = useRouteLoaderData<typeof loader>("root") ?? {
    theme: "ucl",
  };

  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>

      <body className="theme-page">
        {children}
        <GlobalLobbyLoader />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <div className="theme-panel rounded-3xl p-6">
        <h1 className="text-2xl font-black">{message}</h1>
        <p className="theme-text-soft mt-2">{details}</p>

        {stack && (
          <pre className="mt-4 w-full overflow-x-auto rounded-2xl border border-[var(--border)] p-4 text-sm">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
