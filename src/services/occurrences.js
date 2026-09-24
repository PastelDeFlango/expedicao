'use strict';

const db = require('../db');

const SQL_INSERT = 'INSERT INTO occurrences (shipment_id, category, detail, minutes_lost, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const SQL_BY_SHIP = 'SELECT o.*, u.name AS user_name FROM occurrences o LEFT JOIN users u ON u.id = o.created_by WHERE o.shipment_id = ? ORDER BY o.id DESC';
const SQL_SUMMARY = 'SELECT category, COUNT(*) AS total, SUM(minutes_lost) AS minutos FROM occurrences WHERE created_at >= ? GROUP BY category ORDER BY total DESC';

function create(userId, data) {
  const info = db.prepare(SQL_INSERT).run(
    Number(data.shipmentId),
    data.category,
    data.detail || '',
    Number(data.minutesLost) || 0,
    userId,
    new Date().toISOString()
  );

  return { id: info.lastInsertRowid };
}

function byShipment(shipmentId) {
  return db.prepare(SQL_BY_SHIP).all(Number(shipmentId));
}

function summarySince(isoDate) {
  return db.prepare(SQL_SUMMARY).all(isoDate);
}

module.exports = { create, byShipment, summarySince };
