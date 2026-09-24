'use strict';

const db = require('../db');

const DEFAULT_SHIFTS = [
  ['T1', '1º Turno', '06:00', '14:00', 1],
  ['T2', '2º Turno', '14:00', '22:00', 2],
  ['T3', '3º Turno', '22:00', '06:00', 3]
];

function seedShifts() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM shifts').get().total;
  if (total > 0) return false;

  const insert = db.prepare('INSERT INTO shifts (code, name, starts_at, ends_at, position) VALUES (?, ?, ?, ?, ?)');

  db.transaction(() => {
    for (const item of DEFAULT_SHIFTS) {
      insert.run(item[0], item[1], item[2], item[3], item[4]);
    }
  })();

  return true;
}

function list() {
  return db.prepare('SELECT code, name, starts_at, ends_at, position, active FROM shifts ORDER BY position').all();
}

function codes() {
  return list().map((item) => item.code);
}

function sortedCodes() {
  return codes();
}

function isValid(code) {
  if (!code) return false;
  return db.prepare('SELECT code FROM shifts WHERE code = ? AND active = 1').get(code) !== undefined;
}

function nameOf(code) {
  const row = db.prepare('SELECT name FROM shifts WHERE code = ?').get(code);
  return row ? row.name : code;
}

module.exports = { seedShifts, list, codes, sortedCodes, isValid, nameOf };
