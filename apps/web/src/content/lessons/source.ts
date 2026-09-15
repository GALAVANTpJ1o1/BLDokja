import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Voice } from "@bld/storage";
import { parse as parseYaml } from "yaml";
import { LessonFrontmatterSchema, VoiceFrontmatterSchema, type LessonFrontmatter } from "./schema";

/**
 * Reads lessons from /content/lessons at build time (server only). Frontmatter is Zod-validated
 * where it crosses into the app; a bad lesson fails the build with the file and the field named.
 */
export const CONTENT_ROOT = join(process.cwd(), "..", "..", "content", "lessons");

export interface LessonSource {
  readonly track: string;
  readonly dir: string;
  readonly frontmatter: LessonFrontmatter;
  /** MDX body (frontmatter removed) per available voice; always has `plain`. */
  readonly bodies: Readonly<Partial<Record<Voice, string>>>;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(file: string, text: string): { data: unknown; body: string } {
  const match = FRONTMATTER.exec(text);
  if (match === null) throw new Error(`${file}: no frontmatter`);
  return { data: parseYaml(match[1] ?? ""), body: text.slice(match[0].length) };
}

function readVoice(dir: string, voice: Exclude<Voice, "plain">): string | undefined {
  const file = join(dir, `${voice}.mdx`);
  if (!existsSync(file)) return undefined;
  const { data, body } = splitFrontmatter(file, readFileSync(file, "utf8"));
  const parsed = VoiceFrontmatterSchema.safeParse(data);
  if (!parsed.success || parsed.data.voice !== voice) throw new Error(`${file}: frontmatter must be exactly "voice: ${voice}"`);
  return body;
}

export function loadLessons(root: string = CONTENT_ROOT): LessonSource[] {
  const lessons: LessonSource[] = [];
  if (!existsSync(root)) return lessons;
  for (const track of readdirSync(root).sort()) {
    const trackDir = join(root, track);
    for (const name of readdirSync(trackDir).sort()) {
      const dir = join(trackDir, name);
      const lessonFile = join(dir, "lesson.mdx");
      if (!existsSync(lessonFile)) continue;
      const { data, body } = splitFrontmatter(lessonFile, readFileSync(lessonFile, "utf8"));
      const parsed = LessonFrontmatterSchema.safeParse(data);
      if (!parsed.success) throw new Error(`${lessonFile}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      const bodies: Partial<Record<Voice, string>> = { plain: body };
      for (const voice of ["tsundere", "casual", "roast"] as const) {
        const text = readVoice(dir, voice);
        if (text !== undefined) bodies[voice] = text;
      }
      lessons.push({ track, dir, frontmatter: parsed.data, bodies });
    }
  }
  return lessons.sort((a, b) => a.frontmatter.track.localeCompare(b.frontmatter.track) || a.frontmatter.order - b.frontmatter.order);
}

export function findLesson(id: string, root?: string): LessonSource | undefined {
  return loadLessons(root).find((l) => l.frontmatter.id === id);
}
