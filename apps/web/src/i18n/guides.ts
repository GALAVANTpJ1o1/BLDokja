/**
 * Copy for the page guides: the short walk-through that opens by itself the first time you visit a page,
 * and again from the "Page guide" button. Kept as its own topic file, like i18n/explore.ts, so all of it can
 * be read and edited in one place. Each step names an area of the page and says how to use it; the labels
 * quoted in it are the ones on the page itself. Which element each step points at is in
 * components/guide/guides.ts.
 */
export interface GuideStepCopy {
  readonly title: string;
  readonly body: string;
}

export const guideUi = {
  /** The header button that reopens a page's guide. */
  button: "Page guide",
  dialogLabel: "Page guide",
  step: (n: number, total: number) => `Step ${n} of ${total}`,
  next: "Next",
  back: "Back",
  done: "Done",
  skip: "Skip guide",
} as const;

export const guideCopy = {
  home: {
    start: { title: "Start here", body: "Start learning opens the lesson paths. Choose a drill takes you straight to practice." },
    paths: { title: "Pick a path", body: "Blindfolded, CFOP and one-handed are three separate paths, and Practice is the training centre behind all of them. Each card jumps straight to it." },
    journey: { title: "Three ways in", body: "Follow the lesson path, drill one skill at a time, or set up your own lettering, images and algorithms. Everything you do is saved on this device." },
    first: { title: "Your first solve", body: "A guided solve, one checked step at a time. Close the page whenever you like: your next step waits for you." },
    today: { title: "What's next today", body: "Your next lesson, the letter pairs due for review and your weakest items are gathered here, so you can pick up where you left off." },
    nav: { title: "Find your way around", body: "Learn, Practice, Progress and Settings are always in this bar. Account is optional: everything works without one." },
  },
  learn: {
    intro: { title: "The learning path", body: "Lessons build on each other, but every one is open. Start with a first solve, or read from lesson 1." },
    tracks: { title: "Choose a path", body: "Blindfolded, CFOP and one-handed are separate paths, each with its own lessons and progress. Pick a card to jump to that path, or open Practice." },
    cfopLinks: { title: "Practise as you learn", body: "From the CFOP path you can go straight to F2L practice, to last-layer recognition, or to the complete cheat sheets. You never have to go back to find them." },
    lessons: { title: "Read the list", body: "Each lesson says what you will be able to do and how long it takes. Open one to read it alongside a cube you can play with." },
    next: { title: "Your next lesson", body: "The lesson marked Next is the first one you haven't finished. Complete a lesson's checkpoint and it is ticked off." },
  },
  lesson: {
    header: { title: "How a lesson works", body: "Each lesson says how long it takes. Open Lesson overview to see what you will be able to do by the end." },
    voice: { title: "Choose how it talks", body: "Some lessons come in more than one voice. The facts are the same in every voice; only the tone changes. You can switch at any time." },
    cards: { title: "Case cards", body: "A card shows the case, what to look for, how to hold it and the algorithm. Watch it solve opens a cube you can play, pause and step through." },
    links: { title: "Practise this", body: "These buttons take you to the practice for what the lesson taught and to its complete cheat sheet." },
    cube: { title: "Play with the cube", body: "Lessons come with cubes you can move. Use the buttons under a cube to step through moves. The flat net is exact and always works; Inspect in 3D, when shown, lets you turn the cube yourself." },
    checkpoint: { title: "Check yourself", body: "A checkpoint is a short drill or, in the F2L lesson, three cubes you solve with real turns. Complete it and the lesson is ticked off on the learning path." },
    next: { title: "Keep going", body: "When you finish, the next lesson on the path is one tap away." },
  },
  practice: {
    f2l: { title: "F2L practice", body: "Solve real pair cases on a cube you turn yourself, from one pair up to the whole first two layers." },
    lastLayer: { title: "Last-layer practice", body: "Recognise OLL and PLL cases in seven modes. You name the case, and its algorithm plays on the same cube." },
    memory: { title: "Memory and recognition", body: "Your letter-pair library and the memory workspace: images, palaces and stories." },
    first: { title: "Start with a first solve", body: "New to blind solving? This guided solve takes you through one checked step at a time." },
    drills: { title: "Drills for the cube", body: "Each drill trains one skill: recognising letters, tracing, setups, commutators, 4x4 pieces, or your letter-pair library. Pick one and give it your attention." },
    workbench: { title: "Reference and tools", body: "Complete case sheets, the algorithm library, the printable reference, the commutator sandbox and your difficulty settings." },
  },
  trainer: {
    tools: { title: "Keys and reading aloud", body: "Press ? on any trainer to see its keyboard shortcuts. Read aloud speaks each prompt, if your device has an English voice." },
    summary: { title: "Your session", body: "After your first answer, this shows how you are doing. It is a summary of this session; your history is on the Progress page." },
  },
  trace: {
    header: { title: "Guided trace", body: "Read a scramble target by target and type where each one goes. The lesson linked here explains the idea." },
    settings: { title: "Set it up", body: "Choose edges or corners, where the scramble comes from, and how much help the cube gives. Help drops as you get answers right, or you can pick a level yourself." },
    stage: { title: "The drill", body: "The cube lights where to look. Type the letter of the highlighted sticker's target and press Check. If you are stuck, Explain shows why. Your answers build a memo underneath." },
  },
  m2op: {
    header: { title: "M2 and Old Pochmann", body: "Recall the setup for a target, then reveal it and mark yourself. The lesson linked here teaches the method." },
    settings: { title: "Choose the drill", body: "Pick OP corners, OP edges, M2 edges or the M2 special cases, the order cases come in (weakest first or due for review), and which targets to include." },
    stage: { title: "Recall, then reveal", body: "You are given a target. Say or picture the setup moves, press Reveal, then mark whether you had it. The cases you miss come round again." },
    summary: { title: "Your session and mastery", body: "See how many cases you have mastered, plus every case in the set with its status." },
  },
  threeStyle: {
    header: { title: "3-style", body: "Every commutator for your buffer, with its moves and inverse. Learn a case with the algorithm in view, or recall it and check." },
    settings: { title: "Pick pieces and mode", body: "Choose corners or edges. Learn shows the algorithm with the case; Recall asks you to state the comm first, then reveal it." },
    stage: { title: "Learn or recall a case", body: "Each case names the buffer and two targets. In Learn, study the comm and its moves on the cube. In Recall, say the comm, press Reveal, then grade yourself." },
    summary: { title: "Your library", body: "Counts of cases mastered, due, new and learning, with options to export or import your own algorithms." },
  },
  fourBld: {
    header: { title: "4BLD trainer", body: "Trace x-centres, wings and corners on a 4x4, and drill r2 wings and U2 centres one target at a time." },
    settings: { title: "Choose a drill", body: "Pick which pieces to trace or which special case to drill, how scrambles are made, and how much the cube lights." },
    stage: { title: "Trace it", body: "Type the letter for each target in order and press Check. For x-centres, any slot of the buffer's colour that still needs it is right." },
  },
  pairs: {
    header: { title: "Your letter pairs", body: "A library of the 24 by 24 letter pairs, each with the images you use to remember it, and spaced review to keep them fresh." },
    views: { title: "Seven ways to use it", body: "Library is the grid. Review brings back what is due, Drill practises the rest, Find a word helps you think of one, Library health spots gaps, Memo sentence builds a sentence, and Import and export moves your data." },
    stage: { title: "Your grid", body: "Each cell is a letter pair. Open one to add words, notes or a category. Arrow keys move around the grid and Enter opens a pair." },
  },
  weak: {
    header: { title: "Weak 20", body: "Your twenty hardest items across every trainer, one after another." },
    stage: { title: "Drill your weak spots", body: "Each answer counts in its own trainer's history. Items need two attempts before they can be ranked, so drill a few cases in other trainers first." },
  },
  speffz: {
    setup: { title: "Set up a round", body: "Choose edges or corners and how many pieces per round, then press Start round. You will see a complete piece: click a coloured sticker and type its Speffz letter. Every piece appears once before any repeats." },
    history: { title: "Recognition history", body: "Once you have checked a sticker, your accuracy and speed are recorded here." },
  },
  sandbox: {
    input: { title: "Type an alg", body: "Write it in bracket notation. It is expanded, cancelled and counted, and played on a cube with only the pieces it moves lit." },
    comms: { title: "Comms for three stickers", body: "Choose corners or edges, then pick three stickers in order: the first is where the cycle starts. You get commutators for that cycle." },
    scratchpad: { title: "Scratchpad", body: "Notes saved in this browser and included in your backups. Use it for comms you want to keep." },
  },
  difficulty: {
    scrambles: { title: "Which scrambles you get", body: "Limit pieces, target counts, cycle breaks, flipped edges, twisted corners and parity. Leave a box empty for no limit." },
    subsets: { title: "Choose your cases", body: "Tick first targets to drill only those cases. None ticked means every case." },
    time: { title: "Time pressure", body: "A soft target marks slow answers but keeps the grade; a hard cutoff counts them as wrong. Looking again decides whether guided trace can bring the cube back." },
    presets: { title: "Seeds and presets", body: "A seed replays exactly the same session. Name your settings and save them as a preset to switch between them later." },
  },
  firstSolve: {
    intro: { title: "A solve, one step at a time", body: "This guided solve uses Old Pochmann for edges and corners, with your lettering and the standard buffers. New to blind solving? The foundations lessons come first." },
    begin: { title: "Begin", body: "Choose where your scramble comes from, then press Begin a new solve. Close the page whenever you need to: your next step will be waiting." },
  },
  levels: {
    choose: { title: "Pick a skill", body: "Recognition, setup recall, algorithm recall, blind execution and mixed full solves are different skills with separate timings. Choose any: nothing is locked." },
    task: { title: "Do the step", body: "Read the prompt, type your answer and press Check this step. Show a hint if you are stuck." },
    analytics: { title: "Each skill on its own", body: "Every level keeps its own results and median time, so getting better at one skill never hides another." },
  },
  debug: {
    solve: { title: "Tell it about your solve", body: "Choose your buffer convention and give the original scramble and the memo you wrote. Add the memo you recalled if you have it." },
    moves: { title: "What you did", body: "Enter the moves you actually executed, and optionally the moves you meant to do. The engine compares them with your memo." },
    check: { title: "Inspect it", body: "Say if you held the cube differently or left out the parity fix, then press Inspect this solve to follow the evidence." },
  },
  algorithms: {
    filters: { title: "Choose what to look up", body: "Pick a reference group, such as CFOP last layer or 3-style commutators. Each group is a different set of cases." },
    search: { title: "Narrow the list", body: "Choose corners or edges, show only your saved cases, or download the table as a CSV file. The search box below narrows it further." },
    table: { title: "Pick a case", body: "Each row is a case with its verified algorithm. Choose one to see it on a cube, keep your preferred algorithm, and compare alternatives." },
  },
  memory: {
    palace: { title: "Build a memory palace", body: "Name a palace and add locations in the order you walk through them. Each location can hold a reusable image prompt. Prompts are stored as text only." },
    pairs: { title: "Give a pair a picture", body: "Type two letters and the word you picture for them, then optionally choose a PNG, JPEG or WebP picture (up to 2 MB). It is stored on this device." },
    story: { title: "Compose a memo story", body: "List your letter pairs with spaces between them and press Compose from my images. Each pair becomes a scene: reorder them, and attach the story to a palace." },
    saved: { title: "Saved stories", body: "Reopen a story you saved to rehearse it again." },
  },
  reference: {
    options: { title: "Choose what goes on it", body: "Tick whether the sheet includes your pair words and your preferred algorithms." },
    actions: { title: "Save or print it", body: "Download my PDF, or print or save it from your browser. It is generated on this device and nothing is uploaded." },
    sheet: { title: "Your reference sheet", body: "Your buffers, lettering scheme, pair words and algorithms on one page. Tick the physical-cube spot checks only after you have tried the moves on a real cube." },
  },
  bigCubes: {
    compare: { title: "3x3 against 4x4", body: "What carries over and what is new when you move to a 4x4: corners work as before, wings and movable centres are different." },
    family: { title: "The 5x5 family path", body: "Work through one piece family at a time: corners, midges, wings, x-centres and t-centres. Choose one here, or use Previous family and Next family below." },
    practice: { title: "Practise a family", body: "Recognition drill tests you on the family shown, and Trace this family walks a scramble target by target." },
  },
  progress: {
    period: { title: "Choose a time range", body: "Last 30 days, last 90 days or all time. Every chart below follows it." },
    activity: { title: "Your practice days", body: "A day counts once you complete a graded drill. Your streak and daily goal show here." },
    trends: { title: "Are you improving?", body: "Each point is the last 7 days, so one bad session doesn't swing the line. Show as a table gives the same numbers as text." },
    cfop: { title: "CFOP progress", body: "F2L solves, recognition accuracy and speed, and how many OLL and PLL cases you have learned, are folded from the same attempts." },
    data: { title: "Your data", body: "Every attempt is kept in this browser only. The link here takes you to Settings, where you can export it or delete it." },
  },
  settings: {
    appearance: { title: "Make it yours", body: "Pick a theme, colour palette, scenery, page layout and sticker colours (including a colour-blind-friendly set), how cubes are drawn, and the voice lessons use." },
    offline: { title: "Use lessons offline", body: "Make all lessons available offline downloads them to this device, so you can learn without a connection." },
    lettering: { title: "Your lettering", body: "Open Lettering and buffers to choose Speffz or your own letters, and your buffers. Every trainer reads from them." },
    goal: { title: "A daily goal", body: "Set how many graded attempts you want to do each day. Your progress toward it shows on the Progress page." },
    data: { title: "Back up and delete", body: "Export a backup file, import one, or delete all your data from this browser. Back up before you delete anything." },
  },
  lettering: {
    scheme: { title: "Letter the stickers your way", body: "Start from Speffz or blank, choose corners or edges, select a sticker and type a letter: the next sticker is selected for you. Every sticker needs one letter, and none may repeat." },
    buffers: { title: "Choose your buffers", body: "The buffer is where each target is shot from. OP and M2 need a pair of pieces the site can build setups for; 3-style takes any corner and edge. You can also trace from another sticker of the buffer piece, LUB instead of UBL, say." },
  },
  account: {
    form: { title: "Sign in or stay a guest", body: "As a guest, everything stays on this browser. An account backs your progress up and syncs it across devices. You only need a username and password: no email." },
    switch: { title: "New here?", body: "Create an account, or reset a forgotten password with your recovery code. You are shown that code once when you sign up: save it." },
    sync: { title: "Sync status", body: "Shows whether your progress is up to date. Sync now sends and fetches changes straight away." },
    recovery: { title: "Recovery code", body: "The only way to reset a forgotten password, because there is no email. Generate a new one if you have lost it: the old code stops working." },
    leaderboards: { title: "Leaderboards", body: "Opt in to appear on the public boards under a display name that is never your username. Save leaderboard settings applies your choice." },
    delete: { title: "Delete account", body: "Permanently deletes your account and everything synced, everywhere. Export a backup first." },
  },
  leaderboard: {
    controls: { title: "Live or past months", body: "This period shows the current rankings, and Past months shows archived ones. You can read the boards without an account." },
    table: { title: "Pick a board", body: "Streaks, active days, or points for today, this week or this month. Names are display names, never usernames, and rankings are self-reported and not verified: treat them as friendly." },
  },
  referenceIndex: {
    header: { title: "Complete case sets", body: "Every F2L, OLL and PLL case the site teaches, each set on a page of its own, drawn exactly as its algorithm expects." },
    index: { title: "Cheat sheets", body: "F2L, 2-look OLL, 2-look PLL, full OLL and full PLL, each as a page of cards you scroll." },
  },
  referenceSheet: {
    links: { title: "Practise and learn", body: "Jump to the practice for this set, or to the lesson that teaches it." },
    tools: { title: "Find a case", body: "Search by name, number or shape, filter by what you have learned, and pick two-handed or one-handed." },
    search: { title: "Search in your own words", body: "Try a name such as sune, a number such as 27, a shape such as fish, or headlights. Internal ids are never needed." },
    style: { title: "Two-handed or one-handed", body: "One-handed shows the dedicated one-handed algorithm where there is one, and says so where there is not. The choice is kept for every CFOP page." },
    grid: { title: "One card per case", body: "Each card shows the case, what to look for, how to hold it and the algorithm. Set a case as learning or learned, or leave it to be judged from your practice." },
    diagram: { title: "Read the picture", body: "Yellow is on top. Outlines and letters on the diagram mark bars and headlights, so colour is never the only clue." },
    alg: { title: "The algorithm", body: "Play it on a cube with Watch it solve. Any turn to make before or after it is written under it." },
  },
  f2lPractice: {
    levels: { title: "Four levels", body: "From one unsolved pair, through two and three, to the whole first two layers. Every state is built from real moves." },
    board: { title: "Your cube", body: "The lit pieces are the ones to solve. Everything else is quiet, and the cross must stay." },
    moves: { title: "Turn it yourself", body: "Only U, R, L and F turns are offered, so the cube never changes under you. Any solution that solves the pair and keeps the cross counts." },
    stats: { title: "Your record", body: "Solves, average moves, hints and resets, and the cases to revisit, from the same attempts as the rest of your progress." },
  },
  lastLayer: {
    modes: { title: "Seven modes", body: "Two-look OLL, two-look PLL, two-look last layer, one-look OLL and PLL, and two mixed modes. Each stage is played on the cube the last one left." },
    options: { title: "Filter and length", body: "Practise all cases, only the ones you are learning, your weak or slowest cases, or the ones you have never seen." },
    record: { title: "Your record", body: "Accuracy, average and best recognition time, and which case you most often mistake each one for." },
    stage: { title: "Recognise, then answer", body: "The timer runs while you look and stops when you answer. Type a name or number, or pick from the matches." },
    diagram: { title: "The case", body: "Only what the stage needs is drawn: the edges for edge orientation, the whole top for OLL, the ring of side stickers for PLL." },
    review: { title: "Session review", body: "Your accuracy, average time, and your weakest, slowest and most confused cases, with a button to practise the weak ones." },
  },
} as const satisfies Record<string, Record<string, GuideStepCopy>>;
