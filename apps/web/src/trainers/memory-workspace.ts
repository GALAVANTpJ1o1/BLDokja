import { graphemes, PairImageSchema, type LetterPair, type MemoStory } from "@bld/storage";

export function composeScenes(input: string, pairs: readonly LetterPair[], id: () => string): { scenes: MemoStory["scenes"]; missing: string[] } {
  const words = new Map(pairs.map((pair) => [pair.id, pair.images.find((image) => image.text.trim() !== "" && !image.flags?.includes("placeholder"))]));
  const pairIds = input.trim().normalize("NFC").toLocaleUpperCase("en-GB").split(/\s+/).filter(Boolean);
  const missing = pairIds.filter((pair) => graphemes(pair).length !== 2 || words.get(pair) === undefined);
  if (missing.length > 0 || pairIds.length > 200) return { scenes: [], missing: pairIds.length > 200 ? pairIds : missing };
  return { missing: [], scenes: pairIds.flatMap((pairId) => { const image = words.get(pairId); return image === undefined ? [] : [{ id: id(), pairId, imageId: image.id, text: image.text }]; }) };
}
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const result = [...items]; const [item] = result.splice(from, 1);
  if (item !== undefined) result.splice(to, 0, item);
  return result;
}
export async function readRaster(file: File): Promise<string | undefined> {
  if (file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return undefined;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  if (!(file.type === "image/png" && png || file.type === "image/jpeg" && jpeg || file.type === "image/webp" && webp)) return undefined;
  const asset = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => { reject(new Error("file-read")); }; reader.onload = () => { if (typeof reader.result === "string") resolve(reader.result); else reject(new Error("file-read")); }; reader.readAsDataURL(file); });
  return PairImageSchema.shape.asset.safeParse(asset).success ? asset : undefined;
}
