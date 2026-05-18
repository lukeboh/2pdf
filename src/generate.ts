import fs from "fs/promises";
import path from "path";
import MarkdownIt from "markdown-it";
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
  typographer: true
});

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\\/g, "-")
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
    const htmlContent = md.render(content);

    sections.push(
      `<section class=\"doc-section\">` +
        `<h1 id=\"${anchor}\">${title}</h1>` +
        `<div class=\"doc-content\">${htmlContent}</div>` +
      `</section>`
    );
  }

  return sections.join("\n");
};

const buildHtml = async (
  rootName: string,
  tocHtml: string,
  sectionsHtml: string
) => {
  return `<!doctype html>
<html lang=\"pt-BR\">
<head>
<meta charset=\"utf-8\" />
<title>${rootName}</title>
<style>
  @page { margin: 24mm 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; }
  .cover { display: flex; align-items: center; justify-content: center; height: 80vh; }
  .cover h1 { font-size: 48px; }
  .page-break { page-break-after: always; }
  .toc h1 { font-size: 32px; margin-bottom: 12px; }
  .toc-list { list-style: none; padding-left: 12px; }
  .toc-dir > span { font-weight: bold; display: block; margin-top: 8px; }
  .toc-file a { text-decoration: none; color: #111; }
  .doc-section { page-break-before: always; }
  .doc-section h1 { font-size: 28px; margin-bottom: 8px; }
  .doc-content h2 { margin-top: 20px; }
  .doc-content pre { background: #f5f5f5; padding: 12px; overflow: auto; }
  .doc-content code { font-family: "Courier New", monospace; }
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

export const generatePdfFromMarkdownDir = async (
  rootDir: string,
  outputPath: string,
  logger: Logger
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
  const html = await buildHtml(rootName, tocHtml, sectionsHtml);

  const browser = await puppeteer.launch({
    headless: true,
    timeout: 0,
    protocolTimeout: 0
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setContent(html, { waitUntil: "load", timeout: 0 });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true
  });
  await browser.close();

  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  logger.info(`Tempo total: ${durationSeconds}s`);
};
