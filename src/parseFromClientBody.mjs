import { parseConsumptionUserSummaryXlsx } from "./parseReport.mjs";
import { rowsToCsv } from "./toCsv.mjs";
import { rowsToMbfCsv } from "./toMbfCsv.mjs";

/**
 * @param {unknown} body
 * @returns
 *   | { ok: true; status: 200; csv: string; rowCount: number; sheetName: string; headerRowIndex: number; csvFormat: "standard" | "mbf" }
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

  const b = /** @type {Record<string, unknown>} */ (body);
  let b64 = /** @type {string | undefined} */ (b.file ?? b.fileBase64);
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

  const wantMbf =
    b.outputFormat === "mbf" || b.csvFormat === "mbf" || b.format === "mbf";

  try {
    const sheetName =
      typeof b.sheetName === "string" && b.sheetName.trim() ? b.sheetName.trim() : undefined;
    const parsed = parseConsumptionUserSummaryXlsx(
      xlsx,
      sheetName ? { sheetName } : {}
    );

    let csv;
    /** @type {"standard" | "mbf"} */
    let csvFormat = "standard";

    if (wantMbf) {
      const ds = b.dateStart ?? b.readingDateStart;
      const de = b.dateEnd ?? b.readingDateEnd;
      if (typeof ds !== "string" || !String(ds).trim() || typeof de !== "string" || !String(de).trim()) {
        return {
          ok: false,
          status: 400,
          body: {
            error: "MBF kräver dateStart och dateEnd (YYYY-MM-DD).",
            code: "MBF_DATES_REQUIRED",
          },
        };
      }
      try {
        csv = rowsToMbfCsv(parsed.rows, {
          dateStart: String(ds).trim(),
          dateEnd: String(de).trim(),
        });
        csvFormat = "mbf";
      } catch (e) {
        const code = typeof e?.code === "string" ? e.code : "MBF_ERROR";
        const message = e?.message ?? "MBF-export misslyckades";
        const clientErrors = new Set([
          "MBF_UNKNOWN_RFID",
          "MBF_NO_RFID",
          "MBF_BAD_ENERGY",
          "MBF_BAD_DATE",
          "MBF_BAD_PERIOD",
        ]);
        const status = clientErrors.has(code) ? 422 : 500;
        return { ok: false, status, body: { error: message, code } };
      }
    } else {
      csv = rowsToCsv(parsed.rows);
    }

    return {
      ok: true,
      status: 200,
      csv,
      rowCount: parsed.rows.length,
      sheetName: parsed.sheetName,
      headerRowIndex: parsed.headerRowIndex,
      csvFormat,
    };
  } catch (e) {
    const code = e?.code === "TABLE_NOT_FOUND" ? "TABLE_NOT_FOUND" : "PARSE_ERROR";
    const message = e?.message ?? "Parse failed";
    const status = e?.code === "TABLE_NOT_FOUND" ? 422 : 500;
    return { ok: false, status, body: { error: message, code } };
  }
}
