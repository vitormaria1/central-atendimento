import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type RenderContext = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  y: number;
  pageNumber: number;
};

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4
const MARGIN_X = 52;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 52;
const FOOTER_SPACE = 28;

function normalizeText(text: string) {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/\t/g, "    ");
}

function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isBulletLine(line: string) {
  return /^[-•*]\s+/.test(line.trim());
}

function isNumberedLine(line: string) {
  return /^\d+[.)]\s+/.test(line.trim());
}

function isHeadingLine(line: string) {
  return /^\s*#{1,3}\s+/.test(line);
}

function headingLevel(line: string) {
  const match = line.match(/^\s*(#{1,3})\s+/);
  return match?.[1]?.length ?? 0;
}

function headingText(line: string) {
  return stripInlineMarkdown(line.replace(/^\s*#{1,3}\s+/, ""));
}

function cleanParagraphText(text: string) {
  return stripInlineMarkdown(text.replace(/\s+/g, " "));
}

function splitWords(text: string) {
  return cleanParagraphText(text).split(/\s+/).filter(Boolean);
}

function createPage(ctx: RenderContext) {
  ctx.page = ctx.pdfDoc.addPage(PAGE_SIZE);
  ctx.y = ctx.page.getHeight() - MARGIN_TOP;
  ctx.pageNumber += 1;
}

function drawFooter(ctx: RenderContext, font: PDFFont) {
  const label = `Página ${ctx.pageNumber}`;
  const width = font.widthOfTextAtSize(label, 8);
  ctx.page.drawText(label, {
    x: (ctx.page.getWidth() - width) / 2,
    y: MARGIN_BOTTOM - 6,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function ensureSpace(ctx: RenderContext, neededHeight: number, footerFont: PDFFont) {
  if (ctx.y - neededHeight >= MARGIN_BOTTOM + FOOTER_SPACE) return;
  drawFooter(ctx, footerFont);
  createPage(ctx);
}

function drawWrappedLine(ctx: RenderContext, font: PDFFont, size: number, text: string, indent = 0, hangingIndent = 0) {
  const maxWidth = ctx.page.getWidth() - MARGIN_X * 2 - indent - hangingIndent;
  const words = splitWords(text);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push("");

  for (let i = 0; i < lines.length; i += 1) {
    ensureSpace(ctx, size * 1.5, font);
    const line = lines[i] ?? "";
    const x = MARGIN_X + indent + (i === 0 ? 0 : hangingIndent);
    ctx.page.drawText(line, {
      x,
      y: ctx.y,
      size,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
    ctx.y -= size * 1.45;
  }
}

function renderBlock(ctx: RenderContext, block: string, fonts: { regular: PDFFont; bold: PDFFont; footer: PDFFont }) {
  const trimmed = block.trim();
  if (!trimmed) return;

  if (isHeadingLine(trimmed)) {
    const level = headingLevel(trimmed);
    const text = headingText(trimmed);
    const style =
      level === 1
        ? { font: fonts.bold, size: 20, align: "center" as const, extraBefore: 12, extraAfter: 10 }
        : level === 2
          ? { font: fonts.bold, size: 14, extraBefore: 10, extraAfter: 6 }
          : { font: fonts.bold, size: 12, extraBefore: 8, extraAfter: 4 };
    if (style.extraBefore) ctx.y -= style.extraBefore;
    if (ctx.y < MARGIN_BOTTOM + FOOTER_SPACE + style.size * 2) {
      drawFooter(ctx, fonts.footer);
      createPage(ctx);
    }
    if (style.align === "center") {
      const width = style.font.widthOfTextAtSize(text, style.size);
      const x = (ctx.page.getWidth() - width) / 2;
      ctx.page.drawText(text, { x, y: ctx.y, size: style.size, font: style.font, color: rgb(0.08, 0.08, 0.08) });
      ctx.y -= style.size * 1.55;
    } else {
      drawWrappedLine(ctx, style.font, style.size, text);
    }
    if (style.extraAfter) ctx.y -= style.extraAfter;
    return;
  }

  if (isBulletLine(trimmed)) {
    const text = cleanParagraphText(trimmed.replace(/^[-•*]\s+/, ""));
    ensureSpace(ctx, 24, fonts.footer);
    drawWrappedLine(ctx, fonts.regular, 11, `• ${text}`, 10, 12);
    ctx.y -= 2;
    return;
  }

  if (isNumberedLine(trimmed)) {
    const text = cleanParagraphText(trimmed);
    ensureSpace(ctx, 24, fonts.footer);
    drawWrappedLine(ctx, fonts.regular, 11, text, 0, 0);
    ctx.y -= 2;
    return;
  }

  if (/^__/i.test(trimmed) || /^\*\*.*\*\*$/i.test(trimmed)) {
    const text = stripInlineMarkdown(trimmed);
    ensureSpace(ctx, 20, fonts.footer);
    drawWrappedLine(ctx, fonts.bold, 11.5, text);
    return;
  }

  ensureSpace(ctx, 24, fonts.footer);
  drawWrappedLine(ctx, fonts.regular, 11, trimmed);
  ctx.y -= 3;
}

export async function renderMarkdownPdfBase64(markdown: string) {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    footer: await pdfDoc.embedFont(StandardFonts.Helvetica),
  };

  const ctx: RenderContext = {
    pdfDoc,
    page: pdfDoc.addPage(PAGE_SIZE),
    y: PAGE_SIZE[1] - MARGIN_TOP,
    pageNumber: 1,
  };

  const blocks = normalizeText(markdown).split(/\n{2,}/);

  for (const block of blocks) {
    renderBlock(ctx, block, fonts);
  }

  drawFooter(ctx, fonts.footer);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString("base64");
}
