import type { PDFFont } from "pdf-lib";
import { graphemes } from "@bld/storage";

export interface ReferenceSection { heading: string; rows: string[][] }
export interface ReferenceDocument { title: string; subtitle: string; sections: ReferenceSection[]; note: string }
const fontSources = [
  new URL("../../node_modules/@fontsource/recursive/files/recursive-latin-400-normal.woff", import.meta.url),
  new URL("../../node_modules/@fontsource/recursive/files/recursive-latin-ext-400-normal.woff", import.meta.url),
  new URL("../../node_modules/@fontsource/recursive/files/recursive-cyrillic-ext-400-normal.woff", import.meta.url),
  new URL("../../node_modules/@fontsource/recursive/files/recursive-vietnamese-400-normal.woff", import.meta.url),
];

/** Font coverage is checked. Unsupported lettering must use the browser's Unicode-capable print view. */
export async function referencePdf(document: ReferenceDocument): Promise<Uint8Array<ArrayBuffer>> {
  const [{ PDFDocument, rgb }, fontkit] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit")]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit.default);
  pdf.setTitle(document.title); pdf.setProducer("BLDokja - local reference generator");
  const fonts = await Promise.all(fontSources.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("font-unavailable");
    return pdf.embedFont(await response.arrayBuffer(), { subset: true });
  }));
  const cover = fonts.map((font) => new Set(font.getCharacterSet()));
  const runs = (text: string): { text: string; font: PDFFont }[] => {
    const result: { text: string; font: PDFFont }[] = [];
    for (const grapheme of graphemes(text)) {
      const index = cover.findIndex((set) => Array.from(grapheme).every((char) => set.has(char.codePointAt(0) ?? -1)));
      const font = fonts[index];
      if (font === undefined) throw new Error("unsupported-lettering");
      const last = result.at(-1);
      if (last?.font === font) last.text += grapheme;
      else result.push({ text: grapheme, font });
    }
    return result;
  };
  const measure = (text: string, size: number) => runs(text).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const draw = (text: string, x: number, yy: number, size: number) => {
    for (const run of runs(text)) { page.drawText(run.text, { x, y: yy, size, font: run.font, color: rgb(0.14, 0.15, 0.23) }); x += run.font.widthOfTextAtSize(run.text, size); }
  };
  const newPage = () => { page = pdf.addPage([595.28,841.89]); y = 790; draw(document.title, 36, 814, 8); };
  const line = (text: string, size = 9.5) => {
    const paragraphs = Array.from(text).filter((char) => { const code = char.codePointAt(0) ?? 0; return code === 10 || code >= 32 && code !== 127; }).join("").split("\n");
    for (const paragraph of paragraphs) {
      let current = "";
      const flush = () => { if (y < 48) newPage(); draw(current,36,y,size); y -= size * 1.55; current = ""; };
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current === "" ? word : `${current} ${word}`;
        if (measure(candidate,size) <= 523) { current = candidate; continue; }
        if (current !== "") flush();
        for (const character of graphemes(word)) {
          if (measure(current + character,size) > 523) flush();
          current += character;
        }
      }
      flush();
    }
  };
  line(document.title,19); y -= 6; line(document.subtitle); y -= 14;
  for (const section of document.sections) {
    if (y < 105) newPage();
    line(section.heading,13); y -= 5;
    for (const row of section.rows) { line(row.join("  |  ")); y -= 3; }
    y -= 14;
  }
  line(document.note,8);
  const pages = pdf.getPages();
  pages.forEach((entry,index) => { const font = fonts[0]; if (font !== undefined) entry.drawText(`${index + 1} / ${pages.length}`, { x: 520, y: 25, size: 8, font }); });
  return new Uint8Array(await pdf.save());
}
