import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import Home, { meta, preferredUi } from "../app/routes/home.tsx";
import routes from "../app/routes.ts";

// Updated by W2.4: `/` is now the language-redirect fallback page; the shell lives under `/:ui/`.
describe("live root page", () => {
  it("renders links to both interface languages (no-JS fallback)", () => {
    const router = createMemoryRouter([{ path: "/", Component: Home }], { initialEntries: ["/"] });
    const html = renderToStaticMarkup(<RouterProvider router={router} />);
    expect(html).toContain('href="/en/"');
    expect(html).toContain('href="/yi/"');
    expect(html).toContain('lang="yi" dir="rtl"');
  });

  it("has a title", () => {
    expect(meta()).toEqual([{ title: "Emunas — Listen" }]);
  });

  it("picks the stored language, then the browser's", () => {
    expect(preferredUi("yi", ["en-US"])).toBe("yi");
    expect(preferredUi(null, ["he-IL", "en"])).toBe("he");
    expect(preferredUi(null, ["iw"])).toBe("he");
    expect(preferredUi(null, ["ji"])).toBe("yi");
    expect(preferredUi(null, ["yi"])).toBe("yi");
    expect(preferredUi(null, ["en-GB", "he"])).toBe("en");
    expect(preferredUi(null, ["fr"])).toBe("en");
  });

  it("routes the index to the root page and /:ui to the shell", () => {
    expect(routes[0]).toMatchObject({ index: true, file: "routes/home.tsx" });
    expect(routes[1]).toMatchObject({ path: ":ui", file: "shell/ui-layout.tsx" });
  });
});
