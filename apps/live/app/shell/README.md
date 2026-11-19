# Live app shell (`app/shell`)

`ui-layout.tsx` is the route module for `/:ui/*` (`ui` ∈ `UI_LANGS` from `@emunas/i18n`: `en` | `yi`
| `he`). It renders the skip link, the header (site name, command bar, language control, dark-colours
toggle), the rail, `<main id="main">` with the page, and the dock slot. It stays mounted for every
page under every `/<ui>/` edition, including a switch between them. The language control links to
the same page in each other interface language (named in its own language, `UI_ENDONYM`); the
reading language for notes can be any interface language, and a text with no translation in it falls
back along `CONTENT_FALLBACK` (he → yi → en), carrying the `lang`/`dir` of the text shown.

For page authors (waves 3–4):

- **One `h1` per page.** After every client navigation that changes the path, focus moves to
  `main h1` (`behaviour.ts`). Query/hash-only changes (`?t=`) do not move focus.
- **Strings:** `useT()` from `../i18n` (typed keys from `i18n/en.ts`; add the Yiddish and Hebrew strings to
  `i18n/yi.ts` and `i18n/he.ts` or `tsc` fails). Data vocabulary comes from `@emunas/i18n`.
- **Data strings:** always through `<Text>` (`../components/Text.tsx`): `lang` for generated text,
  `shiurLang` for catalog originals (`null` when the string belongs to no one shiur), or a `LocalizedText` value with `lang` (the reader; the text falls back along `CONTENT_FALLBACK`).
- **Settings:** `useSettings(s => s.audio)`, `readingLang(state, ui)`, `audioAllows(filter, lang)`
  from `settings.ts`. Values also live in `?audio=`/`?read=` (defaults omitted).
- **The dock:** the player UI calls `registerDock(PlayerDock)` once (e.g. from its module, imported by
  the shell). The slot's height (`--dock-height`) is always reserved; the registered component is
  mounted once and never remounted by navigation (`shell.test.tsx`, `test/e2e/shell.spec.ts`).
- **CSS:** CSS Modules in `@layer components`, tokens from `@emunas/tokens`, logical properties only.
  Shell classes are typed through `styles.ts`.

`/` (`routes/home.tsx`) is the static fallback of the Worker's language redirect. The shell stores
the last interface language in localStorage and in the cookie `emunas_ui` (`ui-preference.ts`), which
the site Worker (W2.7) can read for its `/` redirect.

Colours are light (paper) by default whatever the OS prefers. `ThemeToggle.tsx` opts into dark: it
sets `<html data-theme="dark">` and the cookie `emunas_theme`, shared with the Quiet site
(`@emunas/tokens` `theme.ts`). The inline script in `root.tsx` applies a dark choice before paint.
