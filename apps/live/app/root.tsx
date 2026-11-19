// First, so the bundle opens with global.css's `@layer` order statement. A layer's rank is fixed
// where its name first appears: a CSS module earlier in the bundle would put `components` below
// `base`, and the base `a` colour would then override every link-styled button.
import "./styles/global.css";
import { UI_DIR, isUiLang, type UiLang } from "@emunas/i18n";
import { THEME_INIT_SCRIPT } from "@emunas/tokens";
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
import { Dedication } from "./components/Dedication.tsx";
import { tFor } from "./i18n/index.ts";
import { seoLoader } from "./seo/loader.server.ts";
import { SeoHead } from "./seo/SeoHead.tsx";
import { NotFound } from "./shell/PageStub.tsx";
import { connectPersonal } from "./store/connect.ts";

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
    // The init script may set data-theme before hydration.
    <html lang={ui} dir={UI_DIR[ui]} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* Light by default; a dark choice (shared cookie) is applied before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#1f3a5f" />
        <Meta />
        <SeoHead />
        <Links />
      </head>
      <body>
        {children}
        <Dedication />
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
