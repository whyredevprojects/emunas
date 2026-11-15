import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home, { meta } from "../app/routes/home.tsx";
import routes from "../app/routes.ts";

describe("live skeleton", () => {
  it("renders the hello page", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("<h1>Emunas</h1>");
    expect(html).toContain('lang="yi" dir="rtl"');
  });

  it("has a title", () => {
    expect(meta()).toEqual([{ title: "Emunas – Listen" }]);
  });

  it("routes the index to the hello page", () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ index: true, file: "routes/home.tsx" });
  });
});
