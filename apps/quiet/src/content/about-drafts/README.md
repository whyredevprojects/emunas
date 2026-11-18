# About page drafts (W5.3) — DRAFT, not published

These files are **drafts for the owner** of the About parts not yet published, in English and
Yiddish. They are not on the site. Published so far (approved 2026-11-16): `arrangement`, `notes`,
`report`, `excluded`. Still a draft: `mashgiach`, to be written by a person. The About page (`src/pages/[ed]/about/`) reads only
`src/content/about/{ed}/{part}.md`; this folder is outside that path, so every part keeps its marked
placeholder until a person approves a text (integration-plan §8 W5.3: "No generated text in About").

Parts, in page order: `mashgiach`, `arrangement`, `notes`, `report`, `excluded`.

**Hebrew (`he/`).** Every part has a Hebrew draft, translated from the English and Yiddish texts
(the four published ones and the `mashgiach` draft). Until a Hebrew part is approved and moved to
`src/content/about/he/`, the Hebrew edition's About page shows the Yiddish text of that part
(marked `lang="yi"`), following `CONTENT_FALLBACK` from `@emunas/i18n`; links in it that point
into the Yiddish edition are moved to the Hebrew one. A Hebrew draft keeps the same
`[[OWNER: …]]` marks as the English. A named Hebrew reviewer signs it off before it moves.

`[[OWNER: …]]` marks text only the owner or the Mashgiach's family and talmidim can supply (his titles,
his biography, who recorded the shiurim, what happens to a report). Nothing there is to be guessed.

To publish a part:

1. Rewrite or approve the draft. A named reviewer signs off the Yiddish.
2. Remove every `[[OWNER: …]]` mark and change the front matter to `status: approved`, with
   `approvedBy` and `approvedAt` filled in.
3. Move the file to `src/content/about/{ed}/{part}.md`.
4. Both tests (`about-drafts.test.ts` and the About test in
   `src/components/seo/test/site.build.test.ts`) follow the files; nothing to change there.

`about-drafts.test.ts` checks that every part is either published or drafted in both editions, that
the drafts stay marked, and that nothing marked `DRAFT` or `[[OWNER` is ever placed under
`src/content/about/`.
