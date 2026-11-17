# Embedding model eval (O10)

Generated 2026-11-16T23:58:03.446Z over 59512 moment rows; 60 queries (20 en, 20 yi, 20 cross-language/transliteration).

**Stand-in run, not a model comparison.** These numbers come from the deterministic hashing embedder
(`fake/hashing-trigram-1024`), which only proves the eval pipeline end to end. bge-m3 and qwen3-embedding-0.6b
have not been run yet because this workspace has no Cloudflare credentials. Run
`npx tsx apps/live/tests/eval/run.ts --embedder workers-ai --r2` with CLOUDFLARE_ACCOUNT_ID and
CLOUDFLARE_API_TOKEN set, then commit the regenerated report.

| model | set | recall@10 | MRR |
|---|---|---|---|
| fake/hashing-trigram-1024 | en (20) | 34.0 | 62.1 |
| fake/hashing-trigram-1024 | yi (20) | 32.3 | 51.1 |
| fake/hashing-trigram-1024 | cross (20) | 32.3 | 47.2 |
| fake/hashing-trigram-1024 | all (60) | 32.9 | 53.4 |

## Decision O10

Pending the real run. Until then the plan default stands: **@cf/baai/bge-m3** (integration-plan §6 O10,
tech-live §5.3), which is what `EMBED_MODEL` in workers/api/wrangler.jsonc already names. Both candidates
have 1,024 dimensions, so the Vectorize index does not change if qwen3 wins; the sync then re-embeds
everything (a model change rewrites every vector).

## Per query

| id | set | query | expected | recall@10 | first hit |
|---|---|---|---|---|---|
| en01 | en | the hidden miracle of Purim | 31 | 30.0 | 2 |
| en02 | en | lighting the Chanukah candles | 28 | 60.0 | 1 |
| en03 | en | receiving the Torah on Shavuos | 19 | 50.0 | 3 |
| en04 | en | the Pesach seder and leaving Egypt | 18 | 10.0 | 9 |
| en05 | en | Lag BaOmer and Rabbi Shimon bar Yochai | 16 | 60.0 | 2 |
| en06 | en | the month of Elul and teshuvah | 12 | 10.0 | 1 |
| en07 | en | counting the days of the Omer | 11 | 0.0 | 35 |
| en08 | en | the judgment of Rosh Hashanah | 11 | 30.0 | 2 |
| en09 | en | atonement on Yom Kippur | 10 | 40.0 | 1 |
| en10 | en | Noah, the ark and the flood | 11 | 40.0 | 1 |
| en11 | en | Yaakov takes the blessings from Esav | 11 | 20.0 | 3 |
| en12 | en | Yosef sold by his brothers | 10 | 10.0 | 9 |
| en13 | en | the splitting of the sea and the song | 13 | 30.0 | 1 |
| en14 | en | stories of the Baal Shem Tov | 40 | 30.0 | 4 |
| en15 | en | the Chofetz Chaim | 22 | 50.0 | 1 |
| en16 | en | Yaakov blesses his sons before his passing | 6 | 50.0 | 1 |
| en17 | en | Yisro and the giving of the Ten Commandments | 5 | 20.0 | 1 |
| en18 | en | mourning the destruction of the Temple on Tishah B'Av | 8 | 25.0 | 4 |
| en19 | en | rejoicing in the sukkah | 9 | 55.6 | 2 |
| en20 | en | the fifteenth of Av | 5 | 60.0 | 1 |
| yi01 | yi | דער נס פון פורים | 31 | 40.0 | 3 |
| yi02 | yi | חנוכה ליכט | 28 | 50.0 | 1 |
| yi03 | yi | קבלת התורה שבועות | 19 | 30.0 | 4 |
| yi04 | yi | יציאת מצרים און דער סדר | 18 | 10.0 | 7 |
| yi05 | yi | ל"ג בעומר רבי שמעון בר יוחאי | 16 | 60.0 | 1 |
| yi06 | yi | חודש אלול און תשובה | 12 | 10.0 | 5 |
| yi07 | yi | ספירת העומר | 11 | 0.0 | 14 |
| yi08 | yi | דער דין פון ראש השנה | 11 | 50.0 | 1 |
| yi09 | yi | כפרה אום יום כיפור | 10 | 40.0 | 1 |
| yi10 | yi | נח און דער מבול | 11 | 40.0 | 4 |
| yi11 | yi | יעקב און עשו און די ברכות | 11 | 10.0 | 5 |
| yi12 | yi | מכירת יוסף | 10 | 20.0 | 7 |
| yi13 | yi | קריעת ים סוף און די שירה | 13 | 20.0 | 8 |
| yi14 | yi | מעשיות פונעם בעל שם טוב | 40 | 0.0 | 12 |
| yi15 | yi | דער חוזה פון לובלין | 23 | 60.0 | 1 |
| yi16 | yi | יעקב בענטשט די שבטים | 6 | 33.3 | 4 |
| yi17 | yi | יתרו און מתן תורה | 5 | 40.0 | 6 |
| yi18 | yi | תשעה באב און דער חורבן | 8 | 25.0 | 1 |
| yi19 | yi | שמחה אין דער סוכה | 9 | 33.3 | 1 |
| yi20 | yi | פרשת שקלים | 4 | 75.0 | 1 |
| x01 | cross | zos chanukah | 18 | 70.0 | 1 |
| x02 | cross | purim katan | 11 | 30.0 | 2 |
| x03 | cross | shushan purim | 11 | 40.0 | 3 |
| x04 | cross | parshas Chayei Sarah | 7 | 14.3 | 1 |
| x05 | cross | lech lecha, Avraham leaves his land | 8 | 75.0 | 1 |
| x06 | cross | vayeira and the akeidah | 6 | 33.3 | 5 |
| x07 | cross | hoshana rabbah | 7 | 71.4 | 2 |
| x08 | cross | behar bechukosai | 6 | 0.0 | – |
| x09 | cross | the Satmar Rav | 19 | 40.0 | 3 |
| x10 | cross | the Sanzer Rav | 17 | 20.0 | 3 |
| x11 | cross | the Maggid of Mezritch | 16 | 20.0 | 2 |
| x12 | cross | Rebbe Reb Elimelech of Lizhensk | 10 | 40.0 | 1 |
| x13 | cross | Chiddushei HaRim of Ger | 9 | 44.4 | 1 |
| x14 | cross | the Kotzker Rebbe | 9 | 22.2 | 8 |
| x15 | cross | chodesh Nisan, the month of redemption | 8 | 25.0 | 7 |
| x16 | cross | the Chasam Sofer | 20 | 50.0 | 1 |
| x17 | cross | parshas Mishpatim | 5 | 20.0 | 6 |
| x18 | cross | דער סדר פון פסח | 7 | 0.0 | 19 |
| x19 | cross | חנוכה ליכט | 10 | 30.0 | 5 |
| x20 | cross | ראש השנה | 4 | 0.0 | 21 |
