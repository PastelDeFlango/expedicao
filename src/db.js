'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

const db = new Database(config.databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const schemaFile = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(schemaFile)) {
  throw new Error('Arquivo src/schema.sql nao encontrado.');
}

db.exec(fs.readFileSync(schemaFile, 'utf8'));

const TURNOS = [
  ['T1', '1º Turno', '06:00', '14:00', 1],
  ['T2', '2º Turno', '14:00', '22:00', 2],
  ['T3', '3º Turno', '22:00', '06:00', 3]
];

const USUARIOS = [
  ['admin', 'Admin@123', 'Administrador', 'admin', 'T1', ['T1', 'T2', 'T3']],
  ['supervisor', 'Super@123', 'Supervisao', 'supervisor', 'T1', ['T1', 'T2', 'T3']],
  ['gestor1', 'Gestor1@123', 'Gestor 1º Turno', 'manager', 'T1', ['T1']],
  ['gestor2', 'Gestor2@123', 'Gestor 2º Turno', 'manager', 'T2', ['T2']],
  ['gestor3', 'Gestor3@123', 'Gestor 3º Turno', 'manager', 'T3', ['T3']],
  ['operador1', 'Turno1@123', 'Operador 1º Turno', 'operator', 'T1', ['T1']],
  ['operador2', 'Turno2@123', 'Operador 2º Turno', 'operator', 'T2', ['T2']],
  ['operador3', 'Turno3@123', 'Operador 3º Turno', 'operator', 'T3', ['T3']]
];

function semear() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM shifts').get().total;
  if (total > 0) return;

  const addTurno = db.prepare('INSERT INTO shifts (code, name, starts_at, ends_at, position) VALUES (?, ?, ?, ?, ?)');
  const addUser = db.prepare('INSERT INTO users (username, password_hash, name, role, primary_shift, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const addLink = db.prepare('INSERT INTO user_shifts (user_id, shift_code, granted_at) VALUES (?, ?, ?)');
  const agora = new Date().toISOString();

  db.transaction(() => {
    for (const t of TURNOS) addTurno.run(t[0], t[1], t[2], t[3], t[4]);

    for (const u of USUARIOS) {
      const info = addUser.run(u[0], bcrypt.hashSync(u[1], 12), u[2], u[3], u[4], agora);
      for (const code of u[5]) addLink.run(info.lastInsertRowid, code, agora);
    }
  })();

  console.log('Turnos e usuarios iniciais criados.');
}

semear();

module.exports = db;
