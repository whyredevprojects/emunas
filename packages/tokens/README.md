# @emunas/tokens

Design primitives shared by both sites (integration-plan §1.3, §8 W1.7): CSS custom properties and
self-hosted, subset woff2 fonts. Theme, components and layout stay in each app.

```css
@import "@emunas/tokens/fonts.css";   /* @font-face rules; urls are relative, bundlers copy the files */
@import "@emunas/tokens/tokens.css";  /* @layer tokens { :root { --step-0 … --color-ink … } } */
```

```ts
import { preloadFonts, fontManifest, colors } from "@emunas/tokens";
preloadFonts("serif", "he"); // ["frank-ruhl-libre-hebrew.woff2"]: only the edition's body face
```

## Tokens (`src/tokens.ts` → `css/tokens.css`)

`--step--2 … --step-6` (type scale, rem), `--leading-*`, `--weight-*`, `--measure-*`,
`--space-0 … --space-4xl`, `--radius-*`, `--rule-*`, `--duration-*`, `--ease-standard`,
`--font-serif-latin|serif-hebrew|sans-latin|sans-hebrew`, and `--font-text` / `--font-ui` /
`--leading-text`, which switch to the Hebrew stacks under `:lang(yi)` / `:lang(he)`. Which
languages those are comes from `LANG_SCRIPT` (one script per `UiLang` of `@emunas/i18n`; Yiddish
and Hebrew are `hebrew`), which also picks the face `preloadFonts` returns; a new interface
language must be given its script there (tsc reports it).

Colour roles `--color-{paper, paper-sunk, surface, ink, ink-muted, ink-faint, rule, rule-strong,
accent, accent-hover, on-accent, focus, highlight, now-playing, danger, success}` for light and dark:
light is the default whatever the OS prefers; `<html data-theme="dark">` switches to dark. The
choice is the `emunas_theme` cookie, shared by both sites (`src/theme.ts`). `test/contrast.test.ts`
holds ink to 7:1 (AAA), other text roles to 4.5:1 and focus to 3:1 in both themes. `ink-faint` and `rule*` are not for text.

`src/` is the source of truth. After changing it run `npm run css -w @emunas/tokens`;
`test/css.test.ts` fails when the committed CSS is stale.

## Fonts

| Family | Use | Source (OFL 1.1) | Faces |
|---|---|---|---|
| Frank Ruhl Libre | Hebrew/Yiddish text face | `@fontsource-variable/frank-ruhl-libre@5.3.0` | Hebrew; digits + punctuation; wght 400–700 |
| Emunas Hebrew Marks | Only for clusters Frank Ruhl Libre cannot draw (cantillation U+0591–05AF, U+05C4–05C6, U+FB1E, U+FB29) | Noto Serif Hebrew, `@fontsource-variable/noto-serif-hebrew@5.3.0` | Hebrew, static 400 |
| Source Serif 4 | Latin book face | `@fontsource-variable/source-serif-4@5.3.1` | Latin + transliteration, roman wght 400–700, italic 400 |
| Noto Sans Hebrew | Live UI, Hebrew | `@fontsource-variable/noto-sans-hebrew@5.3.0` | Hebrew; digits + punctuation; wght 400–700 |
| Noto Sans | Live UI, Latin | `@fontsource-variable/noto-sans@5.3.0` | Latin + transliteration, wght 400–700 |

11 files, about 133 KiB in total (budget 220 KB, tested). Each face has a `unicode-range`, so a
page downloads only the files its text needs; the marks face comes second in the Hebrew stack and
is reached only by pointed-with-teamim text. Hebrew faces carry `size-adjust` (1.1 serif, 1.04
sans) so Hebrew reads at equal weight beside Latin (concept-quiet §8); the marks face is scaled to
match Frank Ruhl Libre's letter height. `font-display: swap` with local fallback faces
(`… Fallback`) whose ascent/descent/line-gap overrides come from the web fonts' hhea metrics.
No `size-adjust` width matching is attempted for the fallbacks (we have no fallback font files to
measure).

Licences are in `fonts/licenses/` (copied from each package) and the OFL copyright/licence name
records are kept inside every subset file.

### Regenerating the subsets

`fonts/sources.json` pins the npm packages, the faces and the code-point ranges.
`scripts/subset_fonts.py` runs `npm pack` for each pinned package (npm checks the registry
integrity hash, which is recorded in `fonts/manifest.json`), limits the `wght` axis, subsets with
all OpenType layout features kept (GPOS mark/mkmk for nikud), drops hinting and writes woff2,
`fonts/manifest.json` and `fonts/licenses/`. Output is byte-for-byte deterministic.

```sh
python3 -m venv /tmp/fonts-venv
/tmp/fonts-venv/bin/pip install -r packages/tokens/scripts/requirements.txt
/tmp/fonts-venv/bin/python -I packages/tokens/scripts/subset_fonts.py
npm run css -w @emunas/tokens
npm test -w @emunas/tokens
```

`--src DIR` reuses already extracted packages instead of `npm pack`.

### Coverage test (`test/fonts.test.ts`)

Reads the committed `css/fonts.css`, opens every referenced woff2 with a small built-in WOFF2/cmap
reader (`test/woff2.ts`, no Python needed in CI) and checks that a code point is drawable only when
it is both in the file's cmap and in that face's `unicode-range`:

- Hebrew serif stack (Frank Ruhl Libre + marks) and Hebrew sans: U+05D0–05EA, U+05F0–05F4,
  U+FB1D–FB4F, U+0591–05C7 (the five unassigned code points in U+FB1D–FB4F are skipped).
- Frank Ruhl Libre alone: all letters, Yiddish digraphs and nikud.
- Source Serif 4 (roman and italic) and Noto Sans: ASCII and transliteration (ḥ Ḥ ṭ ṣ ẓ š ž ā ē ī ō ū ś ʾ ʿ ’ ‘).
  Ḳ ḳ and ẖ are not in Source Serif 4 and fall back to the system serif.
- File sizes and sha256 match the manifest, every licence is present, total ≤ 220 KB.
