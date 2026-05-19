import fs from "fs/promises";
import path from "path";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import plantumlEncoder from "plantuml-encoder";
import puppeteer from "puppeteer";
import { Logger } from "pino";

export type TreeNode = {
  name: string;
  relPath: string;
  type: "dir" | "file";
  children?: TreeNode[];
};

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (code, language) => {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  }
});

const fence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";

  if (info === "mermaid") {
    const content = token.content;
    return `<div class=\"mermaid\">${md.utils.escapeHtml(content)}</div>`;
  }

  if (info === "plantuml") {
    const content = token.content;
    const encoded = plantumlEncoder.encode(content);
    const src = `https://www.plantuml.com/plantuml/svg/${encoded}`;
    return `<img class=\"plantuml\" src=\"${src}\" alt=\"PlantUML\" />`;
  }

  return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const mimeByExtension: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp"
};

const isExternalLink = (src: string) =>
  /^(https?:|data:|file:|mailto:)/i.test(src);

const toDataUri = (content: Buffer, mime: string) => {
  const base64 = content.toString("base64");
  return `data:${mime};base64,${base64}`;
};

const embedImagesAsDataUri = async (tokens: MarkdownIt.Token[], filePath: string) => {
  for (const token of tokens) {
    if (token.type === "image") {
      const src = token.attrGet("src");
      if (!src || src.startsWith("#") || isExternalLink(src)) {
        continue;
      }

      const absoluteImagePath = path.resolve(path.dirname(filePath), src);
      const ext = path.extname(absoluteImagePath).toLowerCase();
      const mime = mimeByExtension[ext];

      if (!mime) {
        continue;
      }

      try {
        const content = await fs.readFile(absoluteImagePath);
        token.attrSet("src", toDataUri(content, mime));
      } catch {
        continue;
      }
    }

    if (token.children && token.children.length > 0) {
      await embedImagesAsDataUri(token.children, filePath);
    }
  }
};

const getHeadingText = (tokens: MarkdownIt.Token[], idx: number) => {
  const next = tokens[idx + 1];
  if (!next || next.type !== "inline" || !next.children) {
    return "";
  }
  return next.children
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join(" ")
    .trim();
};

const normalizeInternalLinks = (
  tokens: MarkdownIt.Token[],
  rootDir: string,
  currentFilePath: string
) => {
  const currentRel = path.relative(rootDir, currentFilePath);
  const currentPrefix = slugify(currentRel);

  for (const token of tokens) {
    if (token.type === "link_open") {
      const href = token.attrGet("href");
      if (href) {
        if (href.startsWith("#")) {
          const target = href.slice(1);
          const normalized = slugify(target);
          token.attrSet("href", `#${currentPrefix}-${normalized}`);
        } else if (!isExternalLink(href)) {
          const [linkPath, hash] = href.split("#");
          const resolvedPath = path.resolve(path.dirname(currentFilePath), linkPath);
          const rel = path.relative(rootDir, resolvedPath);
          const prefix = slugify(rel);
          if (hash) {
            token.attrSet("href", `#${prefix}-${slugify(hash)}`);
          } else {
            token.attrSet("href", `#${prefix}`);
          }
        }
      }
    }

    if (token.children && token.children.length > 0) {
      normalizeInternalLinks(token.children, rootDir, currentFilePath);
    }
  }
};

