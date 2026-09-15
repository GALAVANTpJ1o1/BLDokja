import { defaultRecencyWindow, selectionWeights, type Puzzle, type Rng, type Scheme } from "@bld/cube-engine";
import { graphemes, type AppEvent, type LetterPair, type PairImage } from "@bld/storage";
import { statsFor, type CaseSchedule } from "@bld/srs";
import { z } from "@/lib/zod";
import { scrambleTraces, sessionScramble } from "./guided-trace";

/**
 * The letter-pair library (BRIEF §7.4): what the grid, drills, library health and CSV transfer do to
 * your pairs, as pure functions over stored records. Nothing here changes a word on its own: every
 * edit is a function the UI calls on an explicit action, and suggestions are only offered (AUDIT §6).
 */

export const PAIRS_TRAINER = "pairs";

/** The library's letters: every letter the scheme gives a corner or an edge, in alphabetical order. */
export function libraryLetters(scheme: Scheme): string[] {
  const letters = new Set<string>();
  for (const pieceType of ["corners", "edges"] as const) for (const letter of Object.values(scheme.letters[pieceType] ?? {})) letters.add(letter);
  return [...letters].sort((a, b) => a.localeCompare(b));
}

export const isPlaceholder = (image: PairImage): boolean => image.flags?.includes("placeholder") === true;

/** The main image: the first image that isn't a placeholder (MIGRATION §3.2 keeps placeholders last). */
export function mainImage(pair: LetterPair | undefined): PairImage | undefined {
  return pair?.images.find((image) => !isPlaceholder(image));
}

export const normaliseWord = (text: string): string => text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const squashed = (text: string): string => normaliseWord(text).replace(/\s/g, "");

/** Memo pairs from letters in reading order. A trailing lone letter becomes a self-pair only when asked (D-013, D-015). */
export function memoPairIds(letters: readonly string[], loneLetters: "selfPair" | "skip"): string[] {
  const ids: string[] = [];
  for (let i = 0; i < letters.length; i += 2) {
    const first = letters[i];
    const second = letters[i + 1];
    if (first === undefined) break;
    if (second !== undefined) ids.push(`${first}${second}`);
    else if (loneLetters === "selfPair") ids.push(`${first}${first}`);
  }
  return ids;
}

/**
 * How often each pair has come up in your guided-trace sessions, rebuilt from the logged letters of each
 * scramble and piece type. Only complete pairs count: the log doesn't say whether a scramble was
 * finished, so a trailing lone letter can't be told apart from an abandoned scramble.
 */
