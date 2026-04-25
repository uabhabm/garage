import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runParseFromClientBody } from "./src/parseFromClientBody.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT) || 3000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  const fullUrl = new URL(req.url || "/", "http://localhost");
  for (const [k, v] of Object.entries(cors)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (fullUrl.pathname === "/api/parse" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(
      JSON.stringify({
        ok: true,
        name: "consumption-summary-xlsx-to-csv",
        post: { fileBase64: "base64 string" },
        note: "Use POST with JSON. Add ?format=json for JSON response with csv field.",
      })
    );
  }

  if (fullUrl.pathname === "/api/parse" && req.method === "POST") {
    const wantJson = fullUrl.searchParams.get("format") === "json" || String(req.headers.accept ?? "").includes("application/json");

    let body;
    try {
      const raw = await readBody(req);
      body = raw.length ? JSON.parse(raw.toString("utf8")) : null;
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(
        JSON.stringify({ error: "Invalid or empty JSON body", code: "BAD_JSON" })
      );
    }

    const out = runParseFromClientBody(body);
    if (!out.ok) {
      res.writeHead(out.status, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: false, ...out.body }));
    }

    if (wantJson) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(
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

    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "X-Row-Count": String(out.rowCount),
      "X-Sheet-Name": out.sheetName,
      "X-Csv-Format": out.csvFormat,
    });
    return res.end(out.csv);
  }

  const pathname = fullUrl.pathname === "" ? "/" : fullUrl.pathname;
  if (pathname.includes("..")) {
    res.writeHead(400);
    return res.end("Invalid path");
  }

  const rel = pathname === "/" ? "index.html" : path.posix.join(...pathname.split("/").filter(Boolean));
  const filePath = path.resolve(path.join(publicDir, rel));
  const publicRoot = path.resolve(publicDir);
  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
    res.writeHead(400);
    return res.end("Invalid path");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const buf = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(buf);
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`http://localhost:${port}/`);
});
