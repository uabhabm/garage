/**
 * RFC 4180-style single-line row; quote when needed.
 * @param {string} s
 */
function escapeField(s) {
  const t = s == null ? "" : String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const DEFAULT_HEADERS = ["user", "total_duration", "total_energy"];

/**
 * @param { { user: string, totalDuration: string, totalEnergy: string }[] } rows
 * @param {{ includeHeader?: boolean, headers?: string[] }} [opt]
 * @returns {string}
 */
export function rowsToCsv(rows, opt = {}) {
  const includeHeader = opt.includeHeader !== false;
  const headers = opt.headers ?? DEFAULT_HEADERS;
  const lines = [];
  if (includeHeader) {
    lines.push(headers.map(escapeField).join(","));
  }
  for (const r of rows) {
    lines.push(
      [r.user, r.totalDuration, r.totalEnergy].map(escapeField).join(",")
    );
  }
  if (!lines.length) return "";
  return lines.join("\n") + "\n";
}
