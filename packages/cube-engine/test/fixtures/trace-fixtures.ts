/**
 * Golden trace fixtures, written by hand.
 *
 * Each fixture states the targets a solver should memorise, in the fixture scheme's letters.
 * `construct.ts` builds the state from them without the tracer. The expected values
 * (breaks, twist/flip letters, parity, solved pieces) were worked out by hand from these rules:
 *
 * - Break into the lowest letter among stickers of unsolved, non-buffer pieces
 *   (excluding pieces twisted/flipped in place under the default "separate" policy).
 * - A break cycle ends on a sticker of the piece it broke into.
 * - A twisted or flipped piece is reported by the slot its U/D sticker (F/B for E-slice edges)
 *   now shows on. Clockwise twists move that sticker one face clockwise, seen from outside:
 *     UBL cw E / ccw R   UBR cw Q / ccw N   UFR cw M / ccw J   UFL cw I / ccw F
 *     DFL cw G / ccw L   DFR cw K / ccw P   DBR cw O / ccw T   DBL cw S / ccw H
 *   Flipped edges: UB Q, UR M, UF I, UL E, DF K, DR O, DB S, DL G, FR P, FL F, BR N, BL H.
 * - The list of misoriented pieces is in letter order, buffer last.
 *
 * Speffz corner pieces: UBL A E R · UBR B N Q · UFR C J M · UFL D F I · DFL G L U · DFR K P V ·
 * DBR O T W · DBL H S X. Edge pieces: UB A Q · UR B M · UF C I · UL D E · FL F L · DL G X ·
 * BL H R · FR J P · DF K U · BR N T · DR O V · DB S W.
 * 4x4 Speffz wings, one letter each: UBl A, URb B, UFr C, ULf D, ULb E, FLu F, DLf G, BLd H,
 * UFl I, FRu J, DFr K, FLd L, URf M, BRu N, DRb O, FRd P, UBr Q, BLu R, DBl S, BRd T, DFl U,
 * DRf V, DBr W, DLb X.
 */
import type { PuzzleId } from "../../src/core/puzzle.js";
import type { TargetKind, TracePolicy } from "../../src/trace/trace.js";

export interface Expected {
  readonly cycleBreaks: readonly number[];
  readonly kinds?: readonly TargetKind[];
  readonly twisted?: readonly string[];
  readonly flipped?: readonly string[];
  readonly parity: boolean;
  readonly solvedPieces?: readonly string[];
}

export interface TypeFixture {
  readonly buffer: string;
  /** Targets in solve order, in the fixture scheme's letters. */
  readonly targets: string;
  /** Pieces left misoriented in place at the end: +1 clockwise, -1 counterclockwise (±1 = flip for edges). */
  readonly twists?: readonly { readonly piece: string; readonly turns: 1 | -1 }[];
  readonly policy?: TracePolicy;
  readonly expected: Expected;
  /** The same state traced under another policy. */
  readonly alternates?: readonly { readonly policy: TracePolicy; readonly targets: string; readonly expected: Expected }[];
}

export interface TraceFixture {
  readonly id: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly puzzle: PuzzleId;
  readonly scheme: "speffz" | "reverse-greek";
  /**
   * For real-scramble fixtures: the scramble itself. The expected values were traced by hand
   * from its colour net (scripts/nets.ts), not constructed; `twists` is unused.
   */
  readonly scramble?: string;
  readonly corners?: TypeFixture;
  readonly edges?: TypeFixture;
  readonly wings?: TypeFixture;
  /** Whole-cube rotations (written several ways) appended to the scramble; the trace must not change. */
  readonly rotationSuffixes?: readonly string[];
}

const N = "normal" as const;
const B = "cycleBreak" as const;
const C = "cycleClose" as const;
const O = "orientationTarget" as const;

