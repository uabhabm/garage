import XLSX from "xlsx";
import { extractReportDateCells, reportCellValueToYyyyMmDd } from "./reportDates.mjs";

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} header
 * @returns {"duration"|"energy"|null}
 */
function classifyColumnHeader(header) {
  const h = norm(header);
  if (h === "total duration" || h.startsWith("total duration ")) return "duration";
  if (h === "total energy" || h === "total energy (kwh)" || (h.startsWith("total energy") && h.includes("kwh")))
    return "energy";
  return null;
}

/**
 * Find the user table header row: first cell is "User" and the row has
 * Total Duration and Total Energy (kWh) style columns.
 */
function findUserTableHeader(matrix) {
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || !row.length) continue;
    if (norm(row[0]) !== "user") continue;

    let colDuration = -1;
    let colEnergy = -1;
    for (let c = 0; c < row.length; c++) {
      const k = classifyColumnHeader(row[c]);
      if (k === "duration") colDuration = c;
      if (k === "energy") colEnergy = c;
    }
    if (colDuration >= 0 && colEnergy >= 0) {
      return { headerRow: r, colUser: 0, colDuration, colEnergy };
    }
  }
  return null;
}

function cellToString(v) {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v);
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} input
 * @param {{ sheetName?: string }} [options]
 * @returns {{
 *   rows: { user: string, totalDuration: string, totalEnergy: string }[],
 *   sheetName: string,
 *   headerRowIndex: number,
 *   reportDateFromYmd: string | null,
 *   reportDateToYmd: string | null
 * }}
 */
export function parseConsumptionUserSummaryXlsx(input, options = {}) {
  const wb = XLSX.read(input, { type: "buffer", cellDates: false });
  if (!wb.SheetNames.length) {
    return {
      rows: [],
      sheetName: "",
      headerRowIndex: -1,
      reportDateFromYmd: null,
      reportDateToYmd: null,
    };
  }

  let name;
  if (options.sheetName && wb.SheetNames.includes(options.sheetName)) {
    name = options.sheetName;
  } else {
    const prefer = wb.SheetNames.find(
      (n) => n.toLowerCase().includes("user") && n.toLowerCase().includes("summary")
    );
    name = prefer ?? wb.SheetNames[0];
  }

  const sheet = wb.Sheets[name];
  if (!sheet) {
    return {
      rows: [],
      sheetName: name,
      headerRowIndex: -1,
      reportDateFromYmd: null,
      reportDateToYmd: null,
    };
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const { fromVal, toVal } = extractReportDateCells(matrix);
  const reportDateFromYmd = reportCellValueToYyyyMmDd(fromVal);
  const reportDateToYmd = reportCellValueToYyyyMmDd(toVal);

  const loc = findUserTableHeader(matrix);
  if (!loc) {
    const err = new Error(
      "Could not find a table with User, Total Duration, and Total Energy columns. " +
        "Is this a Consumption Summary (User) export?"
    );
    err.code = "TABLE_NOT_FOUND";
    throw err;
  }

  const { headerRow, colUser, colDuration, colEnergy } = loc;
  const rows = [];

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;
    const user = cellToString(line[colUser]).trim();
    if (!user) continue;

    rows.push({
      user,
      totalDuration: cellToString(line[colDuration]).trim(),
      totalEnergy: cellToString(line[colEnergy]).trim(),
    });
  }

  return {
    rows,
    sheetName: name,
    headerRowIndex: headerRow,
    reportDateFromYmd,
    reportDateToYmd,
  };
}
