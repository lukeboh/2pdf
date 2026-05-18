#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import fs from "fs";
import pino from "pino";
import { generatePdfFromMarkdownDir } from "./generate";

const program = new Command();

program
  .name("md-dir-to-pdf")
  .description("Gera um PDF a partir de arquivos Markdown em um diretório.")
  .requiredOption("-i, --in <dir>", "Diretório base para buscar arquivos .md")
  .option("-o, --out <file>", "Caminho do PDF de saída")
  .option(
    "--orientation <portrait|landscape>",
    "Orientação do PDF",
    "portrait"
  )
  .option(
    "--margins <narrow|normal|wide>",
    "Margens do PDF",
    "normal"
  )
  .option("-v, --verbose", "Habilita logs em nível DEBUG")
  .helpOption("-h, --help", "Sintaxe da linha de comando")
  .parse(process.argv);

const options = program.opts<{
  in: string;
  out?: string;
  verbose?: boolean;
  orientation: "portrait" | "landscape";
  margins: "narrow" | "normal" | "wide";
}>();

const logger = pino({
  level: options.verbose ? "debug" : "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

const absoluteDir = path.resolve(process.cwd(), options.in);
if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
  logger.error(`Diretório inválido: ${absoluteDir}`);
  process.exit(1);
}

const baseName = path.basename(absoluteDir);
const outputPath = options.out
  ? path.resolve(process.cwd(), options.out)
  : path.resolve(process.cwd(), `${baseName}.pdf`);

logger.info(`Início do processo a partir da pasta ${baseName}`);

if (!options.orientation || !["portrait", "landscape"].includes(options.orientation)) {
  logger.error("Valor inválido para --orientation. Use portrait ou landscape.");
  process.exit(1);
}

if (!options.margins || !["narrow", "normal", "wide"].includes(options.margins)) {
  logger.error("Valor inválido para --margins. Use narrow, normal ou wide.");
  process.exit(1);
}

generatePdfFromMarkdownDir(
  absoluteDir,
  outputPath,
  logger,
  options.orientation,
  options.margins
)
  .then(() => {
    logger.info(`Fim do processo: ${outputPath}`);
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, "Erro ao gerar PDF");
    process.exit(1);
  });