export const TRACE_FIXTURES: readonly TraceFixture[] = [
  {
    id: "3-01",
    description: "Even targets, no breaks, on both piece types",
    categories: ["no-breaks"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A D G K", expected: { cycleBreaks: [], kinds: [N, N, N, N], twisted: [], parity: false } },
    edges: { buffer: "UF", targets: "A B G J", expected: { cycleBreaks: [], kinds: [N, N, N, N], flipped: [], parity: false } },
    rotationSuffixes: ["x y'", "Rw L'", "Uw D' z2", "Fw B' y2 x'"],
  },
  {
    id: "3-02",
    description: "Odd targets: parity and a trailing single, no breaks",
    categories: ["no-breaks", "parity", "trailing-single"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "B H O", expected: { cycleBreaks: [], parity: true } },
    edges: { buffer: "UF", targets: "D N W", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "3-03",
    description: "One corner break closing on its break sticker",
    categories: ["one-break", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A G K W K", expected: { cycleBreaks: [2], kinds: [N, N, B, N, C], parity: true } },
    edges: { buffer: "UF", targets: "B G D", expected: { cycleBreaks: [], parity: true } },
    rotationSuffixes: ["y", "x2 z'"],
  },
  {
    id: "3-04",
    description: "Corner break cycle that carries a twist and closes on a different sticker",
    categories: ["one-break", "closes-on-other-sticker", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A B G O L", expected: { cycleBreaks: [2], kinds: [N, N, B, N, C], twisted: [], parity: true } },
    edges: { buffer: "UF", targets: "J K L", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "3-05",
    description: "Edge break cycle that carries a flip and closes on the other sticker",
    categories: ["one-break", "closes-on-other-sticker"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A V", expected: { cycleBreaks: [], parity: false } },
    edges: { buffer: "UF", targets: "B D T E", expected: { cycleBreaks: [1], kinds: [N, B, N, C], flipped: [], parity: false } },
  },
  {
    id: "3-06",
    description: "Only twisted corners; edges fully solved",
    categories: ["twisted-only", "fully-solved-type"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "",
      twists: [
        { piece: "DFR", turns: 1 },
        { piece: "DBL", turns: -1 },
      ],
      expected: { cycleBreaks: [], twisted: ["H", "K"], parity: false, solvedPieces: ["UBL", "UBR", "UFR", "UFL", "DFL", "DBR"] },
    },
    edges: {
      buffer: "UF",
      targets: "",
      expected: { cycleBreaks: [], flipped: [], parity: false, solvedPieces: ["UB", "UR", "UF", "UL", "FL", "DL", "BL", "FR", "DF", "BR", "DR", "DB"] },
    },
  },
  {
    id: "3-07",
    description: "Only flipped edges; corners fully solved",
    categories: ["flipped-only", "fully-solved-type"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "", expected: { cycleBreaks: [], twisted: [], parity: false } },
    edges: {
      buffer: "UF",
      targets: "",
      twists: [
        { piece: "UR", turns: 1 },
        { piece: "DB", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["M", "S"], parity: false },
    },
  },
  {
    id: "3-08",
    description: "Targets plus three twisted corners and two flipped edges, OP-style buffers",
    categories: ["twisted-and-flipped", "buffers"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UBL",
      targets: "C K",
      twists: [
        { piece: "DBR", turns: 1 },
        { piece: "UFL", turns: 1 },
        { piece: "DFL", turns: 1 },
      ],
      expected: { cycleBreaks: [], twisted: ["G", "I", "O"], parity: false },
    },
    edges: {
      buffer: "UR",
      targets: "C U",
      twists: [
        { piece: "FL", turns: 1 },
        { piece: "BL", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["F", "H"], parity: false },
    },
  },
  {
    id: "3-09",
    description: "Solved buffers: both traces start with a break",
    categories: ["solved-buffer", "one-break", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A W A", expected: { cycleBreaks: [0], kinds: [B, N, C], parity: true } },
    edges: { buffer: "UF", targets: "B X B", expected: { cycleBreaks: [0], kinds: [B, N, C], parity: true } },
  },
  {
    id: "3-10",
    description: "Buffers twisted/flipped at the start; the break cycle hands the twist back",
    categories: ["buffer-misoriented-at-start", "closes-on-other-sticker", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "A W E",
      expected: { cycleBreaks: [0], kinds: [B, N, C], twisted: [], parity: true, solvedPieces: ["UBR", "UFL", "DFL", "DFR", "DBL"] },
    },
    edges: { buffer: "UF", targets: "D S E", expected: { cycleBreaks: [0], kinds: [B, N, C], flipped: [], parity: true } },
  },
  {
    id: "3-11",
    description: "Buffers twisted/flipped at the end, reported last",
    categories: ["buffer-misoriented-at-end", "twisted-and-flipped"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "B G",
      twists: [
        { piece: "UFR", turns: 1 },
        { piece: "DBL", turns: -1 },
      ],
      expected: { cycleBreaks: [], twisted: ["H", "M"], parity: false },
    },
    edges: {
      buffer: "UF",
      targets: "R J",
      twists: [
        { piece: "UF", turns: 1 },
        { piece: "UB", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["Q", "I"], parity: false },
    },
  },
  {
    id: "3-12",
    description: "Several breaks on both piece types",
    categories: ["several-breaks", "closes-on-other-sticker", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "B D U D H W H", expected: { cycleBreaks: [1, 4], kinds: [N, B, N, C, B, N, C], parity: true } },
    edges: { buffer: "UF", targets: "A B V B F S L", expected: { cycleBreaks: [1, 4], kinds: [N, B, N, C, B, N, C], parity: true } },
    rotationSuffixes: ["z", "x' y"],
  },
  {
    id: "3-13",
    description: "Every non-buffer piece in one long buffer cycle",
    categories: ["no-breaks", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A B D G K O X", expected: { cycleBreaks: [], parity: true } },
    edges: { buffer: "UF", targets: "A B D F G H J K N O S", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "3-14",
    description: "Targets on side stickers rather than U/D stickers",
    categories: ["no-breaks"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "E P T L", expected: { cycleBreaks: [], parity: false } },
    edges: { buffer: "UF", targets: "Q M X P", expected: { cycleBreaks: [], parity: false } },
  },
  {
    id: "3-15",
    description: "A custom break priority list overrides letter order",
    categories: ["custom-break-order", "one-break"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "B O D O",
      policy: { breakOrder: ["RDB"] },
      expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false },
      alternates: [{ policy: {}, targets: "B D O D", expected: { cycleBreaks: [1], parity: false } }],
    },
    edges: {
      buffer: "UF",
      targets: "A V B V",
      policy: { breakOrder: ["DR"] },
      expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false },
      alternates: [{ policy: {}, targets: "A B V B", expected: { cycleBreaks: [1], parity: false } }],
    },
  },
  {
    id: "3-16",
    description: "A priority list naming only ineligible stickers falls back to letter order",
    categories: ["custom-break-order", "one-break"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "B D O D", policy: { breakOrder: ["BDL", "UFR"] }, expected: { cycleBreaks: [1], parity: false } },
    edges: { buffer: "UF", targets: "A B V B", policy: { breakOrder: ["BU"] }, expected: { cycleBreaks: [1], parity: false } },
  },
  {
    id: "3-17",
    description: "OP buffers (UBL corners, UR edges), no breaks, odd",
    categories: ["buffers", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UBL", targets: "C G W", expected: { cycleBreaks: [], parity: true } },
    edges: { buffer: "UR", targets: "C X Q", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "3-18",
    description: "OP buffers with breaks that close on the other sticker",
    categories: ["buffers", "one-break", "closes-on-other-sticker"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UBL", targets: "D C X M", expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false } },
    edges: { buffer: "UR", targets: "A C W I", expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false } },
  },
  {
    id: "3-19",
    description: "M2 edge buffer DF, corner buffer DFR",
    categories: ["buffers"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "DFR", targets: "A C", expected: { cycleBreaks: [], parity: false } },
    edges: { buffer: "DF", targets: "A C", expected: { cycleBreaks: [], parity: false } },
  },
  {
    id: "3-20",
    description: "A twisted corner traced as two targets (asTargets); the same state under 'separate'",
    categories: ["as-targets", "twisted-only", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "B K V",
      policy: { orientedInPlace: "asTargets" },
      expected: { cycleBreaks: [1], kinds: [N, O, O], twisted: [], parity: true },
      alternates: [{ policy: { orientedInPlace: "separate" }, targets: "B", expected: { cycleBreaks: [], twisted: ["K", "J"], parity: true } }],
    },
    edges: { buffer: "UF", targets: "O", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "3-21",
    description: "A flipped edge traced as two targets (asTargets); the same state under 'separate'",
    categories: ["as-targets", "flipped-only", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "D", expected: { cycleBreaks: [], parity: true } },
    edges: {
      buffer: "UF",
      targets: "A B M",
      policy: { orientedInPlace: "asTargets" },
      expected: { cycleBreaks: [1], kinds: [N, O, O], flipped: [], parity: true },
      alternates: [{ policy: { orientedInPlace: "separate" }, targets: "A", expected: { cycleBreaks: [], flipped: ["M", "I"], parity: true } }],
    },
  },
  {
    id: "3-22",
    description: "asTargets: letter order decides between a twisted piece and a permuted one",
    categories: ["as-targets", "several-breaks", "solved-buffer", "parity"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "A E G W G",
      policy: { orientedInPlace: "asTargets" },
      expected: { cycleBreaks: [0, 2], kinds: [O, O, B, N, C], parity: true },
    },
    edges: {
      buffer: "UF",
      targets: "D X D N T",
      policy: { orientedInPlace: "asTargets" },
      expected: { cycleBreaks: [0, 3], kinds: [B, N, C, O, O], parity: true },
    },
  },
  {
    id: "3-23",
    description: "Non-Speffz scheme whose letter order is reversed: breaks follow the scheme, not Speffz",
    categories: ["custom-scheme", "one-break"],
    puzzle: "3x3x3",
    scheme: "reverse-greek",
    // Speffz reading: corners B X D X, edges J X A X.
    corners: { buffer: "UFR", targets: "Ψ Α Φ Α", expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false } },
    edges: { buffer: "UF", targets: "Ο Α Ω Α", expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false } },
  },
  {
    id: "3-24",
    description: "Corners fully solved, edges not",
    categories: ["fully-solved-type"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "",
      expected: { cycleBreaks: [], twisted: [], parity: false, solvedPieces: ["UBL", "UBR", "UFR", "UFL", "DFL", "DFR", "DBR", "DBL"] },
    },
    edges: { buffer: "UF", targets: "A B", expected: { cycleBreaks: [], parity: false } },
  },
  {
    id: "3-25",
    description: "The solved cube",
    categories: ["fully-solved-type", "solved-buffer"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "", expected: { cycleBreaks: [], twisted: [], parity: false } },
    edges: { buffer: "UF", targets: "", expected: { cycleBreaks: [], flipped: [], parity: false } },
    rotationSuffixes: ["x", "y z"],
  },
  {
    id: "3-26",
    description: "Targets on E-slice edges, read from both their F/B and side stickers",
    categories: ["no-breaks"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "", expected: { cycleBreaks: [], parity: false } },
    edges: { buffer: "UF", targets: "J N F H", expected: { cycleBreaks: [], parity: false } },
  },
  {
    id: "3-27",
    description: "E-slice flips only",
    categories: ["flipped-only"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "", expected: { cycleBreaks: [], parity: false } },
    edges: {
      buffer: "UF",
      targets: "",
      twists: [
        { piece: "FR", turns: 1 },
        { piece: "BL", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["H", "P"], parity: false },
    },
  },
  {
    id: "3-28",
    description: "Parity together with twisted and flipped pieces",
    categories: ["parity", "twisted-and-flipped", "trailing-single"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "G",
      twists: [
        { piece: "UBR", turns: 1 },
        { piece: "DBL", turns: -1 },
      ],
      expected: { cycleBreaks: [], twisted: ["H", "Q"], parity: true },
    },
    edges: {
      buffer: "UF",
      targets: "V",
      twists: [
        { piece: "UB", turns: 1 },
        { piece: "DF", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["K", "Q"], parity: true },
    },
  },
  {
    id: "3-29",
    description: "Breaks into pieces whose lowest letter is a side sticker",
    categories: ["one-break"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "B G T G", expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false } },
    edges: { buffer: "UF", targets: "A H O H", expected: { cycleBreaks: [1], kinds: [N, B, N, C], parity: false } },
  },
  {
    id: "3-30",
    description: "Three-piece break cycles",
    categories: ["one-break", "closes-on-other-sticker"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "D W A S P A", expected: { cycleBreaks: [2], kinds: [N, N, B, N, N, C], parity: false } },
    edges: { buffer: "UF", targets: "B G A J S Q", expected: { cycleBreaks: [2], kinds: [N, N, B, N, N, C], parity: false } },
  },
  {
    id: "3-31",
    description: "A piece solved earlier in the trace is never chosen as a break target",
    categories: ["one-break", "solved-skipped"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "E B G B", expected: { cycleBreaks: [1], parity: false } },
    edges: { buffer: "UF", targets: "Q D K D", expected: { cycleBreaks: [1], parity: false } },
  },
  {
    id: "3-32",
    description: "Unusual buffers: DBL corners, BL edges",
    categories: ["buffers"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "DBL", targets: "A C", expected: { cycleBreaks: [], parity: false } },
    edges: { buffer: "BL", targets: "A C", expected: { cycleBreaks: [], parity: false } },
  },
  {
    id: "3-33",
    description: "Buffer named by a side sticker (RUF, FU): letters are read from that sticker",
    categories: ["buffers"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "RUF", targets: "A G", expected: { cycleBreaks: [], parity: false } },
    edges: { buffer: "FU", targets: "A B", expected: { cycleBreaks: [], parity: false } },
  },
  {
    id: "3-34",
    description: "Twisted pieces excluded from breaks under 'separate'; under 'asTargets' they are traced",
    categories: ["twisted-and-flipped", "as-targets", "one-break", "several-breaks"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "B H V H",
      twists: [
        { piece: "UBL", turns: 1 },
        { piece: "DFL", turns: 1 },
        { piece: "DBR", turns: 1 },
      ],
      expected: { cycleBreaks: [1], kinds: [N, B, N, C], twisted: ["E", "G", "O"], parity: false },
      alternates: [
        {
          policy: { orientedInPlace: "asTargets" },
          targets: "B A R G U H V H O W",
          expected: { cycleBreaks: [1, 3, 5, 8], kinds: [N, O, O, O, O, B, N, C, O, O], twisted: [], parity: false },
        },
      ],
    },
    edges: {
      buffer: "UF",
      targets: "J K",
      twists: [
        { piece: "UL", turns: 1 },
        { piece: "DR", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["E", "O"], parity: false },
      alternates: [
        {
          policy: { orientedInPlace: "asTargets" },
          targets: "J K D E O V",
          expected: { cycleBreaks: [2, 4], kinds: [N, N, O, O, O, O], flipped: [], parity: false },
        },
      ],
    },
  },
  {
    id: "3-35",
    description: "Two-piece swap on each type (the smallest parity case)",
    categories: ["parity", "trailing-single"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "X", expected: { cycleBreaks: [], parity: true } },
    edges: { buffer: "UF", targets: "W", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "3-36",
    description: "Back-to-back breaks with no buffer cycle",
    categories: ["several-breaks", "solved-buffer", "closes-on-other-sticker"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A O A B X B", expected: { cycleBreaks: [0, 3], kinds: [B, N, C, B, N, C], parity: false } },
    edges: { buffer: "UF", targets: "A S Q D V E", expected: { cycleBreaks: [0, 3], kinds: [B, N, C, B, N, C], parity: false } },
  },
  {
    id: "3-37",
    description: "Reverse-Greek scheme with twisted and flipped pieces reported in that scheme",
    categories: ["custom-scheme", "twisted-and-flipped"],
    puzzle: "3x3x3",
    scheme: "reverse-greek",
    // Speffz reading: corners A G, twists UBR cw (Q→Θ), DFR ccw (P→Ι); edges B J, flips UB (Q→Θ), DR (O→Κ).
    corners: {
      buffer: "UFR",
      targets: "Ω Σ",
      twists: [
        { piece: "UBR", turns: 1 },
        { piece: "DFR", turns: -1 },
      ],
      expected: { cycleBreaks: [], twisted: ["Θ", "Ι"], parity: false },
    },
    edges: {
      buffer: "UF",
      targets: "Ψ Ο",
      twists: [
        { piece: "UB", turns: 1 },
        { piece: "DR", turns: 1 },
      ],
      expected: { cycleBreaks: [], flipped: ["Θ", "Κ"], parity: false },
    },
  },
  {
    id: "3-38",
    description: "Break cycle closing on a different sticker, plus a twisted corner excluded from breaks",
    categories: ["one-break", "closes-on-other-sticker", "twisted-and-flipped"],
    puzzle: "3x3x3",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "D B W N",
      twists: [
        { piece: "UBL", turns: -1 },
        { piece: "DFL", turns: 1 },
      ],
      expected: { cycleBreaks: [1], kinds: [N, B, N, C], twisted: ["G", "R"], parity: false },
    },
    edges: { buffer: "UF", targets: "K O", expected: { cycleBreaks: [], parity: false } },
  },

  // Real random-state scrambles (seed "real-scramble-fixtures"), traced by hand from their colour
  // nets. Buffers are test configurations, not defaults: R01–R05 use UFR/UF, R06–R10 UBL/UR.
  // Each target count was also checked against the permutation's cycle structure.
  {
    id: "R01",
    description: "Real scramble: corner break, two twists; three edge breaks, BL and buffer flipped",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "B' L F2' R2' D R2' U R2' F2' U' L2' F2' D B2' F' L' U' L2' R U' L",
    corners: { buffer: "UFR", targets: "D A S B P B", expected: { cycleBreaks: [3], twisted: ["L", "O"], parity: false } },
    edges: { buffer: "UF", targets: "D B A W V Q G T G J U P", expected: { cycleBreaks: [2, 6, 9], flipped: ["H", "I"], parity: false } },
  },
  {
    id: "R02",
    description: "Real scramble: parity, corner break closing on another sticker, buffer twisted at the end",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "F' D2' L2' D B2' D2' L2' D' R2' U' B2' U' R' U2' B' U F' D R B' L",
    corners: { buffer: "UFR", targets: "X D P N A U E", expected: { cycleBreaks: [4], twisted: ["O", "J"], parity: true } },
    edges: { buffer: "UF", targets: "S U A D B L P T H B G V G", expected: { cycleBreaks: [4, 10], flipped: [], parity: true } },
  },
  {
    id: "R03",
    description: "Real scramble: two corners twisted in place plus a twisted buffer; long edge buffer cycle",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "L' B2' L2' B2' U' B2' L2' D' L2' R2' U2' F2' R2' F' U R B D' F' R'",
    corners: { buffer: "UFR", targets: "I K A U H A", expected: { cycleBreaks: [2], twisted: ["N", "T", "J"], parity: false } },
    edges: { buffer: "UF", targets: "K O T G D P W L A H B Q", expected: { cycleBreaks: [8], flipped: [], parity: false } },
  },
  {
    id: "R04",
    description: "Real scramble: no corner breaks, buffer twisted; edges with a flipped DL",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "L' U2' B2' U F2' R2' F2' D' L2' D' B2' U' R B F2' D U F' R' B' U2'",
    corners: { buffer: "UFR", targets: "F P U X Q A", expected: { cycleBreaks: [], twisted: ["T", "M"], parity: false } },
    edges: { buffer: "UF", targets: "V S U H D M A N A F J F", expected: { cycleBreaks: [6, 9], flipped: ["G", "I"], parity: false } },
  },
  {
    id: "R05",
    description: "Real scramble: single buffer cycles on both piece types",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "B2' L' F B2' U F2' L2' D2' B2' L2' R2' U R2' U' F D L' B L2' F' L2'",
    corners: { buffer: "UFR", targets: "F S E N W L", expected: { cycleBreaks: [], twisted: ["K", "J"], parity: false } },
    edges: { buffer: "UF", targets: "P T M X R D S V U A", expected: { cycleBreaks: [], flipped: [], parity: false } },
  },
  {
    id: "R06",
    description: "Real scramble (UBL/UR): two corner breaks with two twists; two edge breaks",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "L' D2' B2' F2' U F2' U2' R2' U F2' U' L2' R2' F' D' B R2' U2' L D2' R",
    corners: { buffer: "UBL", targets: "T B F N G V L", expected: { cycleBreaks: [1, 4], twisted: ["J", "S"], parity: true } },
    edges: { buffer: "UR", targets: "K D I X W A P L A H T V H", expected: { cycleBreaks: [5, 9], flipped: [], parity: true } },
  },
  {
    id: "R07",
    description: "Real scramble (UBL/UR): one-target buffer cycle then a seven-target break",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "F2' L2' D R2' D2' L2' B2' U L2' F2' R2' B' R U L U F U B2' U",
    corners: { buffer: "UBL", targets: "G B J S W V D N", expected: { cycleBreaks: [1], twisted: [], parity: false } },
    edges: { buffer: "UR", targets: "F C Q V D X T U E H S H", expected: { cycleBreaks: [4, 9], flipped: [], parity: false } },
  },
  {
    id: "R08",
    description: "Real scramble (UBL/UR): three flipped U edges and a flipped buffer",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "U' D2' R D2' U2' L F2' R' U2' L' U2' R2' B2' U' B' L U2' B2' D2' U2'",
    corners: { buffer: "UBL", targets: "L P F J H Q", expected: { cycleBreaks: [], twisted: ["T", "E"], parity: false } },
    edges: { buffer: "UR", targets: "U R P O F S", expected: { cycleBreaks: [], flipped: ["E", "I", "Q", "M"], parity: false } },
  },
  {
    id: "R09",
    description: "Real scramble (UBL/UR): eight-piece corner cycle; edges with two flips",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "R U' R F U' L' D B U2' R' F2' L' F2' U2' F2' D2' L2' F2' L2' F",
    corners: { buffer: "UBL", targets: "I S G V C B T", expected: { cycleBreaks: [], twisted: [], parity: true } },
    edges: { buffer: "UR", targets: "K F R X E A I W A", expected: { cycleBreaks: [5], flipped: ["N", "O"], parity: true } },
  },
  {
    id: "R10",
    description: "Real scramble (UBL/UR): corner break closing on another sticker; edge five-target break",
    categories: ["real-scramble"],
    puzzle: "3x3x3",
    scheme: "speffz",
    scramble: "U' B2' L' D' L2' D B U2' L U B2' L2' F2' D B2' U' F2' L2' U2' D'",
    corners: { buffer: "UBL", targets: "H I T C B G V N", expected: { cycleBreaks: [4], twisted: [], parity: false } },
    edges: { buffer: "UR", targets: "S O X A H C D L T C", expected: { cycleBreaks: [5], flipped: [], parity: false } },
  },

  // 4x4x4: DLB corner and x-centres solved, frame taken as is.
  {
    id: "4-01",
    description: "4x4 corners and wings with no breaks",
    categories: ["4x4", "no-breaks"],
    puzzle: "4x4x4",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "A G", expected: { cycleBreaks: [], parity: false } },
    wings: { buffer: "UFr", targets: "A B D", expected: { cycleBreaks: [], kinds: [N, N, N], parity: true } },
  },
  {
    id: "4-02",
    description: "4x4 wing break cycle (wings close on the same letter)",
    categories: ["4x4", "one-break"],
    puzzle: "4x4x4",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "B", expected: { cycleBreaks: [], parity: true } },
    wings: { buffer: "UFr", targets: "A F K T F", expected: { cycleBreaks: [1], kinds: [N, B, N, N, C], parity: true } },
  },
  {
    id: "4-03",
    description: "4x4 corners solved; wings start with a break",
    categories: ["4x4", "solved-buffer", "fully-solved-type"],
    puzzle: "4x4x4",
    scheme: "speffz",
    corners: { buffer: "UFR", targets: "", expected: { cycleBreaks: [], twisted: [], parity: false } },
    wings: { buffer: "UFr", targets: "A W A", expected: { cycleBreaks: [0], kinds: [B, N, C], parity: true } },
  },
  {
    id: "4-04",
    description: "4x4 with other buffers (DFR corners, DFr wings)",
    categories: ["4x4", "buffers"],
    puzzle: "4x4x4",
    scheme: "speffz",
    corners: { buffer: "DFR", targets: "A C", expected: { cycleBreaks: [], parity: false } },
    wings: { buffer: "DFr", targets: "C I U", expected: { cycleBreaks: [], parity: true } },
  },
  {
    id: "4-05",
    description: "4x4 twisted corners with a break closing on another sticker; two wing breaks",
    categories: ["4x4", "several-breaks", "twisted-and-flipped", "closes-on-other-sticker"],
    puzzle: "4x4x4",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "A B W N",
      twists: [
        { piece: "DFR", turns: 1 },
        { piece: "UFL", turns: -1 },
      ],
      expected: { cycleBreaks: [1], kinds: [N, B, N, C], twisted: ["F", "K"], parity: false },
    },
    wings: { buffer: "UFr", targets: "B D L D N V N", expected: { cycleBreaks: [1, 4], kinds: [N, B, N, C, B, N, C], parity: true } },
  },
  {
    id: "4-06",
    description: "4x4 twisted corner under asTargets and separate",
    categories: ["4x4", "as-targets"],
    puzzle: "4x4x4",
    scheme: "speffz",
    corners: {
      buffer: "UFR",
      targets: "B K V",
      policy: { orientedInPlace: "asTargets" },
      expected: { cycleBreaks: [1], kinds: [N, O, O], twisted: [], parity: true },
      alternates: [{ policy: { orientedInPlace: "separate" }, targets: "B", expected: { cycleBreaks: [], twisted: ["K", "J"], parity: true } }],
    },
    wings: { buffer: "UFr", targets: "A", expected: { cycleBreaks: [], parity: true } },
  },
];
