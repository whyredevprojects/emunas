import { hostOf, productionHosts, QUIET_SUBDOMAIN } from "@emunas/links";
import { describe, expect, it } from "vitest";
import { readSiteRoutes, SITES } from "./site-routes.ts";

// The production domain is whatever Quiet's route says (library.<domain>); every other site's
// route must agree with productionHosts(<domain>). A domain change edits the wrangler files only.
const quiet = readSiteRoutes("quiet");
const quietHost = quiet.hosts[0] ?? "";
const DOMAIN = quietHost.slice(QUIET_SUBDOMAIN.length + 1);
const expected = productionHosts(DOMAIN);

describe("site Worker routes match @emunas/links productionHosts", () => {
  it("Quiet is on library.<domain>", () => {
    expect(quiet.hosts).toHaveLength(1);
    expect(quietHost.startsWith(`${QUIET_SUBDOMAIN}.`)).toBe(true);
    expect(`https://${quietHost}`).toBe(expected.quiet);
  });

  it("covers home, quiet and live", () => {
    expect([...SITES].sort()).toEqual(["home", "live", "quiet"]);
  });

  for (const site of SITES) {
    describe(site, () => {
      const r = readSiteRoutes(site);
      const want = hostOf(expected[site]);

      it("production custom domain is exactly its productionHosts host", () => {
        expect(r.hosts).toEqual([want]);
        expect(r.other).toEqual([]);
      });

      it("staging claims no route", () => {
        expect(r.envRoutes["staging"]).toEqual([]);
      });
    });
  }
});
