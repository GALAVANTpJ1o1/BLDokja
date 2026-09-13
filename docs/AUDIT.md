# Audit: legacy LetterPairTrainer

Audited 2026-09-13 for Phase 0 of [BRIEF.md](../BRIEF.md).

- **Source:** `Desktop/LetterPairTrainer/`. Its hand-written files are copied byte-for-byte into [`legacy/`](../legacy/) (hashes in [Appendix A](#appendix-a--file-inventory)).
- **Database:** `letterpairs.db` is **not** in this repo. It stays at `../LetterPairTrainer/letterpairs.db`.
- **Method:** every hand-written file was read in full. The database was analysed on a hash-verified copy and never opened directly. Behavioural claims marked *(verified)* were checked by running code: helper functions extracted from `app.py` via `ast`, or queries against the copy. They are not inferred from reading alone.

---

## Summary

- **What it is.** A Flask web app for **letter-pair → word association**, a **timed letter-span "memo" drill**, and a small native Android client for the same JSON API.
- **What it isn't.** There is **no cube logic of any kind**: no scrambles, no tracing, no sticker model, no buffers, no algorithms. "Speffz" in the code only means "the letters A–X". Nothing here needs porting into `cube-engine`.
- **The data is in very good shape.** `PRAGMA integrity_check` returns `ok`.

  | Table | Rows | Contents |
  |---|---|---|
  | `pair_words` | 678 | **All 552 distinct-letter pairs have at least one word. No gaps.** |
  | `memo_attempts` | 51 | Drill history, 2026-06-21 → 2026-08-05 |
  | `app_settings` | 4 | Memo drill settings |

- **Worst risks in the old app:**
  1. Data can be deleted by any web page open in the same browser while the server runs.
  2. A working-directory-relative DB path silently creates an empty library.
  3. There is no history or backup anywhere except OneDrive's own versioning.
- **The memo drill doesn't measure what it claims.**
  - Sequences are a shuffled deck of letters, not traced memo.
  - Scoring is positional, so one dropped letter marks everything after it wrong. In 17 of your 51 attempts the stored score is lower than the answer deserved.
- **Four things in the brief conflict with the data** ([§5](#5-where-the-data-contradicts-the-brief)). The main two:
  - The old app treats the grid as **552** pairs, not 576.
  - Each pair can hold **several words with usage counts**, not a single image.

---

## 1. What the app does

### Architecture

```
Browser (Jinja pages + static/script.js) ──┐
                                           ├──► Flask app.py ──► sqlite3.connect("letterpairs.db")
Android app (Java, HttpURLConnection) ─────┘      (single writer; new connection per call)
```

- **Stack:** `Flask>=3.0,<4.0` and nothing else ([requirements.txt](../legacy/requirements.txt)). No ORM, no migrations, no tests.
- **Schema:** created at import time by `init_db()` ([app.py:167](../legacy/app.py#L167), called at [app.py:820](../legacy/app.py#L820)).
- **Connections:** every function opens and closes its own connection ([app.py:29](../legacy/app.py#L29)).

### Pages and routes

| Route | Method | Template | Behaviour | Writes DB |
|---|---|---|---|---|
| `/` | GET | index.html | Shows a pair picked by `generate_pair()`; type a word | — |
| `/submit` | POST | index.html | Validate → insert word, or `count += 1` if it exists → show all words for that pair → next pair | yes |
| `/words/add` | POST | redirect | Same insert-or-increment as `/submit` | yes |
| `/browse` | GET | browse.html | 24×24 "heatmap": filled or empty, with the top word in each cell | — |
| `/pair/<pair>` | GET | pair.html | All words for one pair, with add and remove | — |
| `/words` | GET | words.html | Full table plus `LIKE` search on pair or word | — |
| `/words/<id>/delete` | POST | redirect | **Hard delete** of one row | yes |
| `/memo` | GET | memo.html | Settings panel, stats, and a new "round" | — |
| `/memo/settings` | POST | redirect | Upsert of 4 settings | yes |
| `/memo/score` | POST | memo.html | Score the answer, insert into `memo_attempts`, show review | yes |
| `/api/pairs/random` | GET | JSON | `{"pair": "AB"}` | — |
| `/api/pairs/<pair>/words` | GET | JSON | Words for a pair plus the top word | — |
| `/api/words` | GET | JSON | All words, optional `?q=` | — |
| `/api/words` | POST | JSON | Insert or increment; token required only if `API_TOKEN` is set | yes |
| `/api/words/<id>` | DELETE | JSON | Hard delete; token required only if `API_TOKEN` is set | yes |

### The four features

**Practice** ([index.html](../legacy/templates/index.html), [app.py:476](../legacy/app.py#L476))
- The app shows a pair and you type the first word that comes to mind. Every submission increments that word's `count`, so the "most common word" is the one you've typed most often.
- "Reveal Common Word" fetches the top word over the API and records nothing.
- `generate_pair()` ([app.py:213](../legacy/app.py#L213)) picks an unseen pair (no words yet) 70% of the time while any remain; otherwise it picks uniformly from all 552.

**Heatmap** ([browse.html](../legacy/templates/browse.html))
- The page reads "N / 552 pairs learned", where *learned* means "has at least one word". Diagonal cells are disabled.

**Database editor** ([words.html](../legacy/templates/words.html), [pair.html](../legacy/templates/pair.html))
- Add, search and remove words. "Remove" deletes immediately, with no confirmation and no undo.

**Memo practice** ([memo.html](../legacy/templates/memo.html), [script.js:150](../legacy/static/script.js#L150))
1. The server generates a corner string and an edge string of configured length.
2. The browser flashes corner letters one at a time on a fixed timer, pauses, then flashes edge letters.
3. You type edges, then corners. The server scores them positionally, stores the attempt, and shows a "review sentence" built from each pair's top word.
4. Stats shown: attempts, overall letter accuracy, best attempt, and a streak of perfect attempts.

**Android** ([MainActivity.java](../legacy/android/app/src/main/java/com/letterpairtrainer/MainActivity.java))
- A native Java activity (not a WebView) with practice, reveal, add word, and a read-only list capped at 80 rows.
- It has no offline mode. The server URL and token are compiled in through `BuildConfig` ([app/build.gradle:5-28](../legacy/android/app/build.gradle#L5)).
- There's no evidence it was ever deployed: [ANDROID_AND_DEPLOYMENT.md](../legacy/ANDROID_AND_DEPLOYMENT.md) only has placeholder domains, and the default URL is the emulator loopback `10.0.2.2`.

**Theme**
- Light and dark, stored in `localStorage` ([script.js:16](../legacy/static/script.js#L16)).

## 2. Is there anything worth porting?

**Cube logic: no.** For the record, this is everything that looks cube-shaped:

| Code | What it actually is | Keep? |
|---|---|---|
| `SPEFFZ_LETTERS = A..X` ([app.py:12](../legacy/app.py#L12)) | An alphabet. No stickers, faces or pieces | No. The new scheme model replaces it |
| `generate_realistic_memo_sequence` ([app.py:325](../legacy/app.py#L325)) | A shuffled deck (§3.2) | No. Real memo comes from traced scrambles |
| `chunk_pairs` ([app.py:363](../legacy/app.py#L363)) | Groups letters into pairs and keeps a trailing single | Trivial; the new `TraceResult.pairs` already covers it |
| `validate_pair` ([app.py:43](../legacy/app.py#L43)) | Two A–X letters, not equal | No. Hardcoded alphabet; see §5 on same-letter pairs |

**Ideas worth keeping (the concepts, not the code):**
- **Turning a memo into a sentence of your own words** (`build_memo_review`, [app.py:398](../legacy/app.py#L398)). It's a good bridge from letters to images, and a natural feature for the new guided trace mode's session summary.
- **Several candidate words per pair, weighted by how often you reach for them.** The brief's model of one image per pair throws this away; see §5.
- **"Type the first word that comes to mind"** as a way to *discover* an image, which is different from *drilling* one you already have.
- **Input that uppercases and drops anything outside the alphabet as you type** ([script.js:56](../legacy/static/script.js#L56)). Sensible, but the new version must read the alphabet from the user's scheme.

**Buffers:** the code has no idea what a buffer is, so §13 Q2 can't be answered from it.

---

## 3. Fragile or subtly wrong

Ordered by how much damage each can do.

### 3.1 Data safety

**D1. Any website can delete your library while the server is running.**
- `POST /words/<id>/delete` ([app.py:623](../legacy/app.py#L623)) has no CSRF protection. A page on any site can auto-submit a hidden form to `http://localhost:5000/words/N/delete`.
- IDs are sequential integers (1–688 today), so a loop wipes everything.
- `DELETE /api/words/<id>` is also open by default: `API_TOKEN` is empty, and CORS defaults to `*` ([app.py:16](../legacy/app.py#L16), [app.py:153](../legacy/app.py#L153)). Flask answers the preflight automatically.
- Deletes are hard deletes, and nothing is logged.
- Browsers are adding restrictions on public sites calling `localhost`, but the app itself defends against none of this.
- 10 IDs are already gone: `51, 198, 245, 369, 536, 574, 603, 620, 651, 683` *(verified)*. They were probably typos you removed, but nothing in the DB can confirm that.

**D2. The DB path is relative to the working directory.**
- `DB_NAME = "letterpairs.db"` ([app.py:11](../legacy/app.py#L11)) is passed straight to `sqlite3.connect`, which creates the file if it's missing. `init_db()` runs **on import**.
- So starting the app from any other folder (say `flask --app LetterPairTrainer/app run` from the Desktop) silently creates an empty DB beside wherever you ran it. The heatmap then shows 0 / 552 and new words land in the wrong file.
- It looks exactly like data loss, and if you keep using it, it splits the library in two.

**D3. No history anywhere.**
- The project's `.git` folder is empty, and `pair_words` has no timestamps.
- An **earlier version of the app existed and its code is lost**. `memo_attempts` row 1 has `difficulty = 'easy'` and letters repeated within one sequence (`IGUSIK`, `VFVAKMGX`) *(verified)*. Neither is possible with the current code.
- The only thing protecting this data before today was OneDrive's own file versioning.

**D4. Importing `app.py` changes the filesystem.** Because `init_db()` runs at import, any tool, test or REPL that does `import app` creates or opens a DB in its working directory. That's why this audit extracted functions via `ast` instead of importing the module.

### 3.2 Correctness

**C1. `count` mixes three different things.** It goes up when you:
- type a word in practice ([app.py:487](../legacy/app.py#L487)),
- add a word that already exists in the editor ([app.py:521](../legacy/app.py#L521)), or
- click "Reveal" and then type the revealed word.

So "most common" is partly self-reinforcing and partly editor noise, not a measure of which image comes to you naturally. A typo entered once is stored forever with `count = 1`, and the data has plenty (§4.6).

**C2. Practice mode records nothing about recall.**
- It doesn't store whether you knew the pair, how long you took, or whether you peeked.
- "552 / 552 learned" only means "every pair has a word".
- Now that every pair has a word, `generate_pair()` is plain uniform random over 552 pairs. There's no spacing and no recency guard, so the same pair can come up twice in a row.

**C3. The memo drill is not BLD memo.**
- **The generator is a shuffled deck.** It pops letters from a shuffled A–X list and only reshuffles when the list is empty. The `random.randint(2, 5)` "cycle length" never changes the output: chunks can't span a reshuffle, so the result is always "shuffled A–X, truncated". *Verified*: 0 repeated letters across 200,000 sequences of length ≤ 24, and adjacent-pair frequencies match a plain shuffle within sampling noise.
- **It has no pieces, buffer, cycle breaks, twists, flips or parity.** Its statistics will differ from real traced memo. I'll measure exactly how once the Phase 1 engine exists, rather than guessing now.
- **Fixed-rate flashing isn't memo.** Letters flash one at a time on a fixed timer. Real memo is self-paced with the whole cube in front of you, so this is closer to a letter-span test.
- **Positional scoring punishes one slip everywhere.** `count_matching_letters` ([app.py:355](../legacy/app.py#L355)) compares index by index, so one dropped letter marks every later letter wrong. *Verified*: expected `ABCDEFGH`, answer `ACDEFGH` scores **1 / 8**. Compared with a longest-common-subsequence alignment, **17 of your 51 stored attempts are under-scored** (e.g. attempt #49 stored 12 / 20, deserved 16; #3 stored 9 / 21, deserved 12). Your "Accuracy" and "Best" stats are pessimistic and noisy.
- **Anything outside A–X in an answer is silently dropped** (`normalize_memo_answer`, [app.py:347](../legacy/app.py#L347)). `"ab yz c"` becomes `"ABC"` *(verified)*. Harmless with Speffz, broken for any other scheme.
- **The server trusts the client for the expected answer.** It sits in hidden inputs and `data-` attributes ([memo.html:110-131](../legacy/templates/memo.html#L110)), so it's also visible in the page source.
- **The two review cards are the same code.** One is labelled "auditory" for edges and the other "pictorial" for corners ([memo.html:68-73](../legacy/templates/memo.html#L68)), but both run identical code over the same word library.
- **`difficulty` is dead.** It's always written as `'custom'` ([app.py:779](../legacy/app.py#L779)).
- **`created_at` is UTC with no timezone marker.** It comes from `CURRENT_TIMESTAMP`, and you're on IST, so any naive display or import is off by 5 h 30 m.

**C4. The heatmap and the pair page break ties differently.**
- `/browse` sorts by `pair, count DESC` with no tie-breaker ([app.py:535](../legacy/app.py#L535)). The pair page, memo review and API sort by `count DESC, word ASC`.
- **89 pairs currently have a tied top count.** The two pages agree today only because SQLite's query plan happens to scan the `(pair, word)` unique index first (`EXPLAIN QUERY PLAN`: `SCAN pair_words USING INDEX sqlite_autoindex_pair_words_1`).
- A different plan, or the Postgres move the deploy doc recommends, would make them disagree. It's a latent bug, not a live one.

**C5. Words are lowercased on write** ([app.py:39](../legacy/app.py#L39)). Every proper noun has lost its capitalisation (`los angeles`, `xavier`, `california`), and no migration can get it back.

**C6. Same-letter pairs are forbidden.** `validate_pair` rejects them and `TOTAL_PAIRS = 24 × 23 = 552` ([app.py:13](../legacy/app.py#L13)). The brief says 576. I'm deliberately not saying which is right: whether a same-letter pair can come out of a real trace gets settled computationally in Phase 1. See §5.

**C7. Smaller bugs:**
- The settings form returns HTTP 500 for `nan`, `inf` or `1e400` (`ValueError` / `OverflowError` in `seconds_to_ms`, [app.py:245](../legacy/app.py#L245)) *(verified)*.
- A stored setting like `"3000.0"` would quietly reset to its default, because it's parsed with `int()`.
- Search doesn't escape `%` or `_` in `LIKE` ([app.py:593](../legacy/app.py#L593)), so searching `_` matches every row.
- `save_pair_word` does SELECT then INSERT with no transaction guard ([app.py:87](../legacy/app.py#L87)). Two submits of the same word at once would hit the UNIQUE constraint and return 500.
- Connections aren't closed when an exception is raised.

**C8. Front-end fragility:**
- **One storage error disables most of the page.** `setupThemeToggle` reads `localStorage` without try/catch ([script.js:17](../legacy/static/script.js#L17)); the inline script in `<head>` does wrap it. It's the first call in the `DOMContentLoaded` handler, so where storage throws (blocked site data, some embedded views), **Reveal and the whole memo trainer never initialise**.
- **Memo timing drifts in background tabs.** It uses `setTimeout`, which browsers throttle in background tabs.
- **Sub-second pauses are labelled "0 second pause"** ([script.js:174](../legacy/static/script.js#L174)).
- **A round can't be stopped or restarted without reloading.**
- **Screen readers get nothing during memo.** The flashing letter and status have no `aria-live` ([memo.html:118-119](../legacy/templates/memo.html#L118)).
- **`inputmode="latin"` isn't a valid value** ([memo.html:136](../legacy/templates/memo.html#L136)).

### 3.3 Security

- **S1.** `python app.py` runs `debug=True` on `0.0.0.0` ([app.py:824](../legacy/app.py#L824)), which exposes Werkzeug's interactive debugger to everyone on your Wi-Fi. It's PIN-protected, but it should never be reachable from the network.
- **S2.** No CSRF protection anywhere, CORS `*` by default, and API writes and deletes are unauthenticated unless `API_TOKEN` is set (see D1).
- **S3.** There's a hardcoded fallback `SECRET_KEY` ([app.py:9](../legacy/app.py#L9)).
- **S4. Android:**
  - `usesCleartextTraffic="true"` applies to the whole app ([AndroidManifest.xml:7](../legacy/android/app/src/main/AndroidManifest.xml#L7)).
  - The API token is compiled into `BuildConfig`, so anyone holding the APK can extract it.
  - JSON bodies are built by string concatenation that only escapes `\` and `"` ([MainActivity.java:315](../legacy/android/app/src/main/java/com/letterpairtrainer/MainActivity.java#L315)). A tab or other control character produces invalid JSON. `get_json(silent=True)` turns that into `{}`, and the user sees the misleading "Letter pair must contain exactly two letters."
- **Credit where it's due:**
  - Jinja autoescaping is on, and the JS builds DOM with `textContent`, so typed words can't inject markup.
  - All SQL is parameterised; the only f-string builds `?` placeholders.
  - The `next` redirect is protected against open redirects.

### 3.4 Android and deployment notes

- Deployment doc: [ANDROID_AND_DEPLOYMENT.md:61](../legacy/ANDROID_AND_DEPLOYMENT.md#L61) points at a Python interpreter inside a Codex runtime folder that only exists on your machine.
- Android runtime behaviour:
  - Rotating the screen recreates the activity and loses the current pair.
  - Every save re-downloads the full word list.
- Build:
  - Uses AGP 8.7.3 with a Gradle 9.3.0 wrapper.
  - A debug APK was built on 2026-06-23; I didn't try rebuilding it.

### 3.5 Design and accessibility, for Phase 2

- **Two of CLAUDE.md's "generated-design tells" are here:**
  - Tracked-out uppercase `.eyebrow` labels above almost every heading ([style.css:174](../legacy/static/style.css#L174)).
  - Identical bordered cards with the same soft shadow.
  
  The palette is teal on off-white.
- **The heatmap doesn't work on a phone.**
  - It's a fixed-layout 25-column table with `overflow-x: hidden` ([style.css:395](../legacy/static/style.css#L395)).
  - Under 620 px, words are hidden and pair labels drop to `0.36rem` ([style.css:726-743](../legacy/static/style.css#L726)), about 6 px.
- **The heatmap has only two states** (has a word or doesn't). There's no recall data to colour it by.

---

## 4. The letter-pair database

### 4.1 File facts

| | |
|---|---|
| Path | `C:\Users\shivk\OneDrive\Desktop\LetterPairTrainer\letterpairs.db` |
| Size / mtime | 65,536 B / 2026-09-13 13:37:23 +05:30 |
| SHA-256 | `4622dd929f2ed7c25298e3ac2b2a23f535aec2c0861116cde5d4795dfc6051d5` |
| Backup (new file, same hash) | `…\LetterPairTrainer\letterpairs.backup-2026-09-13.db` |
| Sidecars | none (`-wal`, `-journal` and `-shm` all absent) |
| `page_size` × `page_count` | 4096 × 16 |
| `freelist_count` | **0** (no free pages, so deleted rows aren't recoverable from the file structure) |
| `journal_mode` / `encoding` / `auto_vacuum` | delete / UTF-8 / 0 |
| `user_version` / `application_id` | 0 / 0 (no schema versioning) |
| `integrity_check` / `foreign_key_check` | `ok` / empty |
| File change counter | 1083 |

### 4.2 Exact schema

This is verbatim from `sqlite_master`, whitespace included:

```sql
-- table pair_words (rootpage 2)
CREATE TABLE pair_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        word TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(pair, word)
    )
-- index sqlite_autoindex_pair_words_1 (rootpage 3) — implicit, from UNIQUE(pair, word)

-- table sqlite_sequence (rootpage 4)
CREATE TABLE sqlite_sequence(name,seq)

-- table memo_attempts (rootpage 5)
CREATE TABLE memo_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        difficulty TEXT NOT NULL,
        corners_expected TEXT NOT NULL,
        edges_expected TEXT NOT NULL,
        corners_answer TEXT NOT NULL,
        edges_answer TEXT NOT NULL,
        correct_letters INTEGER NOT NULL,
        total_letters INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )

-- table app_settings (rootpage 10)
CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
-- index sqlite_autoindex_app_settings_1 (rootpage 11) — implicit, from PRIMARY KEY
```

There are no views, triggers or explicit indexes.

`sqlite_sequence` = `[('pair_words', 688), ('memo_attempts', 51)]`

**Storage classes.** SQLite is dynamically typed, so I checked every value's `typeof()`. **Every column holds exactly its declared type:**
- no NULLs
- no integers stored as text
- no blobs

### 4.3 What each `pair_words` column means (from the code)

| Column | Meaning | Written by |
|---|---|---|
| `id` | Autoincrement surrogate key. `rowid == id` for every row | insert |
| `pair` | Two uppercase letters A–X, never the same letter twice | `normalize_pair` → `validate_pair` |
| `word` | Your mnemonic: lowercased, trimmed, internal whitespace collapsed, 1–80 chars | `normalize_word` → `validate_word` |
| `count` | How many times this exact word was submitted for this pair, from practice *or* the editor (see C1) | insert = 1, then `+1` per repeat |

**A pair has as many words as you've given it.** The "image" for a pair isn't stored anywhere; the app computes it as the highest `count`, with ties broken inconsistently (C4).

### 4.4 Completeness

| Measure | Value |
|---|---|
| Rows | **678** |
| Distinct pairs with ≥ 1 word | **552** |
| …of the 552 distinct-letter pairs | **552 (100%), 0 missing** |
| …of all 576, counting same-letter pairs | 552; the 24 missing are exactly the diagonal `AA…XX` |
| Pairs outside A–X, wrong length or wrong case | 0 |
| Sum of all `count` values | 990 |

The SQL `COUNT(DISTINCT pair)` and a Python set over the 24×24 grid both give 552.

```
    A B C D E F G H I J K L M N O P Q R S T U V W X      # = has ≥1 word
 A  - # # # # # # # # # # # # # # # # # # # # # # #      - = same-letter pair, no word
 B  # - # # # # # # # # # # # # # # # # # # # # # #      (no "." cells: nothing missing)
 C  # # - # # # # # # # # # # # # # # # # # # # # #
 D  # # # - # # # # # # # # # # # # # # # # # # # #
 E  # # # # - # # # # # # # # # # # # # # # # # # #
 F  # # # # # - # # # # # # # # # # # # # # # # # #
 G  # # # # # # - # # # # # # # # # # # # # # # # #
 H  # # # # # # # - # # # # # # # # # # # # # # # #
 I  # # # # # # # # - # # # # # # # # # # # # # # #
 J  # # # # # # # # # - # # # # # # # # # # # # # #
 K  # # # # # # # # # # - # # # # # # # # # # # # #
 L  # # # # # # # # # # # - # # # # # # # # # # # #
 M  # # # # # # # # # # # # - # # # # # # # # # # #
 N  # # # # # # # # # # # # # - # # # # # # # # # #
 O  # # # # # # # # # # # # # # - # # # # # # # # #
 P  # # # # # # # # # # # # # # # - # # # # # # # #
 Q  # # # # # # # # # # # # # # # # - # # # # # # #
 R  # # # # # # # # # # # # # # # # # - # # # # # #
 S  # # # # # # # # # # # # # # # # # # - # # # # #
 T  # # # # # # # # # # # # # # # # # # # - # # # #
 U  # # # # # # # # # # # # # # # # # # # # - # # #
 V  # # # # # # # # # # # # # # # # # # # # # - # #
 W  # # # # # # # # # # # # # # # # # # # # # # - #
 X  # # # # # # # # # # # # # # # # # # # # # # # -
```

**How many words each pair has**

| Words per pair | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Pairs | 434 | 111 | 6 | 1 (`AM`) |

118 pairs have more than one word, covering 244 rows between them.

**`count` distribution**

| count | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Rows | 449 | 166 | 47 | 13 | 2 | 1 |

### 4.5 Word shape

| Measure | Result |
|---|---|
| Length | 1–20 characters, median 6, mean 6.5 |
| Multi-word entries | 129 (e.g. `los angeles`, `ticket counter`) |
| Leading/trailing whitespace, double spaces, uppercase, non-ASCII, control characters, HTML-like characters | **none** |
| Characters other than letters and spaces | 11 rows: `k-on`, `wall-e`, `4` (IV), `6` (VI), `80` (AT), `wd40`, `ak47`, `pg13`, `sb737`, `rs3m`, `nat20` |
| Words not starting with the pair's first letter | 49 of 678 |

- **Digits and punctuation.** These affect the brief's TTS drill: speech will read `4` as "four", not "IV".
- **Words that don't start with the pair's letter are deliberate** phonetic and semantic links, e.g. `XU → shut`, `XW → shaw`, `NA → sodium`, `OH → hydroxide`, `TA → star`. **The new app must never check a word against its letters.**

### 4.6 Things that look wrong, or at least worth a look

> **Decided at the Phase 0 review.** These are your confirmed typos. Spelling fixes, space variants and the `yes`/`no` placeholders are corrected or flagged at import, following the approved table in [MIGRATION.md §3.6](MIGRATION.md#36-corrections-applied-at-import). The lists below are the findings exactly as they were found during the audit.

**Probable typos stored next to the correct spelling** (same pair, count in brackets):
- `EN` engish (1) / english (1)
- `EP` epstien (1) / epstein (2)
- `GC` group chay (1) / group chat (1)
- `GK` general knowlegde (1) / general knowledge (1) / gk (1)
- `NS` nise shot (1) / nice shot (3)
- `LV` lui vuiton (1) / luis vuiton (1)
- `HM` honorable mention (1) / honourable mention (2), a spelling variant
- `EI` eienstien (1), no correct spelling next to it

**The same word saved twice, with and without a space** (11 pairs):
- `BP` bloodpressure / blood pressure
- `FB` facebook (3) / face book (1)
- `FW` fuckwith / fuck with
- `HC` hermitcraft / hermit craft
- `HG` homegirl / home girl
- `LN` lightnovel / light novel
- `MB` muscleblaze / muscle blaze
- `SD` sdslayer (2) / sd slayer (2)
- `SW` seaweed / sea weed
- `TH` townhall (3) / town hall (1)
- `UG` undergrad / under grad

**One word used for several pairs.** This makes an **image → pair** drill ambiguous (§5). There are 13:

| Word | Pairs |
|---|---|
| no | EI, EO, IE |
| california | CA, CF |
| juniper | JN, JU |
| loss | LO, LS |
| lucario | LC, LU |
| rick | RI, RK |
| teto | TE, TO |
| uma | UA, UM |
| unc | UC, UN |
| veto | VE, VT |
| vulture | VL, VU |
| war | WA, WR |
| wifies | WF, WI |

**Other oddities:**
- `EO` holds both `yes` and `no`.
- `EI`, `EO` and `IE` all map to `no`.
- 89 pairs have a tied top count, so the "image" shown is effectively arbitrary.

  | Tie size | Pairs |
  |---|---|
  | 4-way | `AM`: amv, amaze, amigo, am |
  | 3-way | `CU`, `GK`, `IU`, `QS`, `SW` |

- **Near-duplicates that are different words, not typos:** `dora/dove`, `data/delta`, `plant/plank`, `ultron/ultra`, `quagsire/quagmire`, `polo/porn`, `nile/null`, `quad/quid`, `image/imagine`, `mimi/mimimi`. I've listed them so you can confirm they're intentional alternatives.

**Privacy:** the library contains personal and crude entries, and this file quotes some of them. If this repo ever goes public, that matters. More importantly, your library must never ship as the site's default content.

### 4.7 Representative sample

**The first pair of each first letter, with all of its words** (id, word, count), deterministic:

| Pair | Rows |
|---|---|
| AB | (32, abacus, 3) |
| BA | (126, barbarian, 2) |
| CA | (686, california, 1) |
| DA | (366, data analysis, 2) |
| EA | (302, ea sports, 1) |
| FA | (195, fanta, 1) |
| GA | (86, gay, 2) |
| HA | (524, hall, 1) |
| IA | (66, iat, 2) |
| JA | (98, jay, 1) |
| KA | (7, kanga, 3) |
| LA | (53, los angeles, 2) |
| MA | (514, mass, 1) |
| NA | (321, sodium, 2) |
| OA | (572, oak, 1) |
| PA | (564, panda, 1) |
| QA | (664, qatar, 1) · (93, quick attack, 1) |
| RA | (213, rasputin, 1) |
| SA | (254, sam, 1) · (85, santa, 1) |
| TA | (23, star, 1) |
| UA | (9, uma, 1) |
| VA | (190, voice actor, 3) |
| WA | (404, war, 4) |
| XA | (400, xavier, 3) |

**The first and last rows by `id`** (insertion order):

| id | pair | word | count | | id | pair | word | count |
|---|---|---|---|---|---|---|---|---|
| 1 | XU | shut | 1 | | 676 | WC | welcome | 1 |
| 2 | NE | nemo | 1 | | 677 | FI | fish | 1 |
| 3 | VS | vscode | 2 | | 678 | GP | group | 1 |
| 4 | VI | vivi | 1 | | 679 | SD | sd slayer | 2 |
| 5 | IJ | injection | 2 | | 680 | JH | jack of heart | 2 |
| 6 | ET | everest | 1 | | 681 | ME | meruem | 1 |
| 7 | KA | kanga | 3 | | 682 | LU | lucario | 1 |
| 8 | IX | ixigo | 3 | | 684 | OH | hydroxide | 2 |
| 9 | UA | uma | 1 | | 685 | QU | queen | 1 |
| 10 | PR | pear | 1 | | 686 | CA | california | 1 |
| 11 | HW | homework | 4 | | 687 | GC | group chay | 1 |
| 12 | XW | shaw | 2 | | 688 | AM | am | 1 |

### 4.8 `memo_attempts`: 51 rows. This is user data too.

**Coverage and dates**
- **Date range:** 2026-06-21 08:21:12 → 2026-08-05 14:44:07, stored as UTC.

  | Day (UTC) | Attempts |
  |---|---|
  | 06-21 | 7 |
  | 06-25 | 13 |
  | 06-26 | 25 |
  | 07-13 | 2 |
  | 07-27 | 1 |
  | 08-03 | 2 |
  | 08-05 | 1 |

**Column values**
- **`difficulty`:** `custom` × 50, `easy` × 1 (row 1, from the lost earlier version).
- **Expected lengths:**
  - corners: 8 in 44 rows, plus a few 6, 9 and 10
  - edges: 12 in 43 rows, plus a few 8, 10, 11 and 13
- **`accuracy`** equals `correct_letters / total_letters` exactly in every row. It's stored as a fraction from 0 to 1.
- **No empty answers.**

**Results**
- 8 perfect attempts.
- 17 attempts under-scored by positional matching (C3).

**Sample rows**

| id | corners exp → ans | edges exp → ans | score | created_at (UTC) |
|---|---|---|---|---|
| 1 | IGUSIK → IGUSIK | VFVAKMGX → VFVAFMGX | 13/14 | 2026-06-21 08:21:12 (`easy`) |
| 2 | CPGNFDUV → CPGNFDUV | OMBCQDLAVX → OMBCQDLAVX | 18/18 | 2026-06-21 10:00:14 |
| 3 | RPIKJWOQTD → RPIKJQ | IUAOSHWJMKC → IUAOQMXC | 9/21 | 2026-06-21 10:02:55 |
| 49 | EFBJLHIU → EFBJLHU | HPSGWFKIEAVX → HFSGWJKIAVXU | 12/20 | 2026-08-03 06:54:38 |
| 51 | UHSAMNVO → UHSAMNVO | XIUQDNWKPHFT → SIUQPHWK | 13/20 | 2026-08-05 14:44:07 |

### 4.9 `app_settings`: 4 rows

| rowid | key | value |
|---|---|---|
| 69 | corner_length | 8 |
| 70 | edge_length | 12 |
| 71 | letter_time_ms | 1000 |
| 72 | phase_time_ms | 2000 |

The rowids started at 69 because `INSERT OR REPLACE` deletes and re-inserts every time, so settings have been saved about 17 times.

Three of the four stored values differ from the code defaults: edge length (12 vs 10), letter time (1000 ms vs 3000 ms) and phase time (2000 ms vs 5000 ms). Only corner length (8) matches.

---

## 5. Where the data contradicts the brief

1. **552, not 576.**
   - The brief (§7.4, §8) says "24×24 grid" and "576 pairs".
   - The old app forbids same-letter pairs, and your library has none.
   - **Proposal:** in the new schema a pair is simply two letters. Whether same-letter pairs are *offered* in drills gets decided by what the Phase 1 engine shows can actually come out of a trace, and is recorded in DECISIONS.md. The grid UI can still be 24×24 with the diagonal handled explicitly.
2. **One image per pair vs. several words with counts.**
   - §7.4 describes "per-pair: image/word, optional notes, optional category".
   - Your data has 118 pairs with alternatives, each weighted by use.
   - Collapsing to one image would lose data, so that option is out.
   - **Proposal:** one *primary* image per pair plus ordered *alternates*, each keeping its legacy count. That's in MIGRATION.md, and one of the questions below.
3. **The gap finder has nothing to find.**
   - Every pair is filled, and no drill history exists to rank pairs by.
   - The useful "gaps" in your library are about **quality**: typos, spacing duplicates, ties, and words shared between pairs.
   - **Proposal:** make the gap finder a *library health* view covering all of these, which also works for users whose libraries really are incomplete.
4. **Image → pair drills are ambiguous for 13 words.** §7.4 lists "image → pair" as a drill mode, so that mode needs a rule for words that map to several pairs. The options are to accept any of them, or to warn in the library-health view.
5. **The database is more than letter pairs.**
   - "Nothing in that library may be lost" has to cover `memo_attempts` (51 rows of real practice history) and `app_settings`, not only `pair_words`.
6. **There is no tracing, lettering or scramble logic.**
   - §1 expected some worth porting, but there is none.
   - §13 Q2 (buffers) can't be answered from the code.

## 6. Decisions from the Phase 0 review

All questions from Phase 0 are answered. Nothing is left open. Phase 0 was confirmed complete on 2026-09-13.

### §13 questions

- **Q1: what's in the DB, and does anything look wrong?**
  - **Typos and space variants.** The §4.6 typos and space variants are mistakes and get corrected at import.
    - Spelling fixes, and which form each space variant merges into, follow the reviewed table in [MIGRATION.md §3.6](MIGRATION.md#36-corrections-applied-at-import).
    - Where a pair already has the correct form, the two merge and their use counts add up.
    - Your original rows stay untouched in the legacy snapshot, so every correction can be undone.
  - **Placeholders.** `no` on EI, EO and IE, and `yes` on EO, aren't typos.
    - They're imported as **placeholders** and flagged "needs a word".
    - A placeholder is never picked as a pair's main word while another word exists.
    - After import, EO and IE have no real word yet.
  - **Result:** 678 rows become 660 words across 552 pairs. That's 18 merges, and total uses stay at 990. 550 pairs have a real word.
- **Q2: which buffers?**
  - The user chooses the buffer, for both corners and edges, and no personal buffer is assumed. That's already brief §7.6.
  - The beginner lessons and the generated 3-style set still need one default. It'll be proposed in Phase 1, after the engine has verified the conventions.
- **Q3: default 3-style set?**
  - Generate it with the engine's comm search, and let users add or override their own algs per case.
  - Every generated alg is verified in the engine.
  - Published sheets are used only to compare quality, never copied.
- **Q4: anything to keep as-is?** Yes, these three features:
  1. **"Type the first word that comes to mind"** as a way to find an image for a pair. It should log discovery separately from drilling, so use counts don't get mixed the way they do now (C1).
  2. **Turning a memo into a sentence of your own words.**
  3. **The 24×24 overview of the whole library.**
  
  **Conflict:** "exactly as it is" can't apply literally to the overview. The old heatmap is unusable at 380 px (§3.5), and the brief's quality floor requires the cube and trainers to work there. Proposal: keep what it shows and how it behaves, and redesign its layout for mobile in Phase 2 or 4.

### Other questions

- **Only copy:** `Desktop/LetterPairTrainer/letterpairs.db` is the only copy with real data. No phone or deployed server ever held words that aren't in it.
- **Several words per pair:** keep all of them, with a main word first and the alternates after it. Drills use the main word; alternates stay visible and editable with their use counts. See MIGRATION.md §3.2.
- **Fixing typos later:** the app **suggests and never changes words automatically**.
  - When you add a word, and in the library cleanup view, it offers "did you mean", based on a dictionary and your own existing words. You accept or dismiss each suggestion.
  - Silent autocorrect is ruled out because many of your words are deliberately not in any dictionary (`kokonut`, `iat`, `ixigo`).
  - This adds to brief §7.4 and gets built with the letter-pair library in Phase 4.
- **Memo history:** re-score it. The original score stays exactly as stored, and a score using sequence alignment (longest common subsequence) is stored next to it (MIGRATION.md §3.3).
- **Android:** retired in favour of the offline web app (PWA). No API-compatible path will be kept. `legacy/android/` stays in the repo as a read-only record.

---

## Appendix A — File inventory

Copied into `legacy/`. SHA-256 is identical in the source folder and the copy *(verified by diffing manifests)*.

```
1c6bd25c9b8e88cdadb3d2d5ea6be155fff01b0ad464b0b66e3007ef4d1b6a2a  ANDROID_AND_DEPLOYMENT.md
71413c72275383c4bf96985b96c192d7677cc0ca795a4ac2dbcb2cb4664a0acd  android/app/build.gradle
e7efc715b75e44a10bdaba6ab0f23dc4a90c085eac11e4f865caf6dcb771b61b  android/app/src/main/AndroidManifest.xml
704fed2ab2f520af81f03a32f0a90eeeeb9ecbc2037ff5216b3964e6c054cffd  android/app/src/main/java/com/letterpairtrainer/MainActivity.java
77991c61be51deb37ccea0d8ec432f9fbecf5e988d542a916f5be71da6124183  android/app/src/main/res/values/strings.xml
925a30f4203c7e8bb4f86bab13e7f18805c79482f54b33e44c7ff03aedb3bc1a  android/app/src/main/res/values/styles.xml
9779e64941ef00fdb75ecd9ccbf290bad2a4924ea0e1688bb1c617884e2753b6  android/build.gradle
f855a38f15e05a8375ddb6ea469f2be1c1daec015ce8cc2ad23800e5dc7259e5  android/gradle/wrapper/gradle-wrapper.properties
faeda4dfe8910520d62b890d0def56f8a9d97abf36928d57bbde31a85d206ec7  android/settings.gradle
6165e73c6514292a42d6619835371e3e1d0368f405630a2698376d7e1f4e90eb  app.py
76571d5df62392d623f80fd01ffeaa70a7167623978e87569060c2f44208cebe  requirements.txt
39bb6207eb10717feb12de31bd193cb9399d9276ba39c261cb01015ddd9be8be  static/script.js
70243496a34910a9b9aafe794d281519708392027f7d5f74401f07caa007dc85  static/style.css
8d55d7b275af86825dbed778e46fa00d0161fa41f28a4f2d417ecc69639ee591  templates/base.html
777f73fd98eb329740d05b333d14ce475769a32bd0558fa76a7497d2aefe6e54  templates/browse.html
785978206500e67d6a1f0ff35c8e7e0faaeb6dccb7337b1c49496ad65171d197  templates/index.html
211ee01cb2bf3ca2d30607f5dfb19add776f50fae7cdf0398b5a080757627e7f  templates/memo.html
2fb6cd9d94978ca5924cc9bd86b4775747c59fedac2d48f341d0059fb31fe6ea  templates/pair.html
a353fc37229acc42879fea10c0a15cca1759f904d0a8c5de6e0cdfe7e63605aa  templates/words.html
```

**Not copied, and not read line by line**, because they're generated, binary, machine-specific or empty:

| Excluded | Reason |
|---|---|
| `letterpairs.db` | Personal data; documented in §4 instead |
| `android/build/`, `android/app/build/` | Gradle output: APK, dex, intermediates, problems report |
| `android/.gradle/` | Gradle caches |
| `android/.idea/` | IDE state |
| `android/local.properties` | SDK path for one machine |
| `android/gradlew`, `android/gradlew.bat`, `gradle-wrapper.jar` | Standard generated wrapper |
| `.git/` | Empty directory |
| `.agents/` | Empty directory |

## Appendix B — Reproducing the numbers

All queries run against a byte copy, opened with `sqlite3.connect("file:<copy>?mode=ro", uri=True)`.

```sql
PRAGMA integrity_check; PRAGMA foreign_key_check; PRAGMA freelist_count; PRAGMA user_version;
SELECT type, name, tbl_name, rootpage, sql FROM sqlite_master ORDER BY rowid;
SELECT typeof(pair), typeof(word), typeof(count), COUNT(*) FROM pair_words GROUP BY 1, 2, 3;
SELECT COUNT(*) FROM pair_words;                                              -- 678
SELECT COUNT(DISTINCT pair) FROM pair_words
 WHERE length(pair) = 2
   AND substr(pair,1,1) BETWEEN 'A' AND 'X' AND substr(pair,2,1) BETWEEN 'A' AND 'X'
   AND substr(pair,1,1) <> substr(pair,2,1);                                  -- 552
SELECT n, COUNT(*) FROM (SELECT pair, COUNT(*) n FROM pair_words GROUP BY pair) GROUP BY n;
SELECT count, COUNT(*) FROM pair_words GROUP BY count;
SELECT pair, MAX(count) top, COUNT(*) FROM pair_words p
 WHERE count = (SELECT MAX(count) FROM pair_words WHERE pair = p.pair)
 GROUP BY pair HAVING COUNT(*) > 1;                                           -- 89 tied pairs
SELECT word, group_concat(pair) FROM pair_words GROUP BY word HAVING COUNT(DISTINCT pair) > 1;
SELECT * FROM sqlite_sequence;
EXPLAIN QUERY PLAN SELECT pair, word, count FROM pair_words ORDER BY pair, count DESC;
```

The near-duplicate search used Levenshtein distance ≤ 2 between words in the same pair, both at least 4 characters. Re-scoring used the longest common subsequence of expected vs. answer, per piece type.

## Appendix C — Integrity of the original

| When | SHA-256 of `letterpairs.db` |
|---|---|
| Before any access | `4622dd929f2ed7c25298e3ac2b2a23f535aec2c0861116cde5d4795dfc6051d5` |
| After the audit | `4622dd929f2ed7c25298e3ac2b2a23f535aec2c0861116cde5d4795dfc6051d5` |
