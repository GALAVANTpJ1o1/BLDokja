/**
 * Copy that changes with the lesson voice (your 2026-09-15 answers): trainer hints, checkpoint
 * feedback and the voice picker's samples. Buttons, settings, errors and data warnings stay plain and
 * live in en.ts.
 *
 * Limits, as you set them:
 * - Casual jokes about the cubing, never the person, and doesn't swear.
 * - Tsundere may swear mildly.
 * - Roaster may say anything except slurs and jokes about who someone is.
 * Every line says the same fact as its plain version; the voice only changes the delivery.
 */
import type { Voice } from "@bld/storage";

export type Voiced<T extends unknown[] = []> = Readonly<Record<Voice, (...args: T) => string>>;

export const voiced = {
  pickerTitle: "How should lessons talk to you?",
  pickerIntro: "Pick a voice. The facts are the same in every one, and you can switch any time from the lesson header or Settings.",
  samples: {
    plain: () => "A cycle break starts a new cycle at the lowest-lettered sticker that isn't solved yet.",
    tsundere: () => "Ugh, fine, I'll explain it. A cycle break starts a new cycle at the lowest-lettered unsolved sticker. D-don't make me say it twice.",
    casual: () => "Okay so the buffer came home early, rude. You just jump to the lowest-lettered unsolved sticker and keep going. Easy.",
    roast: () => "Your buffer's back home already? Cute. Break into the lowest-lettered unsolved sticker, and try not to trace the same piece twice this time.",
  } satisfies Voiced,

  traceCorrect: {
    plain: (letter: string) => `Correct: ${letter}.`,
    tsundere: (letter: string) => `${letter}. Yeah, that's right. Not that I'm impressed or anything.`,
    casual: (letter: string) => `${letter}! Nailed it.`,
    roast: (letter: string) => `${letter}. Correct, which honestly surprised both of us.`,
  } satisfies Voiced<[string]>,
  traceWrong: {
    plain: (letter: string, typed: string) => `Not quite: you typed ${typed}, it's ${letter}. Type ${letter} to go on.`,
    tsundere: (letter: string, typed: string) => `Wrong, dummy. You typed ${typed}; it's ${letter}. Type ${letter} and pay attention this time, damn it.`,
    casual: (letter: string, typed: string) => `Close-ish: you typed ${typed}, but it's ${letter}. Type ${letter} and we roll on.`,
    roast: (letter: string, typed: string) => `Nope. You typed ${typed}. It's ${letter}. Type ${letter}, and maybe look at the highlighted piece instead of vibes.`,
  } satisfies Voiced<[string, string]>,
  // The whole piece is lit, because one colour of a corner fits four positions; the sticker to place is
  // named by its face, which also picks it out in the 3D view, where nothing can be ringed.
  traceLook: {
    plain: (face: string) => `Look at the highlighted piece. Take its sticker on the ${face} face: where does that sticker belong? Type that spot's letter.`,
    tsundere: (face: string) => `Look at the highlighted piece, obviously. Its sticker on the ${face} face: where does that one go? Type that letter. Hmph.`,
    casual: (face: string) => `Peep the highlighted piece. Its sticker on the ${face} face: where does that one live? Drop that letter.`,
    roast: (face: string) => `The highlighted piece. The one glowing at you. Take its sticker on the ${face} face: where does it belong? Type the letter.`,
  } satisfies Voiced<[string]>,
  traceBreak: {
    plain: () => "The buffer's piece is home, so this cycle is closed. Start a new one: pick the lowest-lettered sticker that isn't solved (it's highlighted).",
    tsundere: () => "The buffer piece is already home, so the cycle's done. Start a new one at the lowest-lettered unsolved sticker. It's highlighted, since you clearly need the help.",
    casual: () => "Buffer piece is home, cycle closed. New cycle time: grab the lowest-lettered unsolved sticker (the lit one).",
    roast: () => "The buffer's piece came home, so that cycle's over. Break into the lowest-lettered unsolved sticker. We even highlighted it for you.",
  } satisfies Voiced,
  traceTwist: {
    plain: () => "This piece is in its own slot but twisted or flipped. You trace it as two targets: into its slot on one sticker, out on another.",
    tsundere: () => "This piece is in the right slot but twisted, how annoying. Trace it as two targets: in on one sticker, out on the other. Got it?",
    casual: () => "This piece is home but twisted, classic. Trace it as two targets: in on one sticker, out on the other.",
    roast: () => "Right slot, wrong way round, like your last solve. Trace it as two targets: in on one sticker, out on the other.",
  } satisfies Voiced,
  traceDone: {
    plain: () => "That's every target. Your memo is below.",
    tsundere: () => "That's all of them. You finished. I guess that's... fine. Your memo's below.",
    casual: () => "And that's the whole trace! Memo's below.",
    roast: () => "Every target done. Miracles happen. Your memo is below.",
  } satisfies Voiced,

  checkpointPassed: {
    plain: (score: string) => `Passed with ${score}. This checkpoint is done.`,
    tsundere: (score: string) => `${score}. You passed. Don't let it go to your head, idiot.`,
    casual: (score: string) => `${score}, you passed! Checkpoint done.`,
    roast: (score: string) => `${score}. Passed. I had money on the other outcome.`,
  } satisfies Voiced<[string]>,
  checkpointFailed: {
    plain: (score: string, needed: string) => `${score}. You need ${needed} to pass. Try another set; they're new each time.`,
    tsundere: (score: string, needed: string) => `${score}? You need ${needed}. Ugh, try again. It's a new set, so no excuses.`,
    casual: (score: string, needed: string) => `${score}, so close. You need ${needed}. Run it back; it's a fresh set.`,
    roast: (score: string, needed: string) => `${score}. The bar is ${needed}, and it's not that high. New set, go again.`,
  } satisfies Voiced<[string, string]>,
} as const;
