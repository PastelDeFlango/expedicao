'use strict';

const BOM = String.fromCharCode(0xFEFF);
const BREAK = String.fromCharCode(13) + String.fromCharCode(10);
const QUOTE = String.fromCharCode(34);

function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return QUOTE + text.split(QUOTE).join(QUOTE + QUOTE) + QUOTE;
}

function toCsv(headers, rows) {
  const all = [headers].concat(rows);
  const lines = all.map((row) => row.map(escapeCell).join(';'));
  return BOM + lines.join(BREAK);
}

module.exports = { toCsv };
