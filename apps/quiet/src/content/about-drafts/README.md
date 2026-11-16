# About page drafts (W5.3) — DRAFT, not published

These files are **drafts for the owner** of the five About parts, in English and Yiddish. They are
not on the site. The About page (`src/pages/[ed]/about/`) reads only
`src/content/about/{ed}/{part}.md`; this folder is outside that path, so every part keeps its marked
placeholder until a person approves a text (integration-plan §8 W5.3: "No generated text in About").

Parts, in page order: `mashgiach`, `arrangement`, `notes`, `report`, `excluded`.

`[[OWNER: …]]` marks text only the owner or the Mashgiach's family and talmidim can supply (his titles,
his biography, who recorded the shiurim, what happens to a report). Nothing there is to be guessed.

To publish a part:

1. Rewrite or approve the draft. A named reviewer signs off the Yiddish.
2. Remove every `[[OWNER: …]]` mark and change the front matter to `status: approved`, with
   `approvedBy` and `approvedAt` filled in.
3. Move the file to `src/content/about/{ed}/{part}.md`.
4. Update the About test in `src/components/seo/test/site.build.test.ts` ("holds no generated
   text"), which today expects a placeholder in every part.

`about-drafts.test.ts` checks that the drafts stay complete and marked, and that nothing marked
`DRAFT` or `[[OWNER` is ever placed under `src/content/about/`.
