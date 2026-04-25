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
 * Sista kalenderdagen i månaden (28, 29 vid skottår, 30 eller 31).
 * @param {number} y år
 * @param {number} month1to12 1 = jan … 12 = dec
 */
export function lastDayOfCalendarMonth(y, month1to12) {
  return new Date(y, month1to12, 0).getDate();
}

/**
 * Avläsning "YYYY-MM" → kolumn Start: **den 1:a** i månaden (YYYYMMDD …01).
 * @param {string} ym
 */
export function ymToStartYmd(ym) {
  const t = String(ym).trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) {
    const err = new Error(`Ogiltig månad (förväntat YYYY-MM): "${ym}"`);
    err.code = "MBF_BAD_DATE";
    throw err;
  }
  const y = m[1];
  const mo = m[2];
  return `${y}${mo}01`;
}

/**
 * Avläsning "YYYY-MM" → kolumn Slut: **sista dagen** i månaden (YYYYMMDD …28–31, feb 29 vid skottår).
 * @param {string} ym
 */
export function ymToEndYmd(ym) {
  const t = String(ym).trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) {
    const err = new Error(`Ogiltig månad (förväntat YYYY-MM): "${ym}"`);
    err.code = "MBF_BAD_DATE";
    throw err;
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) {
    const err = new Error(`Ogiltig månad: "${ym}"`);
    err.code = "MBF_BAD_DATE";
    throw err;
  }
  const d = lastDayOfCalendarMonth(y, mo);
  return `${m[1]}${m[2]}${String(d).padStart(2, "0")}`;
}

/**
 * @param {string} s YYYY-MM eller YYYY-MM-DD
 * @param {"start"|"end"} role start → första dagen om YYYY-MM, end → sista dagen om YYYY-MM
 */
function periodBoundaryToYmd(s, role) {
  const t = String(s).trim();
  if (/^\d{8}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) {
    return role === "start" ? ymToStartYmd(t) : ymToEndYmd(t);
  }
  return toYyyyMmDdCompact(t);
}

/**
 * @param { { user: string, totalDuration: string, totalEnergy: string }[] } rows
 * @param {{ dateStart: string, dateEnd: string }} period YYYYMMDD, YYYY-MM-DD, eller YYYY-MM (första/sista i månaden)
 * @returns {string} full CSV inkl. rubrikrad och avslutande radbrytning
 */
export function rowsToMbfCsv(rows, period) {
  const startYmd = periodBoundaryToYmd(period.dateStart, "start");
  const endYmd = periodBoundaryToYmd(period.dateEnd, "end");
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