export function seenPairs(events: readonly AppEvent[]): Map<string, number> {
  const scrambles = new Map<string, Map<number, string>>();
  for (const event of events) {
    if (event.type !== "drill.attempt" || event.trainer !== "trace" || event.seed === undefined || event.detail === undefined) continue;
    const { scrambleIndex, pieceType, index, letter } = event.detail;
    if (typeof scrambleIndex !== "number" || typeof pieceType !== "string" || typeof index !== "number" || typeof letter !== "string") continue;
    const key = `${event.seed}#${String(scrambleIndex)}#${pieceType}`;
    const letters = scrambles.get(key) ?? new Map<number, string>();
    letters.set(index, letter);
    scrambles.set(key, letters);
  }
  const counts = new Map<string, number>();
  for (const letters of scrambles.values()) {
    const ordered = [...letters.entries()].sort((a, b) => a[0] - b[0]).map(([, letter]) => letter);
    for (const id of memoPairIds(ordered, "skip")) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

const FrequencyReportSchema = z.object({
  format: z.literal("bld-platform/letter-pair-frequencies"),
  version: z.literal(2),
  examples: z.array(
    z.object({
      buffers: z.object({ corners: z.string(), edges: z.string() }),
      memoItems: z.object({ selfPair: z.object({ corners: z.record(z.string(), z.number().int().nonnegative()), edges: z.record(z.string(), z.number().int().nonnegative()) }) }),
    }),
  ),
});

/**
 * How often each cell occurs as a memo item for these buffers (corners and edges together, lone letters
 * as self-pairs), from the engine's generated frequency report (D-013). Undefined when the report has no
 * example for the buffers.
 */
export function expectedOccurrence(report: unknown, buffers: { readonly corners: string; readonly edges: string }): Map<string, number> | undefined {
  const parsed = FrequencyReportSchema.safeParse(report);
  if (!parsed.success) return undefined;
  const example = parsed.data.examples.find((e) => e.buffers.corners === buffers.corners && e.buffers.edges === buffers.edges);
  if (example === undefined) return undefined;
  const out = new Map<string, number>();
  for (const table of [example.memoItems.selfPair.corners, example.memoItems.selfPair.edges]) for (const [id, n] of Object.entries(table)) out.set(id, (out.get(id) ?? 0) + n);
  return out;
}

/** True when one edit (insert, delete or substitute a character) turns `a` into `b`. */
export function oneEditApart(a: string, b: string): boolean {
  const x = graphemes(a);
  const y = graphemes(b);
  if (Math.abs(x.length - y.length) > 1 || a === b) return false;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const tail = (from: readonly string[], skipFrom: number, other: readonly string[], skipOther: number) => from.slice(skipFrom).join("\0") === other.slice(skipOther).join("\0");
  if (x.length === y.length) return tail(x, i + 1, y, i + 1);
  return x.length > y.length ? tail(x, i + 1, y, i) : tail(x, i, y, i + 1);
}

export interface WordSuggestion {
  readonly pairId: string;
  readonly imageId: string;
  readonly text: string;
  readonly suggestion: string;
  /** The pairs that already use the suggested spelling. */
  readonly usedBy: readonly string[];
}

interface WordUse {
  readonly text: string;
  readonly uses: number;
  readonly pairs: Set<string>;
}

function wordUses(pairs: readonly LetterPair[]): Map<string, WordUse> {
  const words = new Map<string, WordUse>();
  for (const pair of pairs)
    for (const image of pair.images) {
      if (isPlaceholder(image)) continue;
      const key = normaliseWord(image.text);
      const known = words.get(key);
      if (known === undefined) words.set(key, { text: image.text.trim(), uses: image.uses, pairs: new Set([pair.id]) });
      else words.set(key, { text: known.uses >= image.uses ? known.text : image.text.trim(), uses: known.uses + image.uses, pairs: known.pairs.add(pair.id) });
    }
  return words;
}

/**
 * "Did you mean" for a word being added: a spelling already in your library that differs only in
 * spaces, or (for words of four or more characters) by one character. Your own words are the only
 * reference; nothing is corrected automatically.
 */
export function didYouMean(text: string, pairs: readonly LetterPair[]): { suggestion: string; usedBy: string[] } | undefined {
  const key = normaliseWord(text);
  if (key === "") return undefined;
  let best: WordUse | undefined;
  for (const [other, use] of wordUses(pairs)) {
    if (other === key) return undefined;
    const close = squashed(other) === squashed(key) || (graphemes(key).length >= 4 && oneEditApart(key, other));
    if (close && (best === undefined || use.uses > best.uses)) best = use;
  }
  return best === undefined ? undefined : { suggestion: best.text, usedBy: [...best.pairs].sort() };
}

export interface LibraryHealth {
  /** Cells with no real word, most seen in your traces first, then most likely to occur. */
  readonly missing: readonly { readonly id: string; readonly seen: number; readonly expected: number }[];
  readonly placeholders: readonly { readonly id: string; readonly texts: readonly string[] }[];
  /** Main image chosen only by the import's alphabetical tie-break, and never edited since. */
  readonly ties: readonly string[];
  readonly shared: readonly { readonly text: string; readonly pairs: readonly string[] }[];
  /** Spellings that look like a variant of a more-used word. */
  readonly suggestions: readonly WordSuggestion[];
}

export function libraryHealth(pairs: readonly LetterPair[], letters: readonly string[], seen: ReadonlyMap<string, number>, expected: ReadonlyMap<string, number> | undefined): LibraryHealth {
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const missing = letters
    .flatMap((a) => letters.map((b) => `${a}${b}`))
    .filter((id) => mainImage(byId.get(id)) === undefined)
    .map((id) => ({ id, seen: seen.get(id) ?? 0, expected: expected?.get(id) ?? 0 }))
    .sort((a, b) => b.seen - a.seen || b.expected - a.expected || (a.id < b.id ? -1 : 1));
  const sortedPairs = [...pairs].sort((a, b) => (a.id < b.id ? -1 : 1));
  const placeholders = sortedPairs.filter((p) => p.images.some(isPlaceholder)).map((p) => ({ id: p.id, texts: p.images.filter(isPlaceholder).map((i) => i.text) }));
  const ties = sortedPairs
    .filter((p) => {
      const real = p.images.filter((i) => !isPlaceholder(i));
      return p.updatedAt === undefined && real.length >= 2 && real[0]?.uses === real[1]?.uses;
    })
    .map((p) => p.id);
  const words = wordUses(pairs);
  const shared = [...words.values()]
    .filter((w) => w.pairs.size > 1)
    .map((w) => ({ text: w.text, pairs: [...w.pairs].sort() }))
    .sort((a, b) => a.text.localeCompare(b.text));
  const suggestions: WordSuggestion[] = [];
  const entries = [...words.entries()];
  for (const pair of sortedPairs)
    for (const image of pair.images) {
      if (isPlaceholder(image)) continue;
      const key = normaliseWord(image.text);
      const own = words.get(key);
      if (own === undefined) continue;
      let best: WordUse | undefined;
      for (const [other, use] of entries) {
        if (other === key || use.uses <= own.uses) continue;
        const close = squashed(other) === squashed(key) || (graphemes(key).length >= 5 && oneEditApart(key, other));
        if (close && (best === undefined || use.uses > best.uses)) best = use;
      }
      if (best !== undefined) suggestions.push({ pairId: pair.id, imageId: image.id, text: image.text, suggestion: best.text, usedBy: [...best.pairs].sort() });
    }
  return { missing, placeholders, ties, shared, suggestions };
}

/** Pairs any of whose real images is this word: every one is a right answer in image → pair (AUDIT §5, item 4). */
export function pairsForWord(pairs: readonly LetterPair[], text: string): string[] {
  const key = normaliseWord(text);
  return pairs
    .filter((p) => p.images.some((i) => !isPlaceholder(i) && normaliseWord(i.text) === key))
    .map((p) => p.id)
    .sort();
}

/** A typed pair, compared letter by letter without regard to case or spaces. */
export function samePair(typed: string, id: string): boolean {
  const letters = graphemes(typed.replace(/\s/g, "")).join("");
  return letters.toLocaleUpperCase() === id.toLocaleUpperCase();
}

// ---------------------------------------------------------------------------------------------------
// Edits. Each returns a new record with `updatedAt` set, placeholders kept after real images.

const ordered = (images: readonly PairImage[]): PairImage[] => [...images.filter((i) => !isPlaceholder(i)), ...images.filter(isPlaceholder)];

export function emptyPair(first: string, second: string, at: string): LetterPair {
  return { id: `${first}${second}`, first, second, images: [], createdAt: at, updatedAt: at };
}

/** Adds a word as the pair's last real image. A word the pair already has is not added twice. */
export function addImage(pair: LetterPair, text: string, id: string, at: string, options: { readonly uses?: number; readonly placeholder?: boolean } = {}): { pair: LetterPair; added: boolean } {
  const trimmed = text.trim();
  if (trimmed === "" || pair.images.some((i) => normaliseWord(i.text) === normaliseWord(trimmed))) return { pair, added: false };
  const image: PairImage = { id, text: trimmed, uses: options.uses ?? 0, ...(options.placeholder === true ? { flags: ["placeholder" as const] } : {}) };
  return { pair: { ...pair, images: ordered([...pair.images, image]), updatedAt: at }, added: true };
}

export function makeMain(pair: LetterPair, imageId: string, at: string): LetterPair {
  const image = pair.images.find((i) => i.id === imageId);
  if (image === undefined || isPlaceholder(image)) return pair;
  return { ...pair, images: ordered([image, ...pair.images.filter((i) => i.id !== imageId)]), updatedAt: at };
}

export function removeImage(pair: LetterPair, imageId: string, at: string): LetterPair {
  return { ...pair, images: pair.images.filter((i) => i.id !== imageId), updatedAt: at };
}

/** Rewrites an image's text. A placeholder given a new word stops being a placeholder. */
export function renameImage(pair: LetterPair, imageId: string, text: string, at: string): LetterPair {
  const trimmed = text.trim();
  const images = pair.images.map((image) => {
    if (image.id !== imageId || trimmed === "" || trimmed === image.text) return image;
    const { flags: _flags, ...rest } = image;
    return isPlaceholder(image) ? { ...rest, text: trimmed } : { ...image, text: trimmed };
  });
  return { ...pair, images: ordered(images), updatedAt: at };
}

/**
 * Renames an image, or, when the pair already has an image with that word, merges the two: uses add up
 * and legacy snapshots are kept together, as the import merges did (MIGRATION §3.6). The merged image
 * is a placeholder only if both were.
 */
export function renameOrMerge(pair: LetterPair, imageId: string, text: string, at: string): LetterPair {
  const from = pair.images.find((i) => i.id === imageId);
  const into = pair.images.find((i) => i.id !== imageId && normaliseWord(i.text) === normaliseWord(text));
  if (from === undefined || into === undefined || text.trim() === "") return renameImage(pair, imageId, text, at);
  const legacy = [...(into.legacy ?? []), ...(from.legacy ?? [])];
  const { flags: _flags, legacy: _legacy, ...base } = into;
  const merged: PairImage = { ...base, uses: into.uses + from.uses, ...(isPlaceholder(into) && isPlaceholder(from) ? { flags: ["placeholder" as const] } : {}), ...(legacy.length === 0 ? {} : { legacy }) };
  return { ...pair, images: ordered(pair.images.filter((i) => i.id !== imageId).map((i) => (i.id === into.id ? merged : i))), updatedAt: at };
}

export function withDetails(pair: LetterPair, details: { readonly notes: string; readonly category: string }, at: string): LetterPair {
  const { notes: _notes, category: _category, ...rest } = pair;
  const notes = details.notes.trim();
  const category = details.category.trim();
  return { ...rest, ...(notes === "" ? {} : { notes }), ...(category === "" ? {} : { category }), updatedAt: at };
}

// ---------------------------------------------------------------------------------------------------
// Find and replace, and bulk category.

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface ImageMatch {
  readonly pairId: string;
  readonly imageId: string;
  readonly text: string;
  readonly replaced: string;
}

/** Every image whose text contains `find`, ignoring case, with what replacing would make of it. Replacements that would leave an image empty are left out. */
export function findImages(pairs: readonly LetterPair[], find: string, replacement: string): ImageMatch[] {
  if (find === "") return [];
  const pattern = new RegExp(escapeRegExp(find), "giu");
  const out: ImageMatch[] = [];
  for (const pair of [...pairs].sort((a, b) => (a.id < b.id ? -1 : 1)))
    for (const image of pair.images) {
      if (!pattern.test(image.text)) continue;
      pattern.lastIndex = 0;
      const replaced = image.text.replace(pattern, () => replacement).trim();
      pattern.lastIndex = 0;
      if (replaced !== "") out.push({ pairId: pair.id, imageId: image.id, text: image.text, replaced });
    }
  return out;
}

export function applyMatches(pairs: readonly LetterPair[], matches: readonly ImageMatch[], at: string): LetterPair[] {
  const byPair = new Map<string, ImageMatch[]>();
  for (const m of matches) byPair.set(m.pairId, [...(byPair.get(m.pairId) ?? []), m]);
  return pairs.filter((p) => byPair.has(p.id)).map((p) => (byPair.get(p.id) ?? []).reduce((acc, m) => renameOrMerge(acc, m.imageId, m.replaced, at), p));
}

// ---------------------------------------------------------------------------------------------------
// CSV. One row per image: pair, image, uses, notes, category, placeholder.

export const CSV_COLUMNS = ["pair", "image", "uses", "notes", "category", "placeholder"] as const;

/** Spreadsheet apps run a cell starting with one of these as a formula; such cells are written with a leading apostrophe, which import removes. */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function libraryToCsv(pairs: readonly LetterPair[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const pair of [...pairs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const tail = (image: PairImage | undefined) => [pair.notes ?? "", pair.category ?? "", image !== undefined && isPlaceholder(image) ? "yes" : ""];
    if (pair.images.length === 0) {
      if (pair.notes !== undefined || pair.category !== undefined) lines.push([pair.id, "", "", ...tail(undefined)].map(csvField).join(","));
      continue;
    }
    for (const image of pair.images) lines.push([pair.id, image.text, String(image.uses), ...tail(image)].map(csvField).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** RFC 4180 records: quoted fields, doubled quotes, CRLF or LF line ends, a leading byte-order mark ignored. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (quoted) {
      if (c === '"' && input.charAt(i + 1) === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input.charAt(i + 1) === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface CsvRow {
  readonly line: number;
  readonly pair: string;
  readonly first: string;
  readonly second: string;
  readonly image: string;
  readonly uses: number;
  readonly notes: string;
  readonly category: string;
  readonly placeholder: boolean;
}

export type CsvProblem = { readonly line: number; readonly reason: "header" | "pair" | "uses" | "empty" };

export function csvRows(text: string): { rows: CsvRow[]; problems: CsvProblem[] } {
  const [header, ...records] = parseCsv(text);
  const names = (header ?? []).map((h) => h.trim().toLowerCase());
  const column = (name: (typeof CSV_COLUMNS)[number]) => names.indexOf(name);
  if (column("pair") === -1 || column("image") === -1) return { rows: [], problems: [{ line: 1, reason: "header" }] };
  const rows: CsvRow[] = [];
  const problems: CsvProblem[] = [];
  for (const [i, record] of records.entries()) {
    const line = i + 2;
    const cell = (name: (typeof CSV_COLUMNS)[number]) => {
      const raw = record[column(name)] ?? "";
      return /^'[=+\-@\t\r]/.test(raw) ? raw.slice(1) : raw;
    };
    const letters = graphemes(cell("pair").trim());
    const [first, second] = letters;
    const usesText = cell("uses").trim();
    const image = cell("image").trim();
    const notes = cell("notes").trim();
    const category = cell("category").trim();
    const reason = letters.length !== 2 || first === undefined || second === undefined ? "pair" : usesText !== "" && !/^\d+$/.test(usesText) ? "uses" : image === "" && notes === "" && category === "" ? "empty" : undefined;
    if (reason !== undefined || first === undefined || second === undefined) {
      problems.push({ line, reason: reason ?? "pair" });
      continue;
    }
    rows.push({ line, pair: `${first}${second}`, first, second, image, uses: usesText === "" ? 0 : Number(usesText), notes, category, placeholder: /^(yes|true|1)$/i.test(cell("placeholder").trim()) });
  }
  return { rows, problems };
}

/** Adds CSV rows to the library: new images are appended, empty notes and categories filled; nothing is removed or overwritten. */
export function mergeCsvRows(pairs: readonly LetterPair[], rows: readonly CsvRow[], at: string, newId: () => string): { changed: LetterPair[]; added: number } {
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const changed = new Set<string>();
  let added = 0;
  for (const row of rows) {
    let pair = byId.get(row.pair) ?? emptyPair(row.first, row.second, at);
    const before = pair;
    if (row.image !== "") {
      const result = addImage(pair, row.image, newId(), at, { uses: row.uses, placeholder: row.placeholder });
      pair = result.pair;
      if (result.added) added++;
    }
    if ((pair.notes === undefined && row.notes !== "") || (pair.category === undefined && row.category !== "")) pair = withDetails(pair, { notes: pair.notes ?? row.notes, category: pair.category ?? row.category }, at);
    if (pair !== before || !byId.has(row.pair)) {
      byId.set(pair.id, pair);
      changed.add(pair.id);
    }
  }
  return { changed: [...changed].sort().flatMap((id) => byId.get(id) ?? []), added };
}

// ---------------------------------------------------------------------------------------------------
// Drill order.

/**
 * Weights for picking a pair to drill: the engine's weakness weights over your FSRS history, scaled by
 * how often the cell occurs as a memo item (D-013), so common pairs come up more. With no occurrence data
 * every cell counts the same.
 */
export function drillWeights(ids: readonly string[], schedules: ReadonlyMap<string, CaseSchedule>, expected: ReadonlyMap<string, number> | undefined): number[] {
  const weakness = selectionWeights("weakness", ids, (id) => statsFor(schedules.get(id)));
  const base = weakness.ok ? weakness.value : ids.map(() => 1);
  const total = expected === undefined ? 0 : ids.reduce((sum, id) => sum + (expected.get(id) ?? 0), 0);
  return ids.map((id, i) => {
    const w = base[i] ?? 1;
    if (expected === undefined || total === 0) return w;
    // A floor so that a cell with no occurrences for these buffers still comes up now and then.
    return w * Math.max(expected.get(id) ?? 0, total / ids.length / 20);
  });
}

/** A weighted pick that skips the most recent picks (the engine's recency window for the set size). */
export function pickWeighted(ids: readonly string[], weights: readonly number[], rng: Rng, recent: readonly string[]): string | undefined {
  const window = new Set(recent.slice(-defaultRecencyWindow(ids.length)));
  const pool = ids.map((id, i) => ({ id, w: window.has(id) ? 0 : (weights[i] ?? 0) }));
  const total = pool.reduce((sum, p) => sum + p.w, 0);
  if (total <= 0) return ids.length === 0 ? undefined : ids[rng.int(ids.length)];
  let roll = rng.float() * total;
  for (const p of pool) {
    roll -= p.w;
    if (roll < 0 && p.w > 0) return p.id;
  }
  return pool.findLast((p) => p.w > 0)?.id;
}

// ---------------------------------------------------------------------------------------------------
// Memo sentences.

export interface SentenceMemo {
  readonly scramble: string;
  /** Edges, then corners; a lone letter as its self-pair (D-015). */
  readonly pieces: readonly { readonly pieceType: "corners" | "edges"; readonly pairs: readonly string[] }[];
}

/** A memo to turn into a sentence: a seeded scramble traced with your buffers, split into pairs. */
export function sentenceMemo(puzzle: Puzzle, scheme: Scheme, seed: string, index: number, buffers: { readonly corners: string; readonly edges: string }): SentenceMemo {
  const scramble = sessionScramble(seed, index);
  const traces = scrambleTraces(puzzle, scheme, scramble, "both", { corners: buffers.corners, edges: buffers.edges });
  return { scramble, pieces: traces.map((t) => ({ pieceType: t.pieceType, pairs: memoPairIds(t.steps.map((s) => s.letter), "selfPair") })) };
}
