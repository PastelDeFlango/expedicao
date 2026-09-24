'use strict';

const db = require('../db');
const { STEPS, COLUMN_BY_KEY } = require('./metrics');

const SELECT_BASE = [
  "  SELECT s.*, u.name AS user_name, sh.name AS shift_name",
  "  FROM shipments s",
  "  LEFT JOIN users u ON u.id = s.user_id",
  "  LEFT JOIN shifts sh ON sh.code = s.shift_code"
].join(String.fromCharCode(10));

const SQL_ROW = "SELECT * FROM shipments WHERE id = ?";
const SQL_DELETE = "DELETE FROM shipments WHERE id = ?";
const SQL_BY_ID = " WHERE s.id = ?";
const SQL_ORDER = " ORDER BY s.created_at DESC LIMIT 5000";
const SQL_SET = "UPDATE shipments SET ";
const SQL_YEAR = "strftime('%Y', s.created_at) = ?";
const SQL_MONTH = "CAST(strftime('%m', s.created_at) AS INTEGER) = ?";
const SQL_INSERT = "INSERT INTO shipments ("
  + "load_code, client, destination, dock, plate, driver, carrier, vehicle_type, "
  + "quantity, weight, notes, user_id, shift_code, created_at, assembly_start_at"
  + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

function serialize(row) {
  const steps = STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    at: row[step.column] || null
  }));

  const pendentes = steps.filter((step) => !step.at);

  return {
    id: row.id,
    load: row.load_code,
    client: row.client,
    destination: row.destination,
    dock: row.dock,
    plate: row.plate,
    driver: row.driver,
    carrier: row.carrier,
    vehicleType: row.vehicle_type,
    quantity: row.quantity,
    weight: row.weight,
    notes: row.notes,
    holdReason: row.hold_reason,
    userId: row.user_id,
    userName: row.user_name,
    shift: row.shift_code,
    shiftName: row.shift_name || row.shift_code,
    createdAt: row.created_at,
    nextStep: pendentes.length ? pendentes[0].key : null,
    steps
  };
}

function buildScope(user, shifts, query) {
  const conditions = [];
  const params = [];

  const ehOperador = user.role === "operator";
  const ehGestor = user.role === "manager";

  if (ehOperador) {
    conditions.push("s.user_id = ?");
    params.push(user.id);
  } else if (ehGestor) {
    if (!shifts.length) {
      conditions.push("1 = 0");
    } else {
      const marcadores = shifts.map(() => "?").join(", ");
      conditions.push("s.shift_code IN (" + marcadores + ")");
      for (const code of shifts) params.push(code);
    }
  }

  if (query.shift) {
    if (!shifts || shifts.indexOf(query.shift) > -1) {
      conditions.push("s.shift_code = ?");
      params.push(query.shift);
    }
  }

  if (query.userId) {
    conditions.push("s.user_id = ?");
    params.push(Number(query.userId));
  }

  if (query.year) {
    conditions.push(SQL_YEAR);
    params.push(String(query.year));
  }

  if (query.month !== undefined && query.month !== "") {
    conditions.push(SQL_MONTH);
    params.push(Number(query.month) + 1);
  }

  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  return { where, params };
}

function list(user, shifts, query) {
  const escopo = buildScope(user, shifts, query || {});
  return db.prepare(SELECT_BASE + escopo.where + SQL_ORDER).all(...escopo.params).map(serialize);
}

function findRow(id) {
  return db.prepare(SQL_ROW).get(id);
}

function findById(id) {
  const row = db.prepare(SELECT_BASE + SQL_BY_ID).get(id);
  return row ? serialize(row) : null;
}

function create(user, payload, shiftCode) {
  const stamp = new Date().toISOString();

  const info = db.prepare(SQL_INSERT).run(
    String(payload.load || "").trim(),
    payload.client || "",
    payload.destination || "",
    payload.dock || "",
    String(payload.plate || "").trim().toUpperCase(),
    payload.driver || "",
    payload.carrier || "",
    payload.vehicleType || "",
    payload.quantity === "" || payload.quantity === undefined ? null : Number(payload.quantity),
    payload.weight === "" || payload.weight === undefined ? null : Number(payload.weight),
    payload.notes || "",
    user.id,
    shiftCode,
    stamp,
    stamp
  );

  return findById(info.lastInsertRowid);
}

function registerStep(row, stepKey) {
  const column = COLUMN_BY_KEY[stepKey];
  const position = STEPS.findIndex((step) => step.key === stepKey);

  if (!column) return { error: "Etapa invalida." };
  if (row[column]) return { error: "Esta etapa ja foi registrada." };

  for (let index = 0; index < position; index += 1) {
    if (!row[STEPS[index].column]) {
      return { error: "Registre a etapa anterior primeiro." };
    }
  }

  db.prepare(SQL_SET + column + " = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return { shipment: findById(row.id) };
}

function undoStep(row, stepKey) {
  const column = COLUMN_BY_KEY[stepKey];
  if (!column) return { error: "Etapa invalida." };

  const position = STEPS.findIndex((step) => step.key === stepKey);
  const seguinte = STEPS.slice(position + 1).find((step) => row[step.column]);

  if (seguinte) return { error: "Desfaca primeiro a etapa seguinte." };

  db.prepare(SQL_SET + column + " = NULL WHERE id = ?").run(row.id);
  return { shipment: findById(row.id) };
}

function remove(id) {
  db.prepare(SQL_DELETE).run(id);
}

module.exports = { list, findRow, findById, create, registerStep, undoStep, remove, serialize };
