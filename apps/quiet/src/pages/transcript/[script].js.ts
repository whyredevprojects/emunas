/**
 * `/transcript/follow-text.js` (W5.2): the client script of the "Follow the text" slot
 * (`components/shiur/FollowText.astro`). Emitted only when at least one public transcript file is
 * published (EMUNAS_TRANSCRIPT_VIEW=on and an approved recording), so a default build carries no part
 * of the view. The function below is compiled with the site and served as its own source text; it
 * uses nothing from the module scope.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { readPublishedTranscripts } from "@emunas/corpus/transcript-gate";
import { findCorpusDir } from "../../components/shiur/corpus.ts";

/** Fetches each approved public file and lists its cues as player time links (`a.time[data-g]`). */
export function followText(doc: Document): void {
  const clock = (s: number): string => {
    const t = Math.max(0, Math.floor(s));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const ss = String(t % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  };
  const isCues = (x: unknown): x is [number, number, string][] =>
    Array.isArray(x) &&
    x.every((c) => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" && typeof c[2] === "string");

  for (const root of Array.from(doc.querySelectorAll<HTMLElement>("[data-follow-text]"))) {
    for (const box of Array.from(root.querySelectorAll<HTMLElement>("[data-follow-src]"))) {
      const status = doc.createElement("p");
      status.setAttribute("role", "status");
      status.textContent = root.dataset["loading"] ?? "";
      box.append(status);
      const offset = Number(box.dataset["offset"]) || 0;
      const audio = box.dataset["audio"] ?? "";
      fetch(box.dataset["followSrc"] ?? "", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body: unknown) => {
          const cues = (body as { cues?: unknown } | null)?.cues;
          if (!isCues(cues)) throw new Error("shape");
          const list = doc.createElement("ol");
          list.className = "follow-text-cues";
          for (const [start, , text] of cues) {
            const li = doc.createElement("li");
            const g = offset + start;
            if (audio) {
              const a = doc.createElement("a");
              a.className = "time";
              a.dir = "ltr";
              a.href = `${audio}#t=${Math.floor(start)}`;
              a.dataset["g"] = String(g);
              a.textContent = clock(g);
              li.append(a, " ");
            }
            const span = doc.createElement("span");
            span.textContent = text;
            li.append(span);
            list.append(li);
          }
          status.remove();
          box.append(list);
        })
        .catch(() => {
          status.textContent = root.dataset["failed"] ?? "";
        });
    }
  }
}

export const getStaticPaths = (() => {
  const dir = findCorpusDir();
  return dir && readPublishedTranscripts(dir).size > 0 ? [{ params: { script: "follow-text" } }] : [];
}) satisfies GetStaticPaths;

export const GET: APIRoute = () =>
  new Response(`(${followText.toString()})(document);\n`, {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
