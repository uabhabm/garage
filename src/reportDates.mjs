/**
 * Läser Date from / Date to från Consumption Summary-rapport (Excel som matris).
 */

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function cellToString(v) {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v);
}

const DATE_FROM_LABELS = [/^date\s*from:?\s*$/, /^datum\s*fr[åa]n:?\s*$/];
const DATE_TO_LABELS = [/^date\s*to:?\s*$/, /^datum\s*till:?\s*$/];

function labelMatches(lab, patterns) {
  const x = norm(lab);
  return patterns.some((re) => re.test(x));
}

function findFirstNonEmptyRight(row, fromCol) {
  for (let i = fromCol + 1; i < row.length; i++) {
    const v = row[i];
    if (v !== "" && v != null && String(cellToString(v)).trim() !== "") return v;
  }
  return null;
}

/**
 * @param {unknown[][]} matrix
 * @returns {{ fromVal: unknown, toVal: unknown }}
 */
export function extractReportDateCells(matrix) {
  let fromVal = null;
  let toVal = null;
  if (!matrix) return { fromVal, toVal };
  for (const row of matrix) {
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const lab = cellToString(row[c]).trim();
      if (!lab) continue;
      if (labelMatches(lab, DATE_FROM_LABELS)) {
        const v = findFirstNonEmptyRight(row, c);
        if (v != null) fromVal = v;
      }
      if (labelMatches(lab, DATE_TO_LABELS)) {
        const v = findFirstNonEmptyRight(row, c);
        if (v != null) toVal = v;
      }
    }
  }
  return { fromVal, toVal };
}

function ymdFromLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Excel-serial (ca 1900-datum) → lokalt datum */
function excelSerialToLocalDate(n) {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

/**
 * @param {unknown} value cell från xlsx
 * @returns {string | null} YYYYMMDD
 */
export function reportCellValueToYyyyMmDd(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return ymdFromLocalDate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 2000 && value < 200000) {
      const d = excelSerialToLocalDate(value);
      if (!Number.isNaN(d.getTime())) return ymdFromLocalDate(d);
    }
    return null;
  }
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return ymdFromLocalDate(new Date(t));
  return null;
}
