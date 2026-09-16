# Writing a lesson

Lessons are data, not code (BRIEF §12). A lesson is a folder of MDX under `/content/lessons/<track>/`, and
nothing in `apps/web` needs to change to add one: the learning path, the lesson page and the progress marks
are all built from the folder's frontmatter.

```
content/lessons/3bld/06-tracing-a-cycle/
  lesson.mdx      frontmatter and the plain voice
  tsundere.mdx    optional, this voice only
  casual.mdx      optional
  roast.mdx       optional
```

The folder's number sets nothing: `order:` in the frontmatter does.

## Frontmatter

`lesson.mdx` starts with YAML between `---` lines. The schema is `apps/web/src/content/lessons/schema.ts`,
and an invalid field fails the build.

| Field | What it is |
|---|---|
| `id` | lowercase words with hyphens; the URL is `/learn/<id>/` |
| `title` | the lesson's name |
| `track` | `3bld` or `4bld` |
| `order` | position on the path |
| `prerequisites` | ids of lessons that must come earlier |
| `estimatedMinutes` | 5–8; the path shows it and a test enforces the range |
| `objectives` | 1–5 lines of "what you'll be able to do" |
| `checkpoints` | one or more `{ id, title, pass }`; `pass` defaults to 0.8 |
| `recap` | short reminders of what this lesson builds on; required if it has prerequisites |
| `lettering` | `yours` (default) or `speffz` for a lesson that teaches Speffz itself |

A voice file's frontmatter is only `voice: tsundere` (or `casual`, `roast`).

## What you may write

Prose is Markdown. **Lesson files can't run JavaScript**: props are plain strings, and a test rejects any
`{expression}`. The components below are the only ones available, and every voice of a lesson must use the
same components with the same props in the same order, so a voice changes how something is said, never what
is taught.

| Component | Props | What it does |
|---|---|---|
| `<Cube>` | `setup`, `alg`, `highlight`, `controls`, `dim`, `label` | the cube, with the reader's chosen display (3D, net or written out) |
| `<MoveExplorer>` | `moves`, `label` | click a move, see it |
| `<TraceWalk>` | `scramble`, `pieces`, `method`, `mode`, `label`, `shows` | a worked or guided trace |
| `<SpeffzExplorer>` | `pieces` | the clickable lettered net |
| `<OpShot>` | `pieces`, `target` | one Old Pochmann shot, animated |
| `<SwapAlg>` | `pieces` | the method's swap alg |
| `<IllegalSetup>` | `pieces`, `family` | what a forbidden setup move damages |
| `<ParityAlg>` | — | the parity alg for the standard buffers |
| `<SolveWalkthrough>` | `scramble` | a whole solve, step by step |
| `<Checkpoint>` | `id`, `kind`, `count`, `pieces`, `requires`, `maxTargets` | the end-of-lesson drill |
| `<Question>`, `<Option>` | `id`, `prompt`, `answer` | a quiz item inside a checkpoint |
| `<Letter>`, `<Buffer>`, `<Moves>`, `<Note>` | see below | inline pieces of text |

- `<Letter sticker="UBL">` prints the reader's letter for that sticker.
- `<Buffer pieces="corners">` prints the buffer the lesson teaches.
- `<Moves>R U R'</Moves>` sets notation in the notation face.
- `<Note>` is an aside.

**Checkpoint kinds:** `letters`, `trace`, `parity` and `setup` generate fresh items every attempt, all
checked by the engine; `quiz` wraps `<Question>` blocks you write.

## The rules a test enforces

`apps/web/src/content/lessons/lessons.test.ts` fails the build if a lesson:

- has frontmatter that doesn't match the schema, a missing prerequisite, or one that comes later;
- is outside 5–8 minutes, or builds on something without a recap;
- uses an unknown component, or has no interactive one (BRIEF §6: prose alone is not a lesson);
- contains a JavaScript expression;
- has a voice whose components or props differ from the plain voice;
- declares a checkpoint that isn't in the text, or one that isn't declared;
- uses American spelling;
- names a sticker, alg, scramble or move the engine doesn't recognise, or an OP target or forbidden move
  that isn't in the verified dataset;
- gives a `<TraceWalk>` a scramble that doesn't show what the lesson says it shows (`shows="break"` and so
  on is traced and checked).

So: write the lesson, run `pnpm test`, and the checks tell you what's wrong.

## Voices

`plain` is the source of truth. Write it first, get it right, then translate it into the other voices —
same components, same claims, different tone. The reader picks a voice on their first visit and can change
it in a lesson's header or in Settings. Buttons, warnings and data messages are never voiced.

## Adding a lesson to the path

Nothing else to do: the path is generated from `track`, `order` and `prerequisites`. A lesson is marked
done when its checkpoints are passed, which is stored in this browser.
