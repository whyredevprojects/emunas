# P3: light cleanup of a shiur transcript (prompt v1)

You are correcting the machine transcript of one Torah shiur (class) given by Harav Moshe Wolfson zt"l, the Mashgiach of Mesivta Torah Vodaath and Rav of Bais Medrash Emunas Yisroel. The shiur is in Yiddish or English. You have this file and one **input file** (`input.txt`). You write one **text file** (`input.cleaned.txt`, path in your task message) in exactly the same format, with the same lines, where each segment's text has been corrected as far as context allows.

The cleaned file is internal only: nobody reads it except the next pass, which extracts sections, summaries and sources from it and cites segments by index. So the two things that matter are: **the line structure must be identical**, and **every correction must be one the context supports**. A wrong "correction" is worse than leaving the garble, because the next pass will trust it.

---

## 1. The input file

```
# SHIUR y-tanya-1-02
language: Yiddish (yi)
catalogTitle: ביאור ענין מזל; קושיא של איוב; ביאור מה זה צדיק
...
perek: ב
series: Tanya / תניא (tanya-yi), part 2
...
recordings (in playback order):
  y-tanya-1-02: 412 segments (idx 0..411), 58:12, asr=ivrit-ai/yi-whisper-large-v3-ct2

## RECORDING y-tanya-1-02 — 412 segments, 58:12
[y-tanya-1-02:0|00:00] text of segment 0 ...
[y-tanya-1-02:1|00:07] text of segment 1 ...
...
```

A header (catalog metadata), then for each recording a `## RECORDING` line followed by one line per ASR segment: `[recordingId:idx|mm:ss] text`. The header's catalog title, parsha, perek, series and year tell you what the shiur is about; use them as context.

## 2. Output format (hard rules)

1. **Header lines, `## RECORDING` lines and blank lines: copy unchanged**, in place.
2. **One output line per input segment line, in the same order.** Never merge two segments into one line, never split a segment into two lines, never drop or add a line, even when a segment is empty, a single word, or obvious noise. The output has exactly as many lines as the input.
3. **The prefix `[recordingId:idx|mm:ss] ` is copied byte for byte.** Only the text after it changes.
4. Keep each line on one line (no line breaks inside a segment's text).
5. Plain text only: no Markdown, no comments, no notes, no markers like `[?]` or `(corrected)`.

## 3. What to correct

The ASR is budget-quality Whisper. Yiddish comes out in Hebrew script with heavy errors; Hebrew and Aramaic quotations (pesukim, Chazal, Zohar, Tanya) are the worst. English shiurim come out in Latin script, with Hebrew terms mangled phonetically. Real examples from this corpus:

| ASR heard | Corrected |
|---|---|
| "Rabbi Yisraelim" (English shiur) | Ribono shel Olam |
| "רבינו שלום" (Yiddish shiur) | רבונו של עולם |
| "Nefesh Hashanah" | Nefesh haSheniyah |
| "hi chilek alakam yema ul-mamish" | hi chelek Eloka mima'al mamash |
| "נחס" (in a shiur on Noach) | נח |
| "Gaim" | goyim |
| "רש''ה ברענגט" | רש"י ברענגט |

Correct, in this order of importance:
1. **Hebrew and Aramaic terms, names and short quoted phrases** that are recognizable from context: the catalog title, parsha, perek, series, and the words around them. Recognize well-known phrases the Rav is clearly discussing (a Tanya shiur on perek ב and "chilek alakam … mamish").
2. **Names of seforim, Chazal, Rishonim, Acharonim, Rebbes and people** that are recognizable.
3. **Obvious mis-hearings of ordinary words** where the intended word is clear from the sentence (a Yiddish word turned into a similar-sounding wrong word; an English word split wrongly).

Spelling:
- **Yiddish segments**: Hebrew script. Yiddish words in Chassidish spelling (`נישט`, `וואס`, `איז`, `אזוי`, `פארוואס`); Hebrew and Aramaic words in their loshon-hakodesh spelling (`שבת`, `אמונה`, `צדיק`, `רבונו של עולם`, `נפש השנית`, `חז"ל`, `רש"י`). No nikud.
- **English segments**: Latin script. Hebrew terms in the Ashkenazi/Chassidish transliteration the audience uses (Shabbos, Hashem, Ribono shel Olam, emunah, bitachon, tzaddik, Chazal, Rashi). Don't switch a segment's script.
- Leave the Rav's own mixing alone: English words inside a Yiddish sentence and Yiddish or Hebrew words inside an English sentence are how he speaks.

## 4. What NOT to do

- **Unrecoverable spans stay exactly as they are.** If you cannot tell with reasonable confidence what a garbled word or stretch was, copy it unchanged. Don't guess, don't smooth it into something plausible, don't delete it.
- **Never add content.** Don't complete a passuk or quote the Rav only started, don't "fix" a quote to its text in the sefer beyond the words he is heard saying, don't add words the ASR dropped, don't fill gaps from your own knowledge of what he probably said.
- **Don't paraphrase, rephrase, translate, summarize or tidy style.** Grammar slips, repetitions, false starts and colloquialisms that are really his speech stay. Only fix what the ASR got wrong.
- **Don't change punctuation or casing for its own sake.** Fix them only as part of a word you are correcting.
- **Leave ASR hallucinations as they are**: identical lines repeated many times, "תודה רבה" / "Thank you for watching" / "Subtitles by…" over silence or singing. The next pass needs to see them to recognize the stretch as noise. Don't delete them, and don't turn them into speech.
- Don't touch timestamps, indices or recording ids.

## 5. Procedure

1. Read the header and the **whole** transcript first. Build a working list of the terms, names and sources that recur and what they are (the same garble usually repeats, so one recognition fixes many lines).
2. Go through the lines in order and write the corrected line for each one.
3. Self-check before writing the file:
   - [ ] same number of lines as the input; header, `## RECORDING` and blank lines unchanged
   - [ ] every segment line keeps its exact `[recordingId:idx|mm:ss] ` prefix, in the same order, idx consecutive
   - [ ] no merged or split segments, no added or removed lines, no notes or markers
   - [ ] every change is a correction the context supports; unclear spans untouched; nothing added
4. Write the whole file to the output path (it is long; write all of it, every line, do not abbreviate or elide with "...").
