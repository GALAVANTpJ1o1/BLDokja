"use client";

import type { LetterPair } from "@bld/storage";
import { useMemo, useState } from "react";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { en } from "@/i18n/en";
import { newId, nowIso } from "@/lib/storage-client";
import { addImage, didYouMean, emptyPair, isPlaceholder, makeMain, removeImage, renameOrMerge, withDetails } from "@/trainers/pairs";
import { lettersOf, MasteryMark, pairStatus, type LibraryContext } from "./pair-ui";

/**
 * Edit one pair: its images (main first), notes and category. Changes are made to a draft and written
 * together on Save. Removing an image asks twice. "Did you mean" is offered from your own words and
 * never applied on its own (AUDIT §6).
 */
export function PairEditor({ ctx, id, onClose }: { ctx: LibraryContext; id: string; onClose: () => void }) {
  const original = ctx.byId.get(id);
  const [first, second] = lettersOf(id);
  const [draft, setDraft] = useState<LetterPair>(() => original ?? emptyPair(first, second, nowIso()));
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries((original?.images ?? []).map((i) => [i.id, i.text])));
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [category, setCategory] = useState(original?.category ?? "");
  const [adding, setAdding] = useState("");
  const [keptMine, setKeptMine] = useState<string | undefined>(undefined);
  const [confirmRemove, setConfirmRemove] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  // Your own words, this pair as saved included, so a typo of one of its alternates is caught too.
  const suggestion = useMemo(() => (adding.trim() === "" || keptMine === adding ? undefined : didYouMean(adding, ctx.pairs)), [adding, keptMine, ctx.pairs]);
  const status = pairStatus(ctx.schedules.get(id), ctx.now);
  const seen = ctx.seen.get(id) ?? 0;

  const add = () => {
    const result = addImage(draft, adding, newId(), nowIso());
    if (result.added) {
      setDraft(result.pair);
      const image = result.pair.images.find((i) => !draft.images.some((d) => d.id === i.id));
      if (image !== undefined) setTexts((t) => ({ ...t, [image.id]: image.text }));
    }
    setAdding("");
    setKeptMine(undefined);
  };

  const save = async () => {
    if (Object.values(texts).some((t) => t.trim() === "")) {
      setMessage(en.pairs.emptyWord);
      return;
    }
    const at = nowIso();
    let next = draft;
    for (const image of draft.images) {
      const text = texts[image.id];
      if (text !== undefined && text.trim() !== image.text) next = renameOrMerge(next, image.id, text, at);
    }
    if (notes.trim() !== (draft.notes ?? "") || category.trim() !== (draft.category ?? "")) next = withDetails(next, { notes, category }, at);
    if (original !== undefined && JSON.stringify(next) === JSON.stringify(original)) { onClose(); return; }
    if (original === undefined && next.images.length === 0 && next.notes === undefined && next.category === undefined) { onClose(); return; }
    if (await ctx.save([next])) onClose();
    else setMessage(en.pairs.saveFailed);
  };

  return (
    <TransmissionWindow
      open
      title={en.pairs.edit(id)}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>{en.pairs.cancel}</button>
          <button type="button" className="btn btn-strong" onClick={() => { void save(); }}>{en.pairs.save}</button>
        </>
      }
    >
      <p className="t-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-quiet">
        <span className="inline-flex items-center gap-1">
          <MasteryMark status={status} decorative />
          {en.pairs.mastery[status]}
        </span>
        <span>{en.pairs.seen(seen)}</span>
      </p>
      {first === second ? <p className="t-meta text-quiet">{en.pairs.diagonal}</p> : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="t-meta mb-1 text-quiet">{en.pairs.images}</legend>
        {draft.images.length === 0 ? <p className="t-meta text-quiet">{en.pairs.empty}</p> : null}
        <ul className="flex flex-col gap-2">
          {draft.images.map((image, index) => (
            <li key={image.id} className="flex flex-wrap items-center gap-2">
              <input
                className="field min-w-0 flex-1"
                value={texts[image.id] ?? image.text}
                aria-label={`${en.pairs.images} ${String(index + 1)}`}
                onChange={(e) => { setTexts((t) => ({ ...t, [image.id]: e.target.value })); }}
              />
              <span className="t-meta text-quiet">
                {en.pairs.uses(image.uses)}
                {isPlaceholder(image) ? ` · ${en.pairs.placeholderBadge}` : ""}
              </span>
              {index > 0 && !isPlaceholder(image) ? (
                <button type="button" className="btn min-h-10 px-2" onClick={() => { setDraft((d) => makeMain(d, image.id, nowIso())); }}>
                  {en.pairs.makeMain}
                </button>
              ) : null}
              <button
                type="button"
                className={`btn min-h-10 px-2 ${confirmRemove === image.id ? "btn-strong" : ""}`}
                onClick={() => {
                  if (confirmRemove !== image.id) { setConfirmRemove(image.id); return; }
                  setDraft((d) => removeImage(d, image.id, nowIso()));
                  setTexts(({ [image.id]: _removed, ...rest }) => rest);
                  setConfirmRemove(undefined);
                }}
              >
                {confirmRemove === image.id ? en.pairs.removeConfirm : en.pairs.remove}
              </button>
            </li>
          ))}
        </ul>
        <form
          noValidate
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="field min-w-0 flex-1" value={adding} placeholder={en.pairs.newImage} aria-label={en.pairs.addImage} onChange={(e) => { setAdding(e.target.value); }} />
          <button type="submit" className="btn min-h-10" disabled={adding.trim() === ""}>{en.pairs.addImage}</button>
        </form>
        {suggestion !== undefined ? (
          <div className="flex flex-wrap items-center gap-2" role="status">
            <span className="t-meta">{en.pairs.didYouMean(suggestion.suggestion, suggestion.usedBy.join(", "))}</span>
            <button type="button" className="btn min-h-10 px-2" onClick={() => { setAdding(suggestion.suggestion); setKeptMine(suggestion.suggestion); }}>{en.pairs.useSuggestion(suggestion.suggestion)}</button>
            <button type="button" className="btn min-h-10 px-2" onClick={() => { setKeptMine(adding); }}>{en.pairs.keepMine}</button>
          </div>
        ) : null}
      </fieldset>

      <label className="flex flex-col gap-1" htmlFor="pair-notes">
        <span className="t-meta text-quiet">{en.pairs.notes}</span>
        <textarea id="pair-notes" name="notes" className="field min-h-20 resize-none" value={notes} onChange={(e) => { setNotes(e.target.value); }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-meta text-quiet">{en.pairs.category}</span>
        <input className="field" value={category} onChange={(e) => { setCategory(e.target.value); }} />
      </label>
      {message !== undefined ? <p className="t-meta" role="alert">{message}</p> : null}
    </TransmissionWindow>
  );
}
