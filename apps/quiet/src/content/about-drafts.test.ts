/**
 * The About texts (W5.3): a part is an approved file under `content/about/{ed}/` in both editions,
 * or a draft under `content/about-drafts/{ed}/` in both editions, or both: an approved part may
 * have a revision waiting for the owner. Drafts stay marked DRAFT and are never in the folder the
 * About page reads, so an unapproved part is left off the page and an approved one keeps its
 * approved text (integration-plan §8 W5.3, "No generated text in About").
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findMetaComments } from "@emunas/corpus-guard";
import { describe, expect, it } from "vitest";
import { ABOUT_PARTS } from "../pages/[ed]/about/_strings.ts";

const here = dirname(fileURLToPath(import.meta.url));
const drafts = join(here, "about-drafts");
const published = join(here, "about");
const EDS = ["en", "yi"] as const;
const PUBLISHED = ABOUT_PARTS.filter((p) => existsSync(join(published, "en", `${p}.md`)));
/** Parts with a draft: every unpublished part, and revisions of published ones. */
const DRAFTED = ABOUT_PARTS.filter((p) => existsSync(join(drafts, "en", `${p}.md`)));
const POINTED = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05F0-\u05F2]/u;

function frontMatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function body(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("About drafts", () => {
  it("cover every part not published, in both editions, and nothing else", () => {
    expect(DRAFTED).toContain("mashgiach");
    for (const part of ABOUT_PARTS) expect(PUBLISHED.includes(part) || DRAFTED.includes(part), part).toBe(true);
    for (const ed of EDS) {
      expect(readdirSync(join(drafts, ed)).sort(), ed).toEqual(DRAFTED.map((p) => `${p}.md`).sort());
      expect(readdirSync(join(published, ed)).sort(), ed).toEqual(PUBLISHED.map((p) => `${p}.md`).sort());
    }
  });

  it("are marked DRAFT and unapproved", () => {
    for (const ed of EDS) {
      for (const part of DRAFTED) {
        const fm = frontMatter(readFileSync(join(drafts, ed, `${part}.md`), "utf8"));
        expect(fm["status"], `${ed}/${part}`).toBe("DRAFT");
        expect(fm["approvedBy"], `${ed}/${part}`).toBe("null");
      }
    }
  });

  it("leave the facts only the owner can supply as [[OWNER: …]] marks, in both editions alike", () => {
    for (const part of DRAFTED) {
      const count = (ed: string) => (body(readFileSync(join(drafts, ed, `${part}.md`), "utf8")).match(/\[\[OWNER:/g) ?? []).length;
      expect(count("yi"), part).toBe(count("en"));
    }
    expect(body(readFileSync(join(drafts, "en", "mashgiach.md"), "utf8"))).toContain("[[OWNER: the Mashgiach's name with his full titles");
  });

  /** Every text of a part: the approved one and the draft, where they exist. */
  const dirsOf = (part: (typeof ABOUT_PARTS)[number]): string[] => [
    ...(PUBLISHED.includes(part) ? [published] : []),
    ...(DRAFTED.includes(part) ? [drafts] : []),
  ];

  it("are written in the edition's script; the Yiddish has no nikud or ligatures", () => {
    for (const part of ABOUT_PARTS) {
      for (const dir of dirsOf(part)) {
        const en = body(readFileSync(join(dir, "en", `${part}.md`), "utf8"));
        const yi = body(readFileSync(join(dir, "yi", `${part}.md`), "utf8")).replace(/\[\[OWNER:[^\]]*\]\]/g, "");
        expect(en, part).not.toMatch(/[\u0590-\u05FF]/u);
        expect(yi, part).toMatch(/[\u05D0-\u05EA]/u);
        expect(yi, part).not.toMatch(POINTED);
      }
    }
  });

  it("never mention a transcript path or field", () => {
    for (const file of [...walk(drafts), ...walk(published)]) {
      expect(readFileSync(file, "utf8"), relative(here, file)).not.toMatch(/transcripts\/|heardAs|asrNotes|audioKey|transcriptKey/);
    }
  });

  it("never remark on the transcript or the shiur itself (the guard's term list)", () => {
    for (const ed of EDS) {
      for (const part of ABOUT_PARTS) {
        for (const dir of dirsOf(part)) {
          const text = body(readFileSync(join(dir, ed, `${part}.md`), "utf8"));
          expect(findMetaComments(text).map((h) => h.term), `${ed}/${part}`).toEqual([]);
        }
      }
    }
  });

  it("are not where the About page reads its texts", () => {
    for (const file of walk(published)) {
      const text = readFileSync(file, "utf8");
      expect(frontMatter(text)["status"], relative(here, file)).not.toBe("DRAFT");
      expect(text, relative(here, file)).not.toContain("[[OWNER:");
      expect(frontMatter(text)["status"], relative(here, file)).toBe("approved");
      expect(frontMatter(text)["approvedBy"], relative(here, file)).not.toBe("null");
    }
  });
});
