import { runParseFromClientBody } from "./parseFromClientBody.mjs";

const MONTHS_SV = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

/** @param {string | null | undefined} yyyymmdd */
export function formatReportMonthLabelSv(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length < 8) return "";
  const y = yyyymmdd.slice(0, 4);
  const mo = parseInt(yyyymmdd.slice(4, 6), 10);
  if (mo < 1 || mo > 12) return "";
  return `${MONTHS_SV[mo - 1]} ${y}`;
}

export function buildMbfEmailSubject(reportDateFromYmd) {
  const period = formatReportMonthLabelSv(reportDateFromYmd);
  const base = "Förbrukningsrapport Samfällighet Uppfinnaren Garaget";
  return period ? `${base} ${period}` : base;
}

export function buildMbfEmailBody(subjectLine) {
  return `Bifogas förbrukningsrapport.\n\n${subjectLine}`;
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function attachmentFileName(reportDateFromYmd, reportDateToYmd) {
  const a = (reportDateFromYmd || "export").replace(/\D/g, "");
  const b = (reportDateToYmd || "").replace(/\D/g, "");
  if (a && b && a !== b) return `MBF-forbrukning-${a}-${b}.csv`;
  if (a) return `MBF-forbrukning-${a}.csv`;
  return "MBF-forbrukning.csv";
}

/**
 * @param {Record<string, unknown>} body fileBase64|file, to|email|recipientEmail
 * @returns {Promise<{ ok: true, status: 200 } | { ok: false, status: number, body: { error: string, code: string } }>}
 */
export async function runMailMbfFromClientBody(body) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      ok: false,
      status: 503,
      body: {
        error:
          "E-post är inte konfigurerat. Sätt miljövariablerna RESEND_API_KEY och RESEND_FROM_EMAIL (verifierad avsändare hos Resend).",
        code: "MAIL_NOT_CONFIGURED",
      },
    };
  }

  const toRaw = body?.to ?? body?.email ?? body?.recipientEmail;
  if (typeof toRaw !== "string" || !toRaw.trim()) {
    return {
      ok: false,
      status: 400,
      body: { error: "Saknad mottagaradress (fält: to eller email).", code: "MAIL_BAD_EMAIL" },
    };
  }
  const to = toRaw.trim();
  if (!isValidEmail(to)) {
    return {
      ok: false,
      status: 400,
      body: { error: "Ogiltig e-postadress.", code: "MAIL_BAD_EMAIL" },
    };
  }

  const fileB64 = body?.file ?? body?.fileBase64;
  const parseOut = runParseFromClientBody({
    fileBase64: typeof fileB64 === "string" ? fileB64 : "",
    outputFormat: "mbf",
  });
  if (!parseOut.ok) {
    return parseOut;
  }
  if (parseOut.csvFormat !== "mbf" || !parseOut.csv) {
    return {
      ok: false,
      status: 500,
      body: { error: "Kunde inte skapa MBF CSV.", code: "MAIL_INTERNAL" },
    };
  }

  const subject = buildMbfEmailSubject(parseOut.reportDateFromYmd);
  const textBody = buildMbfEmailBody(subject);
  const filename = attachmentFileName(parseOut.reportDateFromYmd, parseOut.reportDateToYmd);
  const csvB64 = Buffer.from(parseOut.csv, "utf8").toString("base64");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: textBody,
      attachments: [{ filename, content: csvB64 }],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: 502,
      body: {
        error: `Kunde inte skicka e-post (${res.status}). ${detail.slice(0, 400)}`,
        code: "MAIL_SEND_FAILED",
      },
    };
  }

  return { ok: true, status: 200 };
}
