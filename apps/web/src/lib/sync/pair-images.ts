import type { LetterPair } from "@bld/storage";

const BUCKET = "letter-pair-images";

/** The slice of Supabase Storage this module calls -- narrower than the real client, for testability (see events.ts's EventsSyncClient for the same reasoning). */
export interface PairImagesStorageClient {
  storage: {
    from(bucket: "letter-pair-images"): {
      upload(path: string, body: Uint8Array<ArrayBuffer>, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: { message: string } | null }>;
      download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
}

interface RemoteImageRef {
  readonly assetStoragePath: string;
  readonly assetMime: string;
}

function isRemoteImageRef(value: unknown): value is RemoteImageRef {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { assetStoragePath?: unknown; assetMime?: unknown };
  return typeof v.assetStoragePath === "string" && typeof v.assetMime === "string";
}

function dataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array<ArrayBuffer> } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (match === null) throw new Error("not a supported image data URL");
  const mime = match[1];
  const base64 = match[2];
  if (mime === undefined || base64 === undefined) throw new Error("not a supported image data URL");
  const binary = atob(base64);
  // Uint8Array's own constructor overloads infer the general ArrayBufferLike-parameterized type;
  // allocating the backing buffer explicitly keeps this a plain Uint8Array<ArrayBuffer>, which is
  // what both the upload() interface below and Blob's constructor actually require.
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes };
}

function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Uploads any inline base64 images in a pair to the private letter-pair-images bucket, returning a
 * version of the pair's data suitable for the sync_letter_pairs.data column: each image's `asset`
 * is replaced by a small {assetStoragePath, assetMime} reference instead of carrying a
 * multi-megabyte base64 string in every row (D-056's "don't send the whole account after every
 * answer" reasoning). Images without an asset are untouched. Upload uses `upsert: true`, so
 * re-pushing a pair whose image didn't actually change is a safe no-op, not a duplicate object.
 *
 * Only ever called for a pair this device is actually about to push (reconcileLetterPairs decides
 * that); it does not decide anything about sync itself.
 */
export async function uploadPairImages(pair: LetterPair, accountId: string, client: PairImagesStorageClient): Promise<unknown> {
  const images = await Promise.all(
    pair.images.map(async (image) => {
      if (image.asset === undefined) return image;
      const { mime, bytes } = dataUrlToBytes(image.asset);
      const ext = mime.split("/")[1] ?? "bin";
      const path = `${accountId}/${pair.id}/${image.id}.${ext}`;
      const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
      // Upload failed: keep the inline asset so the push still carries the data (the row is just
      // bigger this once) rather than silently losing the image because Storage had a bad moment.
      if (error) return image;
      const { asset: _asset, ...rest } = image;
      return { ...rest, assetStoragePath: path, assetMime: mime };
    }),
  );
  return { ...pair, images };
}

/**
 * The inverse: given raw remote `data` (unknown -- not yet schema-validated), downloads any
 * referenced images and reconstructs the inline base64 `asset` field, so the result validates
 * against LetterPairSchema exactly as a local record would. If a download fails, the reference is
 * left as-is; LetterPairSchema's own validation then rejects the record (asset must be a real data
 * URL, not a {assetStoragePath} shape) and the caller's existing "skip what doesn't parse" handling
 * takes over -- this pair just doesn't sync this cycle rather than being silently corrupted with a
 * placeholder.
 */
export async function downloadPairImages(data: unknown, client: PairImagesStorageClient): Promise<unknown> {
  if (typeof data !== "object" || data === null) return data;
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.images)) return data;

  const images = await Promise.all(
    record.images.map(async (image: unknown) => {
      if (!isRemoteImageRef(image)) return image;
      const { data: blob, error } = await client.storage.from(BUCKET).download(image.assetStoragePath);
      if (error || blob === null) return image;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { assetStoragePath: _path, assetMime: _mime, ...rest } = image as unknown as Record<string, unknown>;
      return { ...rest, asset: bytesToDataUrl(image.assetMime, bytes) };
    }),
  );
  return { ...record, images };
}
