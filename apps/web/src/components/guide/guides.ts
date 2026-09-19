import { guideCopy, type GuideStepCopy } from "@/i18n/guides";

/**
 * Every page guide: which pages have one, and for each step, which element on the page it points at.
 * The words are in i18n/guides.ts. A step points at an element carrying data-guide="<step id>" unless it
 * says otherwise. A step whose element is not on screen when the guide runs (a section that only exists once
 * you are signed in, say) is left out, so one guide can serve a page that comes in more than one shape.
 */
export interface GuideStep extends GuideStepCopy {
  readonly id: string;
  readonly target: string;
}

export interface Guide {
  readonly id: string;
  /** Raise this when the steps change enough that people who saw the old guide should see it again. */
  readonly version: number;
  readonly matches: (path: string) => boolean;
  /**
   * What must be on screen before the guide opens by itself: any one of these selectors. The default is the
   * first step's element. Pages that load their real content after a placeholder (every trainer shows its
   * header first) name the part that arrives last, so the guide doesn't open on half a page.
   */
  readonly ready?: readonly string[];
  readonly steps: readonly GuideStep[];
}

const step = (id: string, copy: GuideStepCopy, target: string = `[data-guide="${id}"]`): GuideStep => ({ id, target, ...copy });
const exactly = (route: string) => (path: string) => path === route;

// Cubes appear in the header too, so a step about "the cube" means one in the page itself.
const CUBE = 'main [data-guide="cube"]';
const NAV = '[data-guide="nav"]';
/** A trainer's drill is the part that arrives after its header (which shows while the trainer loads). */
const TRAINER_READY: readonly string[] = ['[data-guide="trainer-stage"]'];

interface TrainerCopy {
  readonly header: GuideStepCopy;
  readonly settings?: GuideStepCopy;
  readonly stage: GuideStepCopy;
  readonly summary?: GuideStepCopy;
}

/** The trainers built on the shared trainer shell have the same regions; each brings its own words for them. */
function trainerSteps(copy: TrainerCopy): GuideStep[] {
  return [
    step("trainer-header", copy.header),
    step("trainer-tools", guideCopy.trainer.tools),
    ...(copy.settings === undefined ? [] : [step("trainer-settings", copy.settings)]),
    step("trainer-stage", copy.stage),
    ...(copy.summary === undefined ? [] : [step("trainer-summary", copy.summary)]),
  ];
}

