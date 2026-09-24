'use strict';

const db = require('../db');

const SQL_INSERT = [
  'INSERT INTO audit',
  '(user_id, action, entity, entity_id, detail, created_at)',
  'VALUES (?, ?, ?, ?, ?, ?)'
].join(' ');

const SQL_LIST = [
  'SELECT a.*, u.name AS user_name FROM audit a',
  'LEFT JOIN users u ON u.id = a.user_id',
  'ORDER BY a.id DESC LIMIT ?'
].join(' ');

function log(userId, action, entity, entityId, detail) {
  try {
    db.prepare(SQL_INSERT).run(
      userId,
      action,
      entity,
      entityId || null,
      detail || String.fromCharCode(39) + String.fromCharCode(39),
      new Date().toISOString()
    );
  } catch (error) {
    return null;
  }

  return true;
}

function list(limit) {
  return db.prepare(SQL_LIST).all(Number(limit) || 200);
}

module.exports = { log, list };
