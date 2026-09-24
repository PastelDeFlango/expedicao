'use strict';

const db = require('../src/db');

const quantity = Number(process.argv[2] || 60);
const operators = db.prepare("SELECT id, name, shift FROM users WHERE role = 'operator' ORDER BY id").all();

if (!operators.length) {
  console.error('Nenhum operador cadastrado.');
  process.exit(1);
}

const carriers = ['Translog', 'Rota Sul', 'Carga Azul'];
const clients = ['Cliente A', 'Cliente B', 'Cliente C'];
const cities = ['Sao Paulo', 'Campinas', 'Sorocaba'];
const types = ['Carreta', 'Truck', 'Toco'];

const INSERT_SQL = [
  "INSERT INTO shipments ("
  , "  plate, driver, carrier, vehicle_type, load_code, client, destination, dock,"
  , "  quantity, weight, notes, user_id, shift, created_at,"
  , "  assembly_start_at, assembly_end_at, gate_in_at, dock_in_at,"
  , "  load_start_at, load_end_at, dock_out_at, release_at"
  , ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
].join(' ');

const insert = db.prepare(INSERT_SQL);
const now = new Date();

const run = db.transaction(() => {
  for (let index = 0; index < quantity; index += 1) {
    const base = new Date(now.getFullYear(), now.getMonth() - (index % 6), 1 + ((index * 3) % 25), 5 + (index % 14), 15);
    const operator = operators[index % operators.length];
    const iso = (offset) => new Date(base.getTime() + offset * 60000).toISOString();
    const stage = index % 5;

    const assemblyEnd = 70 + (index % 60);
    const gateIn = assemblyEnd + 10 + (index % 25);
    const dockIn = gateIn + 8 + (index % 20);
    const loadStart = dockIn + 5 + (index % 10);
    const loadEnd = loadStart + 45 + (index % 40);
    const dockOut = loadEnd + 5 + (index % 12);
    const release = dockOut + 6 + (index % 15);

    const hasEnd = stage !== 0;
    const hasGate = stage > 1;
    const hasDock = stage > 2;
    const hasStart = stage > 3;
    const finished = stage > 4 && hasStart;

    insert.run(
      'DEM' + (1000 + index),
      'Motorista ' + (index + 1),
      carriers[index % carriers.length],
      types[index % types.length],
      'CG-' + (2400 + index),
      clients[index % clients.length],
      cities[index % cities.length],
      'Doca ' + (1 + (index % 4)),
      30 + index,
      7000 + index * 55,
      '',
      operator.id,
      operator.shift,
      base.toISOString(),
      base.toISOString(),
      hasEnd ? iso(assemblyEnd) : null,
      hasGate ? iso(gateIn) : null,
      hasDock ? iso(dockIn) : null,
      hasStart ? iso(loadStart) : null,
      finished ? iso(loadEnd) : null,
      finished ? iso(dockOut) : null,
      finished ? iso(release) : null
    );
  }
});

run();
console.log(quantity + ' registros de demonstracao inseridos.');
