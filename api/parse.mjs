import { runParseFromClientBody } from "../src/parseFromClientBody.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

/**
 * Vercel Node serverless: POST application/json
 *   { "file" | "fileBase64": "<base64 of .xlsx file>" }
 *   optional: { "sheetName": "user summary" }
 * With ?format=json the response is JSON: { "ok", "csv", "rowCount", "sheetName" }.
 * Default: 200 text/csv body, or 4xx/5xx JSON { error, code }.
 */
export default async function handler(req, res) {
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const host = req.headers.host ?? "localhost";
  const fullUrl = new URL(req.url || "/", `http://${host}`);

  if (req.method === "GET") {
    return res
      .status(200)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .end(
        JSON.stringify({
          ok: true,
          name: "consumption-summary-xlsx-to-csv",
          post: {
            contentType: "application/json",
            body: {
              fileBase64: "<string: base64-encoded .xlsx contents>",
              sheetName: "<optional: exact sheet name>",
              outputFormat: "<optional: mbf for IMD/MBF-radformat>",
              dateStart: "<with mbf: YYYY-MM-DD avläsning start>",
              dateEnd: "<with mbf: YYYY-MM-DD avläsning slut>",
            },
            alias: "The field 'file' is accepted instead of 'fileBase64'.",
            response: "text/csv by default; add ?format=json for { csv, rowCount, sheetName, csvFormat }.",
          },
        })
      );
  }

  if (req.method !== "POST") {
    return res.status(405).setHeader("Allow", "GET, POST, OPTIONS").end("Method Not Allowed");
  }

  const wantJson =
    fullUrl.searchParams.get("format") === "json" ||
    String(req.headers.accept ?? "").includes("application/json");

  let body = req.body;
  if (body == null) {
    try {
      const raw = await readToString(req);
      if (raw) body = JSON.parse(raw);
    } catch (e) {
      return res
        .status(400)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .end(
          JSON.stringify({ error: "Invalid or empty JSON body", code: "BAD_JSON" })
        );
    }
  } else if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    try {
      body = JSON.parse(Buffer.from(body).toString("utf8"));
    } catch (e) {
      return res
        .status(400)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .end(
          JSON.stringify({ error: "Body could not be parsed as JSON", code: "BAD_JSON" })
        );
    }
  } else if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res
        .status(400)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .end(
          JSON.stringify({ error: "Invalid JSON string body", code: "BAD_JSON" })
        );
    }
  }

  const out = runParseFromClientBody(body);
  if (!out.ok) {
    return res
      .status(out.status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .end(JSON.stringify({ ok: false, ...out.body }));
  }

  if (wantJson) {
    return res
      .status(200)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .end(
        JSON.stringify({
          ok: true,
          csv: out.csv,
          rowCount: out.rowCount,
          sheetName: out.sheetName,
          headerRowIndex: out.headerRowIndex,
          csvFormat: out.csvFormat,
        })
      );
  }

  return res
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("X-Row-Count", String(out.rowCount))
    .setHeader("X-Sheet-Name", out.sheetName)
    .setHeader("X-Csv-Format", out.csvFormat)
    .end(out.csv);
}

function readToString(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!Buffer.concat(chunks).length) {
        resolve("");
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}
