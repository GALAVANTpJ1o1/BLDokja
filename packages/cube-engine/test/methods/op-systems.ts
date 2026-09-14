import type { Puzzle } from "../../src/core/puzzle.js";
import { m2OpSystem, type M2OpSystem } from "../../src/methods/m2.js";
import { opSystem, type OpSystem } from "../../src/methods/op.js";
import { pieceType } from "../../src/pieces/piece-types.js";

const CORNER_BUFFERS = ["UFR", "UBR", "UBL", "UFL", "DFR", "DFL", "DBL", "DBR"];
const EDGE_BUFFERS = ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"];

export function system(puzzle: Puzzle, cornerBuffer: string, edgeBuffer: string): OpSystem {
  const result = opSystem(puzzle, { cornerBuffer, edgeBuffer });
  if (!result.ok) throw new Error(JSON.stringify(result.error).slice(0, 500));
  return result.value;
}

/** Every buffer pair a symmetry maps (UBL, UR) onto, each buffer given as its piece's reference sticker. */
export function symmetricSystems(puzzle: Puzzle): OpSystem[] {
  const reference = (typeId: "corners" | "edges", piece: string) => pieceType(puzzle, typeId).pieceByName(piece)?.stickers.find((s) => s.isOrientationReference)?.name ?? piece;
  const systems: OpSystem[] = [];
  for (const c of CORNER_BUFFERS) {
    for (const e of EDGE_BUFFERS) {
      const result = opSystem(puzzle, { cornerBuffer: reference("corners", c), edgeBuffer: reference("edges", e) });
      if (result.ok) systems.push(result.value);
      else if (result.error.code !== "no-verified-parity-alg") throw new Error(JSON.stringify(result.error).slice(0, 500));
    }
  }
  return systems;
}

export function m2System(puzzle: Puzzle, cornerBuffer: string, edgeBuffer: string): M2OpSystem {
  const result = m2OpSystem(puzzle, { cornerBuffer, edgeBuffer });
  if (!result.ok) throw new Error(JSON.stringify(result.error).slice(0, 500));
  return result.value;
}

/** Every M2/OP system: corner reference stickers against the four M-slice buffers. */
export function m2Systems(puzzle: Puzzle): M2OpSystem[] {
  const systems: M2OpSystem[] = [];
  for (const c of CORNER_BUFFERS) {
    for (const e of ["DF", "UF", "DB", "UB"]) {
      const result = m2OpSystem(puzzle, { cornerBuffer: c, edgeBuffer: e });
      if (result.ok) systems.push(result.value);
      else if (result.error.code !== "no-verified-m2-system") throw new Error(JSON.stringify(result.error).slice(0, 500));
    }
  }
  return systems;
}