export const GUIDES: readonly Guide[] = [
  {
    id: "home",
    version: 2,
    // Either layout: the first-visit page or the returning learner's "Today".
    ready: ['[data-guide="home-start"]', '[data-guide="home-first"]'],
    matches: exactly("/"),
    steps: [
      step("home-start", guideCopy.home.start),
      step("home-paths", guideCopy.home.paths),
      step("home-journey", guideCopy.home.journey),
      step("home-first", guideCopy.home.first),
      step("home-today", guideCopy.home.today),
      step("nav", guideCopy.home.nav, NAV),
    ],
  },
  {
    id: "learn",
    version: 2,
    matches: exactly("/learn/"),
    steps: [
      step("learn-intro", guideCopy.learn.intro),
      step("learn-tracks", guideCopy.learn.tracks),
      step("learn-lessons", guideCopy.learn.lessons),
      step("learn-cfop-links", guideCopy.learn.cfopLinks),
      step("learn-next", guideCopy.learn.next, 'main [data-status="next"]'),
    ],
  },
  {
    id: "lesson",
    version: 2,
    matches: (path) => /^\/learn\/[^/]+\/$/.test(path),
    steps: [
      step("lesson-header", guideCopy.lesson.header),
      step("lesson-voice", guideCopy.lesson.voice),
      step("cube", guideCopy.lesson.cube, CUBE),
      step("lesson-cards", guideCopy.lesson.cards),
      step("lesson-links", guideCopy.lesson.links),
      step("lesson-checkpoint", guideCopy.lesson.checkpoint),
      step("lesson-next", guideCopy.lesson.next),
    ],
  },
  {
    id: "practice",
    version: 2,
    matches: exactly("/practice/"),
    steps: [
      step("practice-f2l", guideCopy.practice.f2l),
      step("practice-last-layer", guideCopy.practice.lastLayer),
      step("practice-drills", guideCopy.practice.drills),
      step("practice-memory", guideCopy.practice.memory),
      step("practice-workbench", guideCopy.practice.workbench),
    ],
  },
  { id: "reference-index", version: 1, matches: exactly("/reference/"), steps: [step("reference-header", guideCopy.referenceIndex.header), step("reference-index", guideCopy.referenceIndex.index)] },
  {
    id: "reference-sheet",
    version: 1,
    matches: (path) => /^\/reference\/[^/]+\/$/.test(path),
    ready: ['[data-guide="reference-tools"]'],
    steps: [
      step("reference-links", guideCopy.referenceSheet.links),
      step("reference-tools", guideCopy.referenceSheet.tools),
      step("reference-search", guideCopy.referenceSheet.search),
      step("reference-style", guideCopy.referenceSheet.style),
      step("reference-grid", guideCopy.referenceSheet.grid),
      step("case-diagram", guideCopy.referenceSheet.diagram, 'main [data-guide="case-diagram"]'),
      step("case-alg", guideCopy.referenceSheet.alg, 'main [data-guide="case-alg"]'),
    ],
  },
  {
    id: "f2l-practice",
    version: 1,
    ready: ['[data-guide="f2l-board"]'],
    matches: exactly("/practice/f2l/"),
    steps: [step("f2l-levels", guideCopy.f2lPractice.levels), step("f2l-board", guideCopy.f2lPractice.board), step("f2l-moves", guideCopy.f2lPractice.moves), step("f2l-stats", guideCopy.f2lPractice.stats)],
  },
  {
    id: "last-layer",
    version: 1,
    ready: ['[data-guide="ll-modes"]', '[data-guide="trainer-stage"]'],
    matches: exactly("/practice/last-layer/"),
    steps: [
      step("ll-modes", guideCopy.lastLayer.modes),
      step("ll-options", guideCopy.lastLayer.options),
      step("ll-record", guideCopy.lastLayer.record),
      step("trainer-stage", guideCopy.lastLayer.stage),
      step("ll-diagram", guideCopy.lastLayer.diagram),
      step("ll-review", guideCopy.lastLayer.review),
    ],
  },
  { id: "trace", version: 1, ready: TRAINER_READY, matches: exactly("/practice/trace/"), steps: trainerSteps(guideCopy.trace) },
  { id: "m2op", version: 1, ready: TRAINER_READY, matches: exactly("/practice/m2op/"), steps: trainerSteps(guideCopy.m2op) },
  { id: "three-style", version: 1, ready: TRAINER_READY, matches: exactly("/practice/3style/"), steps: trainerSteps(guideCopy.threeStyle) },
  { id: "four-bld", version: 1, ready: TRAINER_READY, matches: exactly("/practice/4bld/"), steps: trainerSteps(guideCopy.fourBld) },
  { id: "weak", version: 1, ready: TRAINER_READY, matches: exactly("/practice/weak/"), steps: trainerSteps(guideCopy.weak) },
  {
    id: "pairs",
    version: 1,
    ready: TRAINER_READY,
    matches: exactly("/practice/pairs/"),
    steps: [
      step("trainer-header", guideCopy.pairs.header),
      step("trainer-tools", guideCopy.trainer.tools),
      step("pairs-views", guideCopy.pairs.views),
      step("trainer-stage", guideCopy.pairs.stage),
    ],
  },
  {
    id: "speffz",
    version: 1,
    matches: exactly("/practice/speffz/"),
    steps: [step("speffz-setup", guideCopy.speffz.setup), step("speffz-history", guideCopy.speffz.history)],
  },
  {
    id: "sandbox",
    version: 1,
    matches: exactly("/practice/sandbox/"),
    steps: [step("sandbox-input", guideCopy.sandbox.input), step("sandbox-comms", guideCopy.sandbox.comms), step("sandbox-scratchpad", guideCopy.sandbox.scratchpad)],
  },
  {
    id: "difficulty",
    version: 1,
    matches: exactly("/practice/difficulty/"),
    steps: [
      step("difficulty-scrambles", guideCopy.difficulty.scrambles),
      step("difficulty-subsets", guideCopy.difficulty.subsets),
      step("difficulty-time", guideCopy.difficulty.time),
      step("difficulty-presets", guideCopy.difficulty.presets),
    ],
  },
  {
    id: "first-solve",
    version: 1,
    matches: exactly("/practice/first-solve/"),
    steps: [step("first-intro", guideCopy.firstSolve.intro), step("first-begin", guideCopy.firstSolve.begin)],
  },
  {
    id: "levels",
    version: 1,
    matches: exactly("/practice/levels/"),
    steps: [step("levels-choose", guideCopy.levels.choose), step("levels-task", guideCopy.levels.task), step("levels-analytics", guideCopy.levels.analytics)],
  },
  {
    id: "debug",
    version: 1,
    matches: exactly("/practice/debug/"),
    steps: [step("debug-solve", guideCopy.debug.solve), step("debug-moves", guideCopy.debug.moves), step("debug-check", guideCopy.debug.check)],
  },
  {
    id: "algorithms",
    version: 1,
    matches: exactly("/practice/algorithms/"),
    steps: [step("alg-filters", guideCopy.algorithms.filters), step("alg-search", guideCopy.algorithms.search), step("alg-table", guideCopy.algorithms.table)],
  },
  {
    id: "memory",
    version: 1,
    matches: exactly("/practice/memory/"),
    steps: [step("memory-palace", guideCopy.memory.palace), step("memory-pairs", guideCopy.memory.pairs), step("memory-story", guideCopy.memory.story), step("memory-saved", guideCopy.memory.saved)],
  },
  {
    id: "reference",
    version: 1,
    matches: exactly("/practice/reference/"),
    steps: [step("reference-options", guideCopy.reference.options), step("reference-actions", guideCopy.reference.actions), step("reference-sheet", guideCopy.reference.sheet)],
  },
  {
    id: "big-cubes",
    version: 1,
    matches: exactly("/practice/big-cubes/"),
    steps: [step("big-compare", guideCopy.bigCubes.compare), step("big-family", guideCopy.bigCubes.family), step("big-practice", guideCopy.bigCubes.practice)],
  },
  {
    id: "progress",
    version: 2,
    matches: exactly("/progress/"),
    steps: [
      step("progress-period", guideCopy.progress.period),
      step("progress-activity", guideCopy.progress.activity),
      step("progress-trends", guideCopy.progress.trends),
      step("progress-cfop", guideCopy.progress.cfop),
      step("progress-data", guideCopy.progress.data),
    ],
  },
  {
    id: "settings",
    version: 1,
    matches: exactly("/settings/"),
    steps: [
      step("settings-appearance", guideCopy.settings.appearance),
      step("settings-offline", guideCopy.settings.offline),
      step("settings-lettering", guideCopy.settings.lettering),
      step("settings-goal", guideCopy.settings.goal),
      step("settings-data", guideCopy.settings.data),
    ],
  },
  {
    id: "lettering",
    version: 1,
    matches: exactly("/settings/lettering/"),
    steps: [step("lettering-scheme", guideCopy.lettering.scheme), step("lettering-buffers", guideCopy.lettering.buffers)],
  },
  {
    id: "account",
    version: 1,
    // The sign-in form for a guest, or the sync section once signed in.
    ready: ['[data-guide="account-form"]', '[data-guide="account-sync"]'],
    matches: exactly("/account/"),
    steps: [
      step("account-form", guideCopy.account.form),
      step("account-switch", guideCopy.account.switch),
      step("account-sync", guideCopy.account.sync),
      step("account-recovery", guideCopy.account.recovery),
      step("account-leaderboards", guideCopy.account.leaderboards),
      step("account-delete", guideCopy.account.delete),
    ],
  },
  {
    id: "leaderboard",
    version: 1,
    matches: exactly("/leaderboard/"),
    steps: [step("leaderboard-controls", guideCopy.leaderboard.controls), step("leaderboard-table", guideCopy.leaderboard.table)],
  },
];

/** The guide for a page, or undefined for pages with nothing to explain (plain text pages, the 404). */
export function guideForPath(pathname: string): Guide | undefined {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return GUIDES.find((guide) => guide.matches(path));
}
