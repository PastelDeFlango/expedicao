'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db');
const shifts = require('./shifts');

const PERFIS = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  OPERATOR: 'operator'
};

const SQL_BY_ID = 'SELECT * FROM users WHERE id = ?';
const SQL_BY_NAME = 'SELECT * FROM users WHERE username = ? AND active = 1';
const SQL_LIST = 'SELECT * FROM users ORDER BY role, name';
const SQL_INSERT = 'INSERT INTO users (username, password_hash, name, cpf, xid, registration, job_title, phone, hired_at, role, primary_shift, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const SQL_UPDATE = 'UPDATE users SET name = ?, cpf = ?, xid = ?, registration = ?, job_title = ?, phone = ?, hired_at = ?, primary_shift = ? WHERE id = ?';
const SQL_PASSWORD = 'UPDATE users SET password_hash = ? WHERE id = ?';
const SQL_ACTIVE = 'UPDATE users SET active = ? WHERE id = ?';
const SQL_SHIFT_LIST = 'SELECT shift_code FROM user_shifts WHERE user_id = ?';
const SQL_SHIFT_ADD = 'INSERT OR IGNORE INTO user_shifts (user_id, shift_code, granted_by, granted_at) VALUES (?, ?, ?, ?)';
const SQL_SHIFT_DEL = 'DELETE FROM user_shifts WHERE user_id = ? AND shift_code = ?';

function digitsOnly(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function validCpf(value) {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpf[10]);
}

function shiftsOf(userId) {
  return db.prepare(SQL_SHIFT_LIST).all(userId).map((row) => row.shift_code);
}

function publicUser(row) {
  if (!row) return null;
  const allow = shiftsOf(row.id);

  return {
    id: row.id,
    username: row.username,
    name: row.name,
    cpf: row.cpf,
    xid: row.xid,
    registration: row.registration,
    jobTitle: row.job_title,
    phone: row.phone,
    hiredAt: row.hired_at,
    role: row.role,
    primaryShift: row.primary_shift,
    allowedShifts: allow.length ? allow : (row.primary_shift ? [row.primary_shift] : []),
    active: Boolean(row.active),
    createdAt: row.created_at
  };
}

function findById(id) {
  return db.prepare(SQL_BY_ID).get(id);
}

function findByUsername(username) {
  return db.prepare(SQL_BY_NAME).get(username);
}

function list() {
  return db.prepare(SQL_LIST).all().map(publicUser);
}

function listByShifts(allowed) {
  const todos = list();
  if (!allowed.length) return [];

  return todos.filter((user) => user.allowedShifts.some((code) => allowed.includes(code)));
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function createShiftLinks(userId, codes, grantedBy) {
  const insert = db.prepare(SQL_SHIFT_ADD);
  const stamp = new Date().toISOString();

  for (const code of codes) {
    if (!shifts.isValid(code)) continue;
    insert.run(userId, code, grantedBy, stamp);
  }
}

function create(data, grantedBy) {
  const stamp = new Date().toISOString();

  const info = db.prepare(SQL_INSERT).run(
    String(data.username).trim(),
    bcrypt.hashSync(data.password, 12),
    String(data.name).trim(),
    data.cpf ? digitsOnly(data.cpf) : null,
    data.xid ? String(data.xid).trim() : null,
    data.registration ? String(data.registration).trim() : null,
    data.jobTitle || null,
    data.phone || null,
    data.hiredAt || null,
    data.role,
    data.primaryShift || null,
    grantedBy || null,
    stamp
  );

  const codes = data.shifts && data.shifts.length ? data.shifts : [data.primaryShift];
  createShiftLinks(info.lastInsertRowid, codes.filter(Boolean), grantedBy);

  return publicUser(findById(info.lastInsertRowid));
}

function update(id, data) {
  db.prepare(SQL_UPDATE).run(
    String(data.name).trim(),
    data.cpf ? digitsOnly(data.cpf) : null,
    data.xid ? String(data.xid).trim() : null,
    data.registration || null,
    data.jobTitle || null,
    data.phone || null,
    data.hiredAt || null,
    data.primaryShift || null,
    id
  );

  return publicUser(findById(id));
}

function grantShift(userId, code, grantedBy) {
  const stamp = new Date().toISOString();
  db.prepare(SQL_SHIFT_ADD).run(userId, code, grantedBy, stamp);
  return publicUser(findById(userId));
}

function revokeShift(userId, code) {
  db.prepare(SQL_SHIFT_DEL).run(userId, code);
  return publicUser(findById(userId));
}

function changePassword(id, password) {
  db.prepare(SQL_PASSWORD).run(bcrypt.hashSync(password, 12), id);
}

function setActive(id, active) {
  db.prepare(SQL_ACTIVE).run(active ? 1 : 0, id);
}

function cpfTaken(cpf, ignoreId) {
  if (!cpf) return false;
  const row = db.prepare('SELECT id FROM users WHERE cpf = ?').get(digitsOnly(cpf));
  if (!row) return false;
  return ignoreId ? row.id !== ignoreId : true;
}

function xidTaken(xid, ignoreId) {
  if (!xid) return false;
  const row = db.prepare('SELECT id FROM users WHERE xid = ?').get(String(xid).trim());
  if (!row) return false;
  return ignoreId ? row.id !== ignoreId : true;
}

module.exports = {
  PERFIS,
  validCpf,
  digitsOnly,
  publicUser,
  findById,
  findByUsername,
  list,
  listByShifts,
  shiftsOf,
  verifyPassword,
  create,
  update,
  grantShift,
  revokeShift,
  changePassword,
  setActive,
  cpfTaken,
  xidTaken
};
