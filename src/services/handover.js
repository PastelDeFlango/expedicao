'use strict';

const db = require('../db');

const SQL_INSERT = 'INSERT INTO handovers (from_shift, to_shift, summary, pending, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const SQL_LIST = 'SELECT h.*, u.name AS user_name FROM handovers h LEFT JOIN users u ON u.id = h.created_by ORDER BY h.id DESC LIMIT ?';
const SQL_PENDING = 'SELECT h.*, u.name AS user_name FROM handovers h LEFT JOIN users u ON u.id = h.created_by WHERE h.to_shift IN (SELECT value FROM json_each(?)) ORDER BY h.id DESC LIMIT 1';

function create(userId, data) {
  const info = db.prepare(SQL_INSERT).run(
    data.fromShift,
    data.toShift,
    data.summary || '',
    data.pending || '',
    userId,
    new Date().toISOString()
  );

  return { id: info.lastInsertRowid };
}

function list(limit) {
  return db.prepare(SQL_LIST).all(Number(limit) || 30);
}

function lastFor(shifts) {
  if (!shifts.length) return null;
  const json = JSON.stringify(shifts);
  return db.prepare(SQL_PENDING).get(json) || null;
}

module.exports = { create, list, lastFor };