const renderMarkdownWithImages = async (
  content: string,
  filePath: string,
  rootDir: string
) => {
  const env = { filePath };
  const tokens = md.parse(content, env);
  const relPath = path.relative(rootDir, filePath);
  const prefix = slugify(relPath);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const text = getHeadingText(tokens, i);
      if (text) {
        token.attrSet("id", `${prefix}-${slugify(text)}`);
      }
    }
  }

  normalizeInternalLinks(tokens, rootDir, filePath);
  await embedImagesAsDataUri(tokens, filePath);
  return md.renderer.render(tokens, md.options, env);
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\\/]/g, "-")
    .replace(/[^a-z0-9\u00C0-\u024F-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const sortByName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt-BR");

const isMarkdown = (fileName: string) => fileName.toLowerCase().endsWith(".md");

const buildTree = async (
  rootDir: string,
  currentDir: string
): Promise<{ node: TreeNode; files: TreeNode[] }> => {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  const fileEntries = entries
    .filter((entry) => entry.isFile() && isMarkdown(entry.name))
    .sort(sortByName);

  const dirEntries = entries
    .filter((entry) => entry.isDirectory())
    .sort(sortByName);

  const node: TreeNode = {
    name: path.basename(currentDir),
    relPath: path.relative(rootDir, currentDir),
    type: "dir",
    children: []
  };

  const files: TreeNode[] = [];

  for (const entry of fileEntries) {
    const absoluteEntry = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, absoluteEntry);
    const fileNode: TreeNode = {
      name: entry.name,
      relPath,
      type: "file"
    };
    node.children?.push(fileNode);
    files.push(fileNode);
  }

  for (const entry of dirEntries) {
    const absoluteEntry = path.join(currentDir, entry.name);
    const result = await buildTree(rootDir, absoluteEntry);
    if (result.node.children && result.node.children.length > 0) {
      node.children?.push(result.node);
      files.push(...result.files);
    }
  }

  return { node, files };
};

const renderToc = (node: TreeNode): string => {
  if (!node.children || node.children.length === 0) {
    return "";
  }

  const items = node.children
    .map((child) => {
      if (child.type === "dir") {
        return `<li class=\"toc-dir\"><span>${child.name}</span>${renderToc(child)}</li>`;
      }

      const anchor = slugify(child.relPath);
      const label = child.name.replace(/\.md$/i, "");
      return `<li class=\"toc-file\"><a href=\"#${anchor}\">${label}</a></li>`;
    })
    .join("");

  return `<ul class=\"toc-list\">${items}</ul>`;
};

const buildSections = async (
  rootDir: string,
  files: TreeNode[],
  logger: Logger
) => {
  const sections: string[] = [];

  for (const file of files) {
    const absolutePath = path.join(rootDir, file.relPath);
    logger.debug(`Lendo arquivo: ${absolutePath}`);
    const content = await fs.readFile(absolutePath, "utf8");
    const title = file.name.replace(/\.md$/i, "");
    const anchor = slugify(file.relPath);
    const htmlContent = await renderMarkdownWithImages(content, absolutePath, rootDir);

    sections.push(
      `<section class=\"doc-section\" id=\"${anchor}\">` +
        `<a id=\"${anchor}\" name=\"${anchor}\"></a>` +
        `<h1>${title}</h1>` +
        `<div class=\"doc-content\">${htmlContent}</div>` +
      `</section>`
    );
  }

  return sections.join("\n");
};

const buildHtml = async (
  rootName: string,
  tocHtml: string,
  sectionsHtml: string,
  pageMargins: string
) => {
  return `<!doctype html>
<html lang=\"pt-BR\">
<head>
<meta charset=\"utf-8\" />
<title>${rootName}</title>
<style>
  @page { margin: ${pageMargins}; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; }
  .cover { display: flex; align-items: center; justify-content: center; height: 80vh; }
  .cover h1 { font-size: 48px; }
  .page-break { page-break-after: always; }
  .toc h1 { font-size: 32px; margin-bottom: 12px; }
  .toc-list { list-style: none; padding-left: 12px; }
  .toc-dir > span { font-weight: bold; display: block; margin-top: 8px; }
  .toc-file a { color: #0b57d0; text-decoration: underline; font-weight: 600; }
  .doc-section { page-break-before: always; }
  .doc-section h1 { font-size: 28px; margin-bottom: 8px; }
  .doc-content h2 { margin-top: 20px; }
  .doc-content table { border-collapse: collapse; width: 100%; }
  .doc-content th, .doc-content td { border: 1px solid #000; padding: 6px 8px; }
  .doc-content img { max-width: 100%; height: auto; }
  .doc-content img.plantuml { display: block; margin: 12px 0; }
  .doc-content pre { background: #f5f5f5; padding: 12px; overflow: auto; }
  .doc-content pre code { display: block; font-family: "Courier New", monospace; }
  .doc-content a { color: #0b57d0; text-decoration: underline; font-weight: 600; }
  .hljs { background: #f5f5f5; color: #111; }
  .mermaid { margin: 12px 0; }
</style>
</head>
<body>
  <section class=\"cover page-break\">
    <h1>${rootName}</h1>
  </section>

  <section class=\"toc page-break\">
    <h1>Sumário</h1>
    ${tocHtml}
  </section>

  ${sectionsHtml}
</body>
</html>`;
};

export type PdfOrientation = "portrait" | "landscape";
export type PdfMargins = "narrow" | "normal" | "wide";

const marginByPreset: Record<PdfMargins, string> = {
  narrow: "12mm 10mm",
  normal: "24mm 18mm",
  wide: "32mm 24mm"
};

export const generatePdfFromMarkdownDir = async (
  rootDir: string,
  outputPath: string,
  logger: Logger,
  orientation: PdfOrientation,
  margins: PdfMargins
) => {
  const startedAt = Date.now();
  const { node, files } = await buildTree(rootDir, rootDir);

  if (files.length === 0) {
    throw new Error("Nenhum arquivo .md encontrado no diretório informado.");
  }

  logger.info(`Total de arquivos .md encontrados: ${files.length}`);

  const rootName = path.basename(rootDir);
  const tocHtml = renderToc(node);
  const sectionsHtml = await buildSections(rootDir, files, logger);
  const pageMargins = marginByPreset[margins];
  const html = await buildHtml(rootName, tocHtml, sectionsHtml, pageMargins);
  const hasMermaid = html.includes("class=\"mermaid\"");

  const browser = await puppeteer.launch({
    headless: true,
    timeout: 0,
    protocolTimeout: 0
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setContent(html, { waitUntil: "load", timeout: 0 });

  if (hasMermaid) {
    await page.addScriptTag({ path: require.resolve("mermaid/dist/mermaid.min.js") });
    await page.evaluate(async () => {
      // @ts-ignore
      window.mermaid.initialize({ startOnLoad: false });
      // @ts-ignore
      await window.mermaid.run({ querySelector: ".mermaid" });
    });
  }

  await page.pdf({
    path: outputPath,
    format: "A4",
    landscape: orientation === "landscape",
    printBackground: true
  });
  await browser.close();

  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  logger.info(`Tempo total: ${durationSeconds}s`);
};
