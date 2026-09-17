"use client";

import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react";
import { graphemes, type LetterPair, type MemoryPalace, type MemoStory } from "@bld/storage";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { workspaces as copy } from "@/i18n/workspaces";
import { getStorage, newId, nowIso } from "@/lib/storage-client";
import { composeScenes, readRaster, reorder } from "@/trainers/memory-workspace";

const newPalace = (): MemoryPalace => ({ id: newId(), name: "", locations: [] });
const newStory = (): MemoStory => ({ id: newId(), title: "", scenes: [] });
export function MemoryWorkspace() {
  const { stored, update } = useSettings();
  const [palace, setPalace] = useState<MemoryPalace>(newPalace);
  const [story, setStory] = useState<MemoStory>(newStory);
  const [pairs, setPairs] = useState<LetterPair[]>();
  const [pairId, setPairId] = useState("");
  const [pairError, setPairError] = useState<string>();
  const [word, setWord] = useState("");
  const [asset, setAsset] = useState<string>();
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dragging = useRef<number | undefined>(undefined);
  const fileField = useRef<HTMLInputElement>(null);
  const pairField = useRef<HTMLInputElement>(null);
  const memoField = useRef<HTMLInputElement>(null);
  const [memoError, setMemoError] = useState<string>();
  const imageRequest = useRef(0);
  const [readingImage, setReadingImage] = useState(false);
  const [removePalaceOpen, setRemovePalaceOpen] = useState(false);
  useEffect(() => { void getStorage().letterPairs().then(setPairs).catch(() => { setMessage(copy.common.error); }); }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); setMessage(copy.common.saved); } catch { setMessage(copy.common.error); } finally { setBusy(false); }
  };
  const selectPair = (id: string) => {
    imageRequest.current += 1;
    setReadingImage(false);
    setPairError(undefined);
    setPairId(id);
    const image = pairs?.find((pair) => pair.id === id)?.images.find((item) => !item.flags?.includes("placeholder"));
    setWord(image?.text ?? ""); setAsset(image?.asset);
    if (fileField.current !== null) fileField.current.value = "";
  };
  const savePair = (event: SyntheticEvent) => {
    event.preventDefault();
    const id = pairId.trim().normalize("NFC").toLocaleUpperCase("en-GB");
    const [first, second, extra] = graphemes(id);
    if (first === undefined || second === undefined || extra !== undefined || word.trim() === "") { setPairError(copy.memory.invalidPair); pairField.current?.focus(); return; }
    setPairError(undefined);
    void perform(async () => {
      const at = nowIso();
      await getStorage().transaction(async (tx) => {
        const existing = await tx.letterPair(id);
        const main = existing?.images.find((item) => !item.flags?.includes("placeholder"));
        const image = { ...(main ?? { id: newId(), uses: 0 }), text: word.trim(), asset };
        const next: LetterPair = { ...(existing ?? { id, first, second, createdAt: at }), updatedAt: at, images: [image, ...(existing?.images ?? []).filter((item) => item.id !== main?.id)] };
        await tx.putLetterPair(next);
      });
      setPairs(await getStorage().letterPairs());
    });
  };
  const moveScene = (from: number, to: number) => { setStory((current) => ({ ...current, scenes: reorder(current.scenes, from, to) })); };
  const locations = (stored?.memoryPalaces ?? []).find((item) => item.id === story.palaceId)?.locations ?? (story.palaceId === palace.id ? palace.locations : []);
  if (pairs === undefined) return <p role={message ? "alert" : "status"}>{message || copy.common.loading}</p>;
  return <div className="memory-workbench">
    <p className="t-meta text-quiet">{copy.common.local}</p>
    <section className="flex flex-col gap-4" aria-label={copy.memory.palace}>
      <div className="control-row"><h2 className="t-heading">{copy.memory.palace}</h2><button className="btn ml-auto" type="button" onClick={() => { setPalace(newPalace()); }}>{copy.memory.newPalace}</button></div>
      {(stored?.memoryPalaces?.length ?? 0) > 0 ? <label className="t-ui flex flex-col gap-2">{copy.memory.palace}<select className="field" value={stored?.memoryPalaces?.some((item) => item.id === palace.id) ? palace.id : ""} onChange={(event) => { const saved = stored?.memoryPalaces?.find((item) => item.id === event.target.value); if (saved !== undefined) setPalace(saved); }}><option value="">{copy.memory.newPalace}</option>{stored?.memoryPalaces?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void perform(() => update({ memoryPalaces: [...(stored?.memoryPalaces ?? []).filter((item) => item.id !== palace.id), palace] })); }}>
        <label className="t-ui flex flex-col gap-2">{copy.memory.name}<input className="field" required maxLength={100} value={palace.name} onChange={(event) => { setPalace({ ...palace, name: event.target.value }); }} /></label>
        <ol className="flex flex-col gap-4">{palace.locations.map((location, index) => <li className="grid gap-3 md:grid-cols-[1fr_2fr_auto] border-b border-rule pb-4" key={location.id}>
          <label className="t-ui flex flex-col gap-2">{copy.memory.locationName}<input className="field" required maxLength={100} value={location.name} onChange={(event) => { setPalace({ ...palace, locations: palace.locations.map((item) => item.id === location.id ? { ...item, name: event.target.value } : item) }); }} /></label>
          <label className="t-ui flex flex-col gap-2">{copy.memory.prompt}<textarea id={`palace-location-${location.id}-prompt`} name="location-prompt" className="field resize-none" rows={2} maxLength={1000} value={location.prompt} onChange={(event) => { setPalace({ ...palace, locations: palace.locations.map((item) => item.id === location.id ? { ...item, prompt: event.target.value } : item) }); }} /></label>
          <div className="control-row self-end"><button className="btn" type="button" disabled={index === 0} aria-label={copy.memory.up} onClick={() => { setPalace({ ...palace, locations: reorder(palace.locations, index, index - 1) }); }}><ArrowUpIcon size={18} aria-hidden /></button><button className="btn" type="button" onClick={() => { setPalace({ ...palace, locations: palace.locations.filter((item) => item.id !== location.id) }); }}>{copy.common.remove}</button></div>
        </li>)}</ol>
        <p className="t-meta text-quiet">{copy.memory.localPrompt}</p>
        <div className="control-row"><button className="btn" type="button" disabled={palace.locations.length >= 100} onClick={() => { setPalace({ ...palace, locations: [...palace.locations, { id: newId(), name: "", prompt: "" }] }); }}>{copy.memory.addLocation}</button><button className="btn btn-strong" type="submit" disabled={busy}>{copy.memory.savePalace}</button>{stored?.memoryPalaces?.some((item) => item.id === palace.id) ? <button className="btn" type="button" onClick={() => { setRemovePalaceOpen(true); }}>{copy.memory.removePalace}</button> : null}</div>
      </form>
    </section>
    <section className="flex flex-col gap-4 border-t border-rule pt-6" aria-label={copy.memory.pairs}><h2 className="t-heading">{copy.memory.pairs}</h2>
      <form onSubmit={savePair} className="grid gap-4 md:grid-cols-2">
        <label className="t-ui flex flex-col gap-2">{copy.memory.pair}<input ref={pairField} aria-invalid={pairError !== undefined || undefined} aria-describedby={pairError === undefined ? undefined : "memory-pair-error"} className="field mono" list="saved-pair-ids" value={pairId} onChange={(event) => { selectPair(event.target.value.normalize("NFC").toLocaleUpperCase("en-GB")); }} required maxLength={20} /><datalist id="saved-pair-ids">{pairs.map((pair) => <option key={pair.id} value={pair.id} />)}</datalist></label>
        <label className="t-ui flex flex-col gap-2">{copy.memory.word}<input className="field" required maxLength={1000} value={word} onChange={(event) => { setPairError(undefined); setWord(event.target.value); }} /></label>
        <label className="t-ui flex flex-col gap-2 md:col-span-2">{copy.memory.image}<input ref={fileField} type="file" accept="image/png,image/jpeg,image/webp" className="field" onChange={(event) => {
          const file = event.target.files?.[0];
          const request = ++imageRequest.current;
          if (file === undefined) { setReadingImage(false); return; }
          setReadingImage(true);
          void readRaster(file).then((data) => {
            if (request !== imageRequest.current) return;
            if (data === undefined) setMessage(copy.memory.invalidImage);
            else { setAsset(data); setMessage(""); }
          }).catch(() => { if (request === imageRequest.current) setMessage(copy.memory.fileRead); }).finally(() => { if (request === imageRequest.current) setReadingImage(false); });
        }} /><span className="t-meta text-quiet">{copy.memory.imageHint}</span></label>
        {asset === undefined ? null : <div className="control-row"><img src={asset} alt={word || copy.memory.custom} className="h-28 w-28 object-contain rounded-xl" /><button className="btn" type="button" onClick={() => { imageRequest.current += 1; setReadingImage(false); setAsset(undefined); if (fileField.current !== null) fileField.current.value = ""; }}>{copy.memory.removeImage}</button></div>}
        {pairError === undefined ? null : <p id="memory-pair-error" className="status-line md:col-span-2" role="alert">{pairError}</p>}
        <button className="btn btn-strong justify-self-start self-end" type="submit" disabled={busy || readingImage}>{copy.memory.savePair}</button>
      </form>
    </section>
    <section className="flex flex-col gap-4 border-t border-rule pt-6" aria-label={copy.memory.story}><h2 className="t-heading">{copy.memory.story}</h2>
      <div className="grid gap-4 md:grid-cols-2"><label className="t-ui flex flex-col gap-2">{copy.memory.titleField}<input className="field" maxLength={100} value={story.title} onChange={(event) => { setStory({ ...story, title: event.target.value }); }} /></label>
        <label className="t-ui flex flex-col gap-2">{copy.memory.palace}<select className="field" value={story.palaceId ?? ""} onChange={(event) => { setStory({ ...story, palaceId: event.target.value || undefined }); }}><option value="">{copy.memory.noLocation}</option>{stored?.memoryPalaces?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <form noValidate className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); const result = composeScenes(memo, pairs, newId); if (result.missing.length > 0) { setMemoError(copy.memory.missing(result.missing)); memoField.current?.focus(); } else { setMemoError(undefined); setStory({ ...story, scenes: result.scenes.map((scene, index) => ({ ...scene, locationId: locations[index]?.id })) }); } }}><label className="t-ui flex flex-col gap-2">{copy.memory.input}<input ref={memoField} aria-invalid={memoError !== undefined || undefined} aria-describedby={memoError === undefined ? undefined : "memory-memo-error"} className="field mono" maxLength={5000} value={memo} onChange={(event) => { setMemoError(undefined); setMemo(event.target.value); }} /></label>{memoError === undefined ? null : <p id="memory-memo-error" className="status-line" role="alert">{memoError}</p>}<button className="btn self-start" type="submit">{copy.memory.compose}</button></form>
      <p className="t-meta text-quiet">{copy.memory.drag}</p><p className="t-meta text-quiet">{copy.memory.storyWarning}</p>
      <ol className="story-sequence">{story.scenes.map((scene, index) => {
        const image = pairs.find((pair) => pair.id === scene.pairId)?.images.find((item) => item.id === scene.imageId);
        return <li className="story-scene" key={scene.id} draggable onDragStart={() => { dragging.current = index; }} onDragEnd={() => { dragging.current = undefined; }} onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (dragging.current !== undefined) moveScene(dragging.current, index); dragging.current = undefined; }}>
          <div className="control-row"><h3 className="t-ui">{copy.memory.scene(index + 1)} · <span className="mono">{scene.pairId}</span></h3><div className="control-row ml-auto"><button className="btn" type="button" aria-label={copy.memory.up} disabled={index === 0} onClick={() => { moveScene(index, index - 1); }}><ArrowUpIcon size={18} aria-hidden /></button><button className="btn" type="button" aria-label={copy.memory.down} disabled={index === story.scenes.length - 1} onClick={() => { moveScene(index, index + 1); }}><ArrowDownIcon size={18} aria-hidden /></button><button className="btn" type="button" onClick={() => { setStory({ ...story, scenes: story.scenes.filter((item) => item.id !== scene.id) }); }}>{copy.common.remove}</button></div></div>
          {image?.asset === undefined ? null : <img src={image.asset} alt={image.text} className="max-h-40 max-w-full object-contain rounded-xl" />}
          <label className="t-ui flex flex-col gap-2">{copy.memory.word}<textarea id={`story-scene-${scene.id}-text`} name="scene-text" className="field resize-none" rows={2} maxLength={1000} value={scene.text} onChange={(event) => { setStory({ ...story, scenes: story.scenes.map((item) => item.id === scene.id ? { ...item, text: event.target.value } : item) }); }} /></label>
          <label className="t-ui flex flex-col gap-2">{copy.memory.location}<select className="field" value={scene.locationId ?? ""} onChange={(event) => { setStory({ ...story, scenes: story.scenes.map((item) => item.id === scene.id ? { ...item, locationId: event.target.value || undefined } : item) }); }}><option value="">{copy.memory.noLocation}</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <p className="t-meta text-quiet">{locations.find((location) => location.id === scene.locationId)?.prompt}</p>
        </li>;
      })}</ol>
      <button className="btn btn-strong self-start" type="button" disabled={busy || story.title.trim() === "" || story.scenes.length === 0} onClick={() => { void perform(() => update({ memoStories: [...(stored?.memoStories ?? []).filter((item) => item.id !== story.id), story] })); }}>{copy.memory.saveStory}</button>
      <details className="quiet-disclosure"><summary>{copy.memory.savedStories}</summary><div className="flex flex-col gap-3 mt-3">{stored?.memoStories?.map((item) => <div key={item.id} className="control-row"><button className="text-link" type="button" onClick={() => { setStory(item); setMemo(item.scenes.map((scene) => scene.pairId).join(" ")); }}>{item.title}</button><button className="btn ml-auto" type="button" onClick={() => { void perform(() => update({ memoStories: stored.memoStories?.filter((saved) => saved.id !== item.id) })); }}>{copy.common.remove}</button></div>)}</div></details>
    </section>
    {message ? <p role="status" className="status-line">{message}</p> : null}
    <TransmissionWindow open={removePalaceOpen} title={copy.memory.removePalace} onClose={() => { setRemovePalaceOpen(false); }} actions={<><button className="btn" type="button" onClick={() => { setRemovePalaceOpen(false); }}>{copy.common.cancel}</button><button className="btn btn-strong" type="button" onClick={() => { setRemovePalaceOpen(false); void perform(async () => { await update({ memoryPalaces: stored?.memoryPalaces?.filter((item) => item.id !== palace.id) }); setPalace(newPalace()); }); }}>{copy.memory.removePalace}</button></>}><p>{copy.memory.confirmRemove}</p></TransmissionWindow>
  </div>;
}
