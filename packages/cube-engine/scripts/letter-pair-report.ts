/**
 * Settles 552 vs 576 computationally and writes docs/reports/letter-pair-reachability.md
 * (plus docs/reports/letter-pair-frequencies.json for Phase 4's gap finder).
 *
 * Reachability: for every piece type, buffer sticker and orientation policy, and for every one of
 * the 576 ordered letter pairs (s, t), build a witness state whose trace should open with the pair
 * (s, t), trace it, and record whether it does. The state comes from the oracle's colour model
 * (un-shooting t, then s), never from the tracer. A pair with no witness is listed with the reason
 * from the invariants proved in test/trace/letter-pairs.test.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPuzzle, type Puzzle } from "../src/core/puzzle.js";
import { speffzScheme } from "../src/lettering/speffz.js";
import { memoView, type SingleLetterRepresentation } from "../src/memo/memo.js";
import { pieceType, type PieceTypeId } from "../src/pieces/piece-types.js";
import { createRng } from "../src/random/prng.js";
import { randomState3x3 } from "../src/random/random-state.js";
import { trace, type TracePolicy } from "../src/trace/trace.js";
import { colourReaders, coloursToPattern } from "../test/fixtures/construct.js";
import { TraceOracle } from "../test/oracle/trace-oracle.js";

type Policy = NonNullable<TracePolicy["orientedInPlace"]>;
const POLICIES: Policy[] = ["separate", "asTargets"];
const LETTERS = "A B C D E F G H I J K L M N O P Q R S T U V W X".split(" ");
const STATE_COUNT = 10_000;

interface Reachability {
  readonly puzzle: string;
  readonly type: PieceTypeId;
  readonly bufferPiece: string;
  readonly bufferStickers: string[];
  readonly policy: Policy;
  readonly reachable: Set<string>;
  readonly unreachable: { diagonal: number; bufferLetter: number; samePiece: number; other: string[] };
}

function pct(n: number, d: number): string {
  return d === 0 ? "–" : `${((100 * n) / d).toFixed(1)}%`;
}

function reachabilityFor(puzzle: Puzzle, typeId: PieceTypeId): Reachability[] {
  const scheme = speffzScheme(puzzle);
  const type = pieceType(puzzle, typeId);
  const letters = scheme.letters[typeId] ?? {};
  const stickerOfLetter = new Map(Object.entries(letters).map(([sticker, letter]) => [letter, sticker]));
  const oracle = new TraceOracle(puzzle.size, typeId === "corners" ? "corners" : typeId === "edges" ? "edges" : "wings");
  const readers = colourReaders(puzzle);
  const solved = oracle.solvedColours();
  const pieceOfLetter = (letter: string) => type.stickerByName(stickerOfLetter.get(letter) ?? "")?.position;

  const byPiece = new Map<string, Reachability>();
  for (const bufferSticker of type.stickers) {
    const bufferPiece = type.pieces[bufferSticker.position]?.name ?? "";
    const bufferSlot = oracle.slotNamed(bufferSticker.name);
    for (const policy of POLICIES) {
      const reachable = new Set<string>();
      for (const s of LETTERS) {
        for (const t of LETTERS) {
          const colours = [...solved];
          try {
            oracle.swap(colours, bufferSlot, oracle.slotNamed(stickerOfLetter.get(t) ?? ""));
            oracle.swap(colours, bufferSlot, oracle.slotNamed(stickerOfLetter.get(s) ?? ""));
            const pattern = coloursToPattern(puzzle, colours, readers);
            const result = trace(puzzle, { pattern }, {
              pieceType: typeId,
              buffer: bufferSticker.name,
              scheme,
              frame: puzzle.id === "3x3x3" ? { kind: "centers" } : { kind: "asIs" },
              policy: { orientedInPlace: policy },
            });
            if (result.ok && result.value.pairs[0]?.[0] === s && result.value.pairs[0][1] === t) reachable.add(s + t);
          } catch {
            // Swapping the buffer with its own stickers can give colours that don't form real pieces: no witness.
          }
        }
      }
      const unreachable = { diagonal: 0, bufferLetter: 0, samePiece: 0, other: [] as string[] };
      for (const s of LETTERS) {
        for (const t of LETTERS) {
          if (reachable.has(s + t)) continue;
          if (s === t) unreachable.diagonal++;
          else if (pieceOfLetter(s) === bufferSticker.position || pieceOfLetter(t) === bufferSticker.position) unreachable.bufferLetter++;
          else if (pieceOfLetter(s) === pieceOfLetter(t)) unreachable.samePiece++;
          else unreachable.other.push(s + t);
        }
      }
      const key = `${bufferPiece}/${policy}`;
      const existing = byPiece.get(key);
      if (existing === undefined) {
        byPiece.set(key, { puzzle: puzzle.id, type: typeId, bufferPiece, bufferStickers: [bufferSticker.name], policy, reachable, unreachable });
      } else {
        const same = existing.reachable.size === reachable.size && [...reachable].every((p) => existing.reachable.has(p));
        if (!same) throw new Error(`${typeId} ${key}: stickers of one buffer piece reach different pairs`);
        existing.bufferStickers.push(bufferSticker.name);
      }
    }
  }
  return [...byPiece.values()];
}

function reachabilityTable(rows: Reachability[]): string {
  const lines = [
    "| Buffer piece (stickers checked) | Policy | Reachable of 576 | Same letter | Contains a buffer letter | Same piece | Other |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.bufferPiece} (${r.bufferStickers.join(", ")}) | ${r.policy} | ${r.reachable.size} | ${r.unreachable.diagonal} | ${r.unreachable.bufferLetter} | ${r.unreachable.samePiece} | ${r.unreachable.other.length === 0 ? "0" : r.unreachable.other.join(" ")} |`,
    );
  }
  return lines.join("\n");
}

function unionSize(a: Set<string>, b: Set<string>): number {
  return new Set([...a, ...b]).size;
}

function unreachableDistinct(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const s of LETTERS) for (const t of LETTERS) if (s !== t && !a.has(s + t) && !b.has(s + t)) out.push(s + t);
  return out;
}

function combinedTable(first: Reachability[], second: Reachability[], policy: Policy, firstLabel: string, secondLabel: string): string {
  const rows = first.filter((r) => r.policy === policy);
  const cols = second.filter((r) => r.policy === policy);
  const lines = [
    `| ${firstLabel} buffer ↓ / ${secondLabel} buffer → | ${cols.map((c) => c.bufferPiece).join(" | ")} |`,
    `|---|${cols.map(() => "---").join("|")}|`,
  ];
  for (const r of rows) lines.push(`| ${r.bufferPiece} | ${cols.map((c) => unionSize(r.reachable, c.reachable)).join(" | ")} |`);
  return lines.join("\n");
}

interface MemoItemStats {
  items: number;
  diagonalItems: number;
  memosWithDiagonal: number;
  cellCounts: Map<string, number>;
}

interface MemoStats {
  targets: number[];
  breaks: number[];
  misoriented: number[];
  parity: number;
  memosWithRepeatedLetter: number;
  pairCounts: Map<string, number>;
  memoItems: Record<SingleLetterRepresentation, MemoItemStats>;
}

const MODES: SingleLetterRepresentation[] = ["selfPair", "chain"];

function newStats(): MemoStats {
  const items = (): MemoItemStats => ({ items: 0, diagonalItems: 0, memosWithDiagonal: 0, cellCounts: new Map() });
  return { targets: [], breaks: [], misoriented: [], parity: 0, memosWithRepeatedLetter: 0, pairCounts: new Map(), memoItems: { selfPair: items(), chain: items() } };
}

function summarise(values: number[]): string {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return `mean ${mean.toFixed(2)}, sd ${sd.toFixed(2)}, min ${Math.min(...values)}, max ${Math.max(...values)}`;
}

function histogram(values: number[]): string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => a - b);
  return keys.map((k) => `${k}: ${pct(counts.get(k) ?? 0, values.length)}`).join(" · ");
}

function memoStatistics(puzzle: Puzzle, examples: { corners: string; edges: string }[]) {
  const scheme = speffzScheme(puzzle);
  const rng = createRng("letter-pair-report-statistics");
  const states = Array.from({ length: STATE_COUNT }, () => randomState3x3(puzzle, rng));
  return examples.map((example) => {
    const stats = { corners: newStats(), edges: newStats() };
    for (const pattern of states) {
      for (const typeId of ["corners", "edges"] as const) {
        const result = trace(puzzle, { pattern }, { pieceType: typeId, buffer: example[typeId], scheme });
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        const r = result.value;
        const s = stats[typeId];
        s.targets.push(r.targetCount);
        s.breaks.push(r.cycleBreaks.length);
        s.misoriented.push(r.orientedInPlace.length);
        if (r.parity) s.parity++;
        if (new Set(r.targets).size < r.targets.length) s.memosWithRepeatedLetter++;
        for (const [a, b] of r.pairs) {
          if (b === undefined) continue;
          s.pairCounts.set(a + b, (s.pairCounts.get(a + b) ?? 0) + 1);
        }
        for (const mode of MODES) {
          const m = s.memoItems[mode];
          const view = memoView(r, { singleLetterRepresentation: mode });
          const diagonal = view.items.filter((item) => item.letters[0] === item.letters[1]).length;
          m.items += view.items.length;
          m.diagonalItems += diagonal;
          if (diagonal > 0) m.memosWithDiagonal++;
          for (const item of view.items) {
            const cell = item.letters.join("");
            m.cellCounts.set(cell, (m.cellCounts.get(cell) ?? 0) + 1);
          }
        }
      }
    }
    return { example, stats };
  });
}

function statsSection(results: ReturnType<typeof memoStatistics>, reachable: (type: "corners" | "edges", buffer: string) => Set<string>): string {
  const parts: string[] = [];
  for (const { example, stats } of results) {
    parts.push(`### Corner buffer ${example.corners}, edge buffer ${example.edges} (policy: separate)`);
    const rows = ["| | Corners | Edges |", "|---|---|---|"];
    rows.push(`| Targets | ${summarise(stats.corners.targets)} | ${summarise(stats.edges.targets)} |`);
    rows.push(`| Target-count distribution | ${histogram(stats.corners.targets)} | ${histogram(stats.edges.targets)} |`);
    rows.push(`| Cycle breaks | ${summarise(stats.corners.breaks)} | ${summarise(stats.edges.breaks)} |`);
    rows.push(`| Twisted / flipped in place (incl. buffer) | ${summarise(stats.corners.misoriented)} | ${summarise(stats.edges.misoriented)} |`);
    rows.push(`| Parity | ${pct(stats.corners.parity, STATE_COUNT)} | ${pct(stats.edges.parity, STATE_COUNT)} |`);
    rows.push(
      `| Memos that repeat a letter | ${pct(stats.corners.memosWithRepeatedLetter, STATE_COUNT)} | ${pct(stats.edges.memosWithRepeatedLetter, STATE_COUNT)} |`,
    );
    const pairCells = (["corners", "edges"] as const).map((typeId) => {
      const counts = stats[typeId].pairCounts;
      const possible = reachable(typeId, example[typeId]);
      const observedOutside = [...counts.keys()].filter((p) => !possible.has(p));
      const values = [...possible].map((p) => counts.get(p) ?? 0);
      const total = values.reduce((a, b) => a + b, 0);
      return {
        seen: `${counts.size} of ${possible.size} reachable (${observedOutside.length} outside the reachable set)`,
        spread: `min ${Math.min(...values)}, max ${Math.max(...values)}; uniform would be ${(total / possible.size).toFixed(1)}`,
      };
    });
    rows.push(`| Distinct pairs seen | ${pairCells.map((c) => c.seen).join(" | ")} |`);
    rows.push(`| Occurrences per reachable pair | ${pairCells.map((c) => c.spread).join(" | ")} |`);
    parts.push(rows.join("\n"));
  }
  return parts.join("\n\n");
}

function memoItemSection(puzzle: Puzzle, results: ReturnType<typeof memoStatistics>): string {
  const scheme = speffzScheme(puzzle);
  const parts: string[] = [];
  for (const { example, stats } of results) {
    // A lone letter is never on the buffer piece, so exactly the buffer piece's diagonal cells stay unused.
    for (const typeId of ["corners", "edges"] as const) {
      const type = pieceType(puzzle, typeId);
      const bufferPosition = type.stickerByName(example[typeId])?.position;
      const bufferLetters = type.stickers.filter((s) => s.position === bufferPosition).map((s) => scheme.letters[typeId]?.[s.name] ?? "");
      for (const mode of MODES) {
        const unused = LETTERS.filter((l) => !stats[typeId].memoItems[mode].cellCounts.has(l + l));
        if (unused.join() !== [...bufferLetters].sort().join()) {
          throw new Error(`${typeId} ${example[typeId]} ${mode}: unused diagonal cells ${unused.join("")}, buffer letters ${bufferLetters.join("")}`);
        }
      }
    }
    parts.push(`### Corner buffer ${example.corners}, edge buffer ${example.edges} (policy: separate)`);
    const columns = (["corners", "edges"] as const).flatMap((typeId) => MODES.map((mode) => ({ typeId, mode, m: stats[typeId].memoItems[mode] })));
    const rows = [`| | ${columns.map((c) => `${c.typeId === "corners" ? "Corners" : "Edges"}, \`${c.mode}\``).join(" | ")} |`, `|---|${columns.map(() => "---").join("|")}|`];
    const row = (label: string, cell: (m: MemoItemStats) => string) => rows.push(`| ${label} | ${columns.map((c) => cell(c.m)).join(" | ")} |`);
    row("Items per memo", (m) => `mean ${(m.items / STATE_COUNT).toFixed(2)}`);
    row("Diagonal items", (m) => `${pct(m.diagonalItems, m.items)} of items; in ${pct(m.memosWithDiagonal, STATE_COUNT)} of memos`);
    row("Occurrences per diagonal cell", (m) => {
      const values = LETTERS.map((l) => m.cellCounts.get(l + l) ?? 0);
      return `min ${Math.min(...values)}, max ${Math.max(...values)}; ${values.filter((v) => v > 0).length} of 24 cells used`;
    });
    row("Distinct cells used", (m) => `${m.cellCounts.size} of 576`);
    parts.push(rows.join("\n"));
  }
  return parts.join("\n\n");
}

export async function letterPairReport(): Promise<void> {
  const three = await loadPuzzle("3x3x3");
  const four = await loadPuzzle("4x4x4");
  const started = Date.now();

  const corners3 = reachabilityFor(three, "corners");
  const edges3 = reachabilityFor(three, "edges");
  const corners4 = reachabilityFor(four, "corners");
  const wings4 = reachabilityFor(four, "wings");
  const all = [...corners3, ...edges3, ...corners4, ...wings4];

  const diagonalEverReachable = all.some((r) => LETTERS.some((l) => r.reachable.has(l + l)));
  const otherUnreachable = all.flatMap((r) => r.unreachable.other.map((p) => `${r.puzzle} ${r.type} ${r.bufferPiece} ${r.policy}: ${p}`));
  if (diagonalEverReachable) throw new Error("A same-letter pair was reachable: the hypothesis is false; see the tables.");

  const find = (rows: Reachability[], piece: string, policy: Policy) => {
    const row = rows.find((r) => r.bufferPiece === piece && r.policy === policy);
    if (row === undefined) throw new Error(`no row for ${piece} ${policy}`);
    return row;
  };
  const examples = [
    { corners: "UFR", edges: "UF" },
    { corners: "UBL", edges: "UR" },
  ];
  const exampleLines = examples.flatMap(({ corners, edges }) =>
    POLICIES.map((policy) => {
      const missing = unreachableDistinct(find(corners3, corners, policy).reachable, find(edges3, edges, policy).reachable);
      return `- **${corners} / ${edges}, ${policy}:** ${552 - missing.length} of 552 distinct-letter pairs can occur. The ${missing.length} that can't: ${missing.join(" ")}`;
    }),
  );

  const unionCounts = POLICIES.map((policy) => {
    const sizes = corners3
      .filter((c) => c.policy === policy)
      .flatMap((c) => edges3.filter((e) => e.policy === policy).map((e) => unionSize(c.reachable, e.reachable)));
    return { policy, min: Math.min(...sizes), max: Math.max(...sizes) };
  });

  const stats = memoStatistics(three, examples);
  const reachableFor = (type: "corners" | "edges", buffer: string) => {
    const t = pieceType(three, type);
    const piece = t.pieces[t.stickerByName(buffer)?.position ?? -1]?.name ?? "";
    return find(type === "corners" ? corners3 : edges3, piece, "separate").reachable;
  };

  const md = `# Letter-pair reachability

Generated by \`pnpm engine:report letter-pairs\`; deterministic (seeded), so regenerating gives the same file. Letters are Speffz; buffers are stickers named as in DECISIONS D-009.

## Result

**No same-letter pair (AA … XX) can occur in any traced memo.** That holds for every buffer, both orientation policies,
3x3x3 corners and edges, and 4x4x4 corners and wings: all ${all.length} buffer-piece/policy configurations reach
0 of the 24 diagonal cells. **The letter-pair library still uses all 576 cells** (DECISIONS D-013): a letter left
alone in a memo is held with a self-pair image, and D-015 decides how lone letters become two-letter items. See
"Memo items per cell" below for how often each diagonal cell is actually used.

There is a second finding the old app couldn't have seen: **for any particular pair of buffers, more than the diagonal is
unreachable.** A letter on the buffer piece is never a target, and two stickers of one piece are never consecutive targets
(except the opening of an orientation cycle under \`asTargets\`). Combining corners and edges on 3x3x3, the number of
distinct-letter pairs that can occur ranges over the 96 buffer-piece combinations from
${unionCounts.map((u) => `**${u.min}–${u.max}** (${u.policy})`).join(" and ")} of 552.

${exampleLines.join("\n")}

## Why the diagonal is impossible (the invariants the tests enforce)

\`test/trace/letter-pairs.test.ts\` checks these on 10,000 random 3x3x3 states (every buffer, both policies, Speffz and a
shuffled scheme) and 400 fixed-frame 4x4x4 states (every buffer, both policies):

1. **Consecutive targets are never the same sticker.** After a normal shot the target slot holds its own sticker, and the
   buffer now holds the sticker that was displaced from there, whose home is elsewhere. A break target is on an unsolved
   piece, while the previous target completed a solved one. The second target of an orientation cycle is the sticker that
   was sitting in the first target's slot, which is a different sticker of that twisted piece.
2. **So a pair can only repeat a letter if two stickers share a letter.** Scheme validation rejects that (D-011).
3. **A target is never a sticker of the buffer piece.**
4. **Under \`separate\`, consecutive targets are never on the same piece.** Under \`asTargets\` they are only inside an
   orientation cycle, and that cycle starts from the piece's lowest letter (default break order).

Every distinct-letter pair outside (3) and (4) has an explicit witness below: a state whose trace opens with that pair.
${otherUnreachable.length === 0 ? "No pair fell outside these categories." : `Pairs unreachable for reasons not covered above (investigate): ${otherUnreachable.join("; ")}`}

## Reachability per piece type, buffer piece and policy

Each row was computed separately for every sticker of the buffer piece; all stickers of a piece gave the same set.

### 3x3x3 corners

${reachabilityTable(corners3)}

### 3x3x3 edges

${reachabilityTable(edges3)}

### 4x4x4 corners (fixed frame)

${reachabilityTable(corners4)}

### 4x4x4 wings (fixed frame)

${reachabilityTable(wings4)}

## Distinct-letter pairs reachable by corners or edges together (3x3x3)

Counts are out of 552.

### separate

${combinedTable(corners3, edges3, "separate", "Corner", "Edge")}

### asTargets

${combinedTable(corners3, edges3, "asTargets", "Corner", "Edge")}

## Traced memo compared with the old app's memo drill

${STATE_COUNT.toLocaleString("en")} uniformly random 3x3x3 states (seed \`letter-pair-report-statistics\`). Two buffer
combinations are shown as examples only; neither is a default.

${statsSection(stats, reachableFor)}

**The old drill** (AUDIT §3.2 C3), for comparison:

- It used a fixed length (your settings: 8 corners, 12 edges), where a real memo's length varies (distribution above).
- It never repeated a letter within a sequence. Traced memos repeat a letter whenever a break cycle closes on the sticker
  it broke into, or whenever both stickers of a piece are visited.
- It made all 552 pairs equally likely, and it included buffer letters and same-piece pairs that a trace can never
  produce for the chosen buffers.
- It had no cycle breaks, twists, flips or parity.

\`docs/reports/letter-pair-frequencies.json\` has the per-pair counts for both example buffer combinations.

## Memo items per cell (D-015)

The same ${STATE_COUNT.toLocaleString("en")} states, turned into memo items with \`memoView\` in both
\`singleLetterRepresentation\` modes. Traced pairs never land on the diagonal, but memo items do: a trailing target, and
under \`separate\` each non-buffer twisted or flipped piece, becomes a doubled item. Drills and the gap finder can weight
diagonal cells by these counts (D-013). Per-cell counts are under \`memoItems\` in
\`docs/reports/letter-pair-frequencies.json\`.

The only diagonal cells never used are the buffer piece's own letters (three for a corner buffer, two for an edge
buffer): a lone letter never comes from the buffer piece. The script checks this for every column below.

${memoItemSection(three, stats)}
`;

  const reportsDir = join(import.meta.dirname, "..", "..", "..", "docs", "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "letter-pair-reachability.md"), md);
  const json = {
    format: "bld-platform/letter-pair-frequencies",
    // Version 2 adds memoItems; the traced-pair counts are unchanged.
    version: 2,
    seed: "letter-pair-report-statistics",
    states: STATE_COUNT,
    scheme: "speffz",
    policy: "separate",
    examples: stats.map(({ example, stats: s }) => ({
      buffers: example,
      corners: Object.fromEntries([...s.corners.pairCounts.entries()].sort()),
      edges: Object.fromEntries([...s.edges.pairCounts.entries()].sort()),
      memoItems: Object.fromEntries(
        MODES.map((mode) => [
          mode,
          {
            corners: Object.fromEntries([...s.corners.memoItems[mode].cellCounts.entries()].sort()),
            edges: Object.fromEntries([...s.edges.memoItems[mode].cellCounts.entries()].sort()),
          },
        ]),
      ),
    })),
  };
  writeFileSync(join(reportsDir, "letter-pair-frequencies.json"), `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote docs/reports/letter-pair-reachability.md and letter-pair-frequencies.json in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
