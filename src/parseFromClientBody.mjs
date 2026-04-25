import { parseConsumptionUserSummaryXlsx } from "./parseReport.mjs";
import { rowsToCsv } from "./toCsv.mjs";

/**
 * @param {unknown} body
 * @returns
 *   | { ok: true; status: 200; csv: string; rowCount: number; sheetName: string; headerRowIndex: number }
 *   | { ok: false; status: number; body: { error: string; code: string } }
 */
export function runParseFromClientBody(body) {
  if (body == null || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      body: { error: "Request body must be a JSON object", code: "BAD_JSON" },
    };
  }

  const b = /** @type {{ file?: string; fileBase64?: string; sheetName?: string }} */ (body);
  let b64 = b.file ?? b.fileBase64;
  if (typeof b64 !== "string" || !b64.length) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Missing 'file' or 'fileBase64' base64 string in JSON body",
        code: "MISSING_FILE",
      },
    };
  }

  const dataUrl = /^data:([^;]+);base64,(.*)$/i.exec(b64);
  if (dataUrl) b64 = dataUrl[2];

  let xlsx;
  try {
    xlsx = Buffer.from(b64, "base64");
  } catch {
    return {
      ok: false,
      status: 400,
      body: { error: "Invalid base64", code: "BAD_BASE64" },
    };
  }
  if (!xlsx.length) {
    return {
      ok: false,
      status: 400,
      body: { error: "Empty file after base64 decode", code: "EMPTY" },
    };
  }

  try {
    const sheetName = typeof b.sheetName === "string" && b.sheetName.trim() ? b.sheetName.trim() : undefined;
    const parsed = parseConsumptionUserSummaryXlsx(
      xlsx,
      sheetName ? { sheetName } : {}
    );
    return {
      ok: true,
      status: 200,
      csv: rowsToCsv(parsed.rows),
      rowCount: parsed.rows.length,
      sheetName: parsed.sheetName,
      headerRowIndex: parsed.headerRowIndex,
    };
  } catch (e) {
    const code = e?.code === "TABLE_NOT_FOUND" ? "TABLE_NOT_FOUND" : "PARSE_ERROR";
    const message = e?.message ?? "Parse failed";
    const status = e?.code === "TABLE_NOT_FOUND" ? 422 : 500;
    return { ok: false, status, body: { error: message, code } };
  }
}
