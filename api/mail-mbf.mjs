import { runMailMbfFromClientBody } from "../src/mailMbf.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export default async function handler(req, res) {
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res
      .status(200)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .end(
        JSON.stringify({
          ok: true,
          name: "mail-mbf-csv",
          post: {
            contentType: "application/json",
            body: {
              fileBase64: "<base64 .xlsx>",
              to: "<mottagarens e-post>",
            },
            env: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
          },
        })
      );
  }

  if (req.method !== "POST") {
    return res.status(405).setHeader("Allow", "GET, POST, OPTIONS").end("Method Not Allowed");
  }

  let body = req.body;
  if (body == null) {
    try {
      const raw = await readToString(req);
      if (raw) body = JSON.parse(raw);
    } catch {
      return res
        .status(400)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .end(JSON.stringify({ ok: false, error: "Ogiltig JSON", code: "BAD_JSON" }));
    }
  } else if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    try {
      body = JSON.parse(Buffer.from(body).toString("utf8"));
    } catch {
      return res
        .status(400)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .end(JSON.stringify({ ok: false, error: "Ogiltig JSON", code: "BAD_JSON" }));
    }
  } else if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res
        .status(400)
        .setHeader("Content-Type", "application/json; charset=utf-8")
        .end(JSON.stringify({ ok: false, error: "Ogiltig JSON", code: "BAD_JSON" }));
    }
  }

  const out = await runMailMbfFromClientBody(body);
  if (!out.ok) {
    return res
      .status(out.status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .end(JSON.stringify({ ok: false, ...out.body }));
  }

  return res
    .status(200)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .end(JSON.stringify({ ok: true, message: "Mailet har skickats." }));
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
