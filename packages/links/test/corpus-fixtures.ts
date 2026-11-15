/**
 * A small synthetic corpus layer (the page flags C1.2 writes), for the corpus-entry tests.
 * Thresholds behind the flags (plan §2 D10): Quiet concept ≥5, person ≥3, work ≥2, story ≥2;
 * Live concept ≥3, person ≥3 and not other, work ≥3, story ≥2, thread ≥3 shiurim.
 */
import { createLinks, pageLookupFromLayer, type LayerPagesInput, type LinkData } from "../src/index.ts";
import { DATA, HOSTS } from "./fixtures.ts";

const both = { quiet: true, live: true } as const;
const none = { quiet: false, live: false } as const;
const liveOnly = { quiet: false, live: true } as const;
const quietOnly = { quiet: true, live: false } as const;

export const LAYER: LayerPagesInput = {
  topics: {
    tree: [
      { id: "emunah", pages: both },
      { id: "hashgacha-pratis", pages: both },
      { id: "hester-panim", pages: both },
      { id: "chanukah", pages: both },
    ],
  },
  concepts: {
    concepts: [
      { id: "tzimtzum", pages: both, mergedIntoTopic: null },
      // 3–4 shiurim: a Live page, only a glossary line on Quiet
      { id: "ohr-haganuz-short", pages: liveOnly, mergedIntoTopic: null },
      { id: "rare-term", pages: none, mergedIntoTopic: null },
      // one inyan, one entry: the topic page is the concept's entry
      { id: "hester-panim-term", pages: none, mergedIntoTopic: "hester-panim" },
    ],
  },
  people: {
    people: [
      { id: "divrei-chaim", pages: both },
      { id: "once-named", pages: none },
      { id: "hitler", pages: none }, // type other: no page on either site
    ],
  },
  works: {
    works: [
      { id: "ramban", pages: both },
      { id: "two-cites", pages: quietOnly },
      { id: "midrash", pages: none }, // generic
    ],
  },
  stories: {
    stories: [
      { id: "the-sugar-sled", pages: both },
      { id: "told-once", pages: none },
    ],
  },
  threads: {
    threads: [
      { id: "lechem-matzah-45", page: true },
      { id: "two-member", page: false },
    ],
  },
};

export const CORPUS_DATA: LinkData = { ...DATA, ...pageLookupFromLayer(LAYER) };

export const corpusLinks = createLinks({ hosts: HOSTS, data: CORPUS_DATA });
