import { extractRfidHex, meterIdFromRfidHex } from "./rfidMeterId.mjs";

/** Samma rubrikrad som i exempel.csv */
export const MBF_CSV_HEADER =
  "Typ,Exp, Start, Mätstart, Slut, MätSlut,Förbrukat,Bet,MätarId";

/**
 * kWh-sträng (t.ex. "87,19") → heltal = hundradelar kWh (8719 för 87,19)
 * @param {string} s
 * @returns {number}
 */
export function parseKwhToHundredths(s) {
  const raw = String(s ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!raw.length) {
    const err = new Error(`Ogiltig energi (kWh): "${s}"`);
    err.code = "MBF_BAD_ENERGY";
    throw err;
  }
  const t = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) {
    const err = new Error(`Ogiltig energi (kWh): "${s}"`);
    err.code = "MBF_BAD_ENERGY";
    throw err;
  }
  const neg = m[1] === "-";
  const whole = parseInt(m[2], 10);
  const fracRaw = (m[3] || "").padEnd(2, "0").slice(0, 2);
  const frac = parseInt(fracRaw, 10) || 0;
  let v = whole * 100 + frac;
  if (neg) v = -v;
  return v;
}

/** Bet = förbrukat × 2,5, avrundat till 2 decimaler (heltal i hundradelar) */
export function betHundredthsFromForbrukHundredths(forbrukHundredths) {
  return Math.floor((forbrukHundredths * 250 + 50) / 100);
}

/**
 * ISO-datum "YYYY-MM-DD" → "YYYYMMDD"
 * @param {string} isoDate
 */
export function toYyyyMmDdCompact(isoDate) {
  const t = String(isoDate).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) {
    const err = new Error(`Ogiltigt datum (förväntat YYYY-MM-DD): "${isoDate}"`);
    err.code = "MBF_BAD_DATE";
    throw err;
  }
  return `${m[1]}${m[2]}${m[3]}`;
}

/**
 * @param { { user: string, totalDuration: string, totalEnergy: string }[] } rows
 * @param {{ dateStart: string, dateEnd: string }} period ISO YYYY-MM-DD
 * @returns {string} full CSV inkl. rubrikrad och avslutande radbrytning
 */
export function rowsToMbfCsv(rows, period) {
  const startYmd = toYyyyMmDdCompact(period.dateStart);
  const endYmd = toYyyyMmDdCompact(period.dateEnd);
  if (startYmd > endYmd) {
    const err = new Error("Startdatum får inte vara efter slutdatum.");
    err.code = "MBF_BAD_PERIOD";
    throw err;
  }

  const lines = [MBF_CSV_HEADER];
  for (const row of rows) {
    const rfid = extractRfidHex(row.user);
    if (!rfid) {
      const err = new Error(`Kunde inte läsa RFID ur rad: "${row.user}"`);
      err.code = "MBF_NO_RFID";
      throw err;
    }
    const meterId = meterIdFromRfidHex(rfid);
    const forH = parseKwhToHundredths(row.totalEnergy);
    const betH = betHundredthsFromForbrukHundredths(forH);
    const forS = (forH / 100).toFixed(2);
    const betS = (betH / 100).toFixed(2);
    lines.push(
      `LADD,${meterId}, ${startYmd},,${endYmd},,${forS},${betS},,`
    );
  }
  return lines.join("\n") + "\n";
}
