export const explore = {
  back: "Back", backPractice: "Back to practice", backLearn: "Back to lessons", backHome: "Back home",
  previous: "Previous target", returnCurrent: "Return to current target", review: "Review only. This does not add another attempt or change your memo.",
  wholePiece: "Identify the outlined sticker using all the colours of this piece. Centres show the fixed face colours.",
  sticker: (colour: string, face: string) => `${colour} sticker on the ${face} face`,
  reviewLetter: (letter: string) => `This target was ${letter}.`,
} as const;
