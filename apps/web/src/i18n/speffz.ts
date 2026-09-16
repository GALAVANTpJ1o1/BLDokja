export const speffz = {
  title: "Speffz recognition", intro: "See the complete piece. Click a coloured sticker and type its letter. Practise recognition separately from execution.",
  family: "Piece family", edges: "Edges", corners: "Corners", count: "Pieces per round", start: "Start round", restart: "Start another round", check: "Check letter", next: "Next piece",
  choose: "Choose a coloured sticker", answer: "Sticker letter", correct: "Correct. Choose the next sticker.", wrong: (letter: string) => `Not quite. This sticker is ${letter}. Type it again to continue.`,
  loading: "Loading the verified sticker geometry…", ready: "The timer starts when you start the round and includes pauses between pieces. Every piece appears once before repeats. Identify every sticker on each piece.",
  progress: (index: number, count: number) => `Piece ${index} of ${count}`, fixed: "This drill always uses Speffz, even if your other trainers use a custom scheme. Face letters show orientation; the coloured sticker is what you name.",
  complete: "Round complete", elapsed: (ms: number) => `${(ms / 1000).toFixed(1)} s total`, perPiece: (ms: number) => `${(ms / 1000).toFixed(2)} s per piece`, accuracy: (ok: number, total: number) => `${ok} of ${total} first attempts correct`,
  history: "Recognition history", noHistory: "Check a sticker to begin your recognition history.", saved: "Recognition attempts saved locally.", saveError: "Your answer is kept, but this attempt could not be saved. Try saving again.", retry: "Retry save", pause: "End round", ended: "Round ended. Completed sticker attempts remain in your local history.",
  selected: (colour: string, face: string) => `${colour} sticker on ${face} face`, pieceDone: "All stickers identified. Continue when ready.",
  typical: (ms: number) => `${(ms / 1000).toFixed(2)} s median per sticker`,
} as const;
