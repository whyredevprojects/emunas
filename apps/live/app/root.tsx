import { UI_DIR, isUiLang, type UiLang } from "@emunas/i18n";
import { useEffect, type JSX, type ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLocation,
  useRouteError,
} from "react-router";
import { tFor } from "./i18n/index.ts";
import { seoLoader } from "./seo/loader.server.ts";
import { SeoHead } from "./seo/SeoHead.tsx";
import { NotFound } from "./shell/PageStub.tsx";
import { connectPersonal } from "./store/connect.ts";
import "./styles/global.css";

/** Interface language from the first path segment (`/yi/…`); English for `/` and unknown paths. */
export function uiFromPath(pathname: string): UiLang {
  const first = pathname.split("/")[1];
  return isUiLang(first) ? first : "en";
}

/**
 * Build-time SEO data per prerendered page (W4.5, `app/seo`): title, description, canonical to Quiet,
 * hreflang. Runs only at build time (`ssr: false`) and never revalidates on the client.
 */
export function loader({ request }: { request: Request }) {
  return seoLoader({ request });
}

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const ui = uiFromPath(useLocation().pathname);
  return (
    <html lang={ui} dir={UI_DIR[ui]}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <Meta />
        <SeoHead />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App(): JSX.Element {
  // Personal store ↔ player and Today/series progress (browser only, once).
  useEffect(connectPersonal, []);
  return <Outlet />;
}

export function ErrorBoundary(): JSX.Element {
  const error = useRouteError();
  const ui = uiFromPath(useLocation().pathname);
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main id="main">
        <NotFound ui={ui} />
      </main>
    );
  }
  const t = tFor(ui);
  return (
    <main id="main">
      <h1>{t("page.error")}</h1>
    </main>
  );
}
