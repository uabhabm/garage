/**
 * RFID-hex i kolumnen User, t.ex. "Admin RFID (AB1E9E41)" → "AB1E9E41"
 * @param {string} userCell
 * @returns {string | null}
 */
export function extractRfidHex(userCell) {
  const m = /\(([0-9A-Fa-f]+)\)\s*$/.exec(String(userCell).trim());
  return m ? m[1].toUpperCase() : null;
}

/** Känd mappning RFID (hex) → sista två siffror i mätar-id efter prefix 05710001000 */
const RFID_TO_SUFFIX = new Map([
  ["AB1E9E41", "01"],
  ["94439E41", "07"],
]);

/**
 * Bygger mätar-id: "05710001000" + "01" | "07" enligt spec för kända taggar.
 * @param {string} rfidHex
 * @returns {string}
 */
export function meterIdFromRfidHex(rfidHex) {
  const h = String(rfidHex).trim().toUpperCase();
  const suffix = RFID_TO_SUFFIX.get(h);
  if (!suffix) {
    const err = new Error(
      `Okänd RFID "${h}". Stöds: ${[...RFID_TO_SUFFIX.keys()].join(", ")}.`
    );
    err.code = "MBF_UNKNOWN_RFID";
    throw err;
  }
  return `05710001000${suffix}`;
}
