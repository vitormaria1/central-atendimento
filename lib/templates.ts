import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type DocTemplate = { slug: string; name: string; filename: string };

const TEMPLATES_DIR = join(process.cwd(), "templates", "doc-modelos");

function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function listDocTemplates(): Promise<DocTemplate[]> {
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".docx")).map((e) => e.name);

  return files
    .map((filename) => {
      const base = filename.replace(/\.docx$/i, "");
      const name = base.replace(/\s+-\s+modelo$/i, "").trim();
      return { filename, name, slug: slugify(base) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function readDocTemplateBySlug(slug: string): Promise<{ template: DocTemplate; bytes: Buffer } | null> {
  const templates = await listDocTemplates();
  const t = templates.find((x) => x.slug === slug);
  if (!t) return null;
  const bytes = await readFile(join(TEMPLATES_DIR, t.filename));
  return { template: t, bytes: Buffer.from(bytes) };
}

