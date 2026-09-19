import { en } from "@/i18n/en";
import type { LetterComparison as Comparison, LetterPair } from "@/trainers/checkpoint-items";

/**
 * Targets per table. Measured on the live page: six fit a 320px phone's content width (about 300px with
 * the row labels), and eight only fit from about 375px. The wrapper below scrolls the table, never the
 * page, if a narrower screen or a wider letter still doesn't fit.
 */
const PER_TABLE = 6;

/** The sentence that says where a wrong memo went wrong; undefined when nothing differs. */
export function differenceText(comparison: Comparison): string | undefined {
  const first = comparison.firstDifference;
  if (first === undefined) return undefined;
  const t = en.lesson.compare;
  if (comparison.pairs.length === 1 && first.typed !== undefined && first.right !== undefined) return t.single(first.typed, first.right);
  if (first.typed === undefined) return first.position === 1 ? t.nothingTyped(first.right ?? "") : t.stoppedEarly(first.position, first.right ?? "");
  if (first.right === undefined) return t.tooLong(first.position, first.typed);
  return t.differs(first.position, first.typed, first.right);
}

function TypedCell({ pair }: { pair: LetterPair }) {
  const t = en.lesson.compare;
  if (pair.typed === undefined) return <td className="min-w-9 px-1 py-1 text-quiet"><span aria-hidden>–</span><span className="sr-only">{t.nothing}</span></td>;
  if (pair.match) return <td className="min-w-9 px-1 py-1 t-subheading casual">{pair.typed}</td>;
  // The cross is the mark, not a colour: the difference reads the same to anyone.
  return <td className="min-w-9 px-1 py-1 t-subheading casual font-[700]"><span aria-hidden className="mr-0.5 t-meta">✗</span>{pair.typed}<span className="sr-only"> ({t.wrongMark})</span></td>;
}

function RightCell({ pair }: { pair: LetterPair }) {
  const t = en.lesson.compare;
  if (pair.right === undefined) return <td className="min-w-9 px-1 py-1 text-quiet"><span aria-hidden>–</span><span className="sr-only">{t.noTarget}</span></td>;
  return <td className={`min-w-9 px-1 py-1 t-subheading casual ${pair.match ? "" : "font-[700] underline decoration-2 underline-offset-4"}`}>{pair.right}</td>;
}

/**
 * A typed memo set against the right one, target by target: what you typed on one row, what was right
 * on the next, a cross on every letter that differs. Long sets wrap onto further tables so it stays
 * readable without scrolling sideways on a phone.
 */
export function LetterComparison({ comparison }: { comparison: Comparison }) {
  const t = en.lesson.compare;
  const tables: LetterPair[][] = [];
  for (let start = 0; start < comparison.pairs.length; start += PER_TABLE) tables.push(comparison.pairs.slice(start, start + PER_TABLE));
  return (
    <div className="flex flex-col gap-3">
      {tables.map((row) => {
        const first = row[0]?.position ?? 1;
        const last = row[row.length - 1]?.position ?? first;
        return (
          <div key={first} className="max-w-full overflow-x-auto">
            <table className="w-fit border-collapse text-center" aria-label={`${t.caption} (${t.targets(first, last)})`}>
              <thead>
                <tr>
                  <th scope="col" className="pr-3 text-left t-meta font-normal text-quiet">{t.target}</th>
                  {row.map((pair) => <th key={pair.position} scope="col" className="min-w-9 px-1 t-meta font-normal text-quiet">{pair.position}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="pr-3 text-left t-meta font-normal">{t.youTyped}</th>
                  {row.map((pair) => <TypedCell key={pair.position} pair={pair} />)}
                </tr>
                <tr>
                  <th scope="row" className="pr-3 text-left t-meta font-normal">{t.rightAnswer}</th>
                  {row.map((pair) => <RightCell key={pair.position} pair={pair} />)}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
