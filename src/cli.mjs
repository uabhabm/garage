#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { parseConsumptionUserSummaryXlsx } from "./parseReport.mjs";
import { rowsToCsv } from "./toCsv.mjs";

function usage() {
  return `Usage: xlsx-to-csv <input.xlsx> [output.csv]

  If output is omitted, writes <input-basename>.csv next to the Excel file.

  Environment:
    SHEET   Optional exact sheet name to read.
`;
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    process.stderr.write(usage());
    process.exit(args.length === 0 ? 1 : 0);
  }

  const inputPath = resolve(args[0]);
  if (!existsSync(inputPath)) {
    process.stderr.write(`File not found: ${inputPath}\n`);
    process.exit(1);
  }

  const outPath = args[1] ? resolve(args[1]) : inputPath.replace(/\.xlsx?$/i, "") + ".csv";

  const buf = readFileSync(inputPath);
  const sheet = process.env.SHEET;
  const { rows } = parseConsumptionUserSummaryXlsx(buf, sheet ? { sheetName: sheet } : {});

  const csv = rowsToCsv(rows);
  writeFileSync(outPath, csv, { encoding: "utf8" });
  process.stdout.write(
    `Wrote ${rows.length} row(s) to ${outPath} (${basename(inputPath)})\n`
  );
}

main();
