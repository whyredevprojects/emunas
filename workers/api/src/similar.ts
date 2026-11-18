/**
 * GET /api/similar?moment=<id>&limit=10: neighbours of one moment from Vectorize, other
 * shiurim only (the precomputed related.neighbors is the primary source; this is the fallback).
 */
import { BadRequest, error, json } from "./http.ts";
import type { Env } from "./env.ts";
import { parseSimilarParams, type SimilarParams } from "./params.ts";
import { corpusRev, hydrate, momentIdsOfVectors } from "./search.ts";
import { otherUiLangs, type UiLang } from "@emunas/i18n";
import { vectorIdFor, type SimilarResponse, type SimilarResult } from "./contract.ts";
import { roundScore } from "./rank.ts";

export async function handleSimilar(request: Request, env: Env): Promise<Response> {
  let p: SimilarParams;
  try {
    p = parseSimilarParams(new URL(request.url).searchParams);
  } catch (e) {
    if (e instanceof BadRequest) return error("bad_request", e.param);
    throw e;
  }

  const db = env.DB_SEARCH;
  const [rev, self] = await Promise.all([corpusRev(db), hydrate(db, [p.moment], null)]);
  const source = self.get(p.moment);
  if (!source) return error("not_found");

  // The recording's own language first, then every other interface language (UI_LANGS order).
  const langs: UiLang[] = [source.audioLang, ...otherUiLangs(source.audioLang)];
  let matches: VectorizeMatch[] | null = null;
  for (const lang of langs) {
    try {
      const res = await env.VEC.queryById(vectorIdFor(p.moment, lang), { topK: Math.min(100, p.limit * 4), returnMetadata: "none" });
      if (res.matches.length > 0) {
        matches = res.matches;
        break;
      }
    } catch {
      // vector missing for this language, or Vectorize unavailable: try the next, then give up
    }
  }
  if (matches === null) return json({ rev, results: [] } satisfies SimilarResponse);

  const best = new Map<string, number>();
  const momentIds = await momentIdsOfVectors(db, matches.map((m) => m.id));
  for (const [i, m] of matches.entries()) {
    const momentId = momentIds[i] ?? null;
    if (momentId === null || momentId === p.moment) continue;
    if (!best.has(momentId)) best.set(momentId, m.score);
  }
  const facts = await hydrate(db, [...best.keys()], null);
  const results: SimilarResult[] = [];
  for (const [id, score] of best) {
    const f = facts.get(id);
    if (!f || f.shiurId === source.shiurId) continue;
    results.push({
      momentId: f.id,
      shiurId: f.shiurId,
      kind: f.kind,
      t: f.t,
      end: f.end,
      title: { ...f.titles },
      score: roundScore(score),
    });
    if (results.length >= p.limit) break;
  }
  return json({ rev, results } satisfies SimilarResponse);
}
