/**
 * `/transcript/<recordingId>.json` (W5.2; integration-plan §4 last bullet): the public transcript
 * files the "Follow the text" slot (`components/shiur/FollowText.astro`) reads. One path per file that
 * `readPublishedTranscripts` accepts in `.corpus/transcript/`, so with the defaults
 * (EMUNAS_TRANSCRIPT_VIEW off, empty eligibility) there are no paths and nothing is written.
 * The guard post-pass accepts exactly these files and only for eligible recordings.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { readPublishedTranscripts } from "@emunas/corpus/transcript-gate";
import { findCorpusDir } from "../../components/shiur/corpus.ts";

export const getStaticPaths = (() => {
  const dir = findCorpusDir();
  if (!dir) return [];
  return [...readPublishedTranscripts(dir)].map(([rec, file]) => ({ params: { rec }, props: { body: JSON.stringify(file) } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response((props as { body: string }).body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
