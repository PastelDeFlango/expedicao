'use strict';

const { minutesBetween, average, percent } = require('../utils/dates');
const config = require('../config');

// Etapas do fluxo, na ordem em que acontecem.
const STEPS = [
  { key: 'assemblyStart', column: 'assembly_start_at', label: 'Início da montagem de carga' },
  { key: 'assemblyEnd', column: 'assembly_end_at', label: 'Fim da montagem de carga' },
  { key: 'gateIn', column: 'gate_in_at', label: 'Chegada na portaria' },
  { key: 'dockIn', column: 'dock_in_at', label: 'Veículo docado' },
  { key: 'loadStart', column: 'load_start_at', label: 'Início do carregamento' },
  { key: 'loadEnd', column: 'load_end_at', label: 'Fim do carregamento' },
  { key: 'dockOut', column: 'dock_out_at', label: 'Saída da doca' },
  { key: 'release', column: 'release_at', label: 'Liberação do veículo' }
];

const COLUMN_BY_KEY = {};

for (const step of STEPS) {
  COLUMN_BY_KEY[step.key] = step.column;
}

function toBase(row) {
  const base = {};

  for (let index = 0; index < STEPS.length; index += 1) {
    base[STEPS[index].column] = row.steps[index].at;
  }

  return base;
}

function averageOf(values) {
  const validos = values.filter((v) => v !== null && v !== undefined);
  if (!validos.length) return null;
  return Math.round(validos.reduce((s, v) => s + v, 0) / validos.length);
}

function timesOf(base) {
  return {
    assembly: minutesBetween(base.assembly_start_at, base.assembly_end_at),
    wait: minutesBetween(base.assembly_end_at, base.gate_in_at),
    queue: minutesBetween(base.gate_in_at, base.dock_in_at),
    dock: minutesBetween(base.dock_in_at, base.dock_out_at),
    load: minutesBetween(base.load_start_at, base.load_end_at),
    release: minutesBetween(base.load_end_at, base.release_at),
    total: minutesBetween(base.assembly_start_at, base.release_at)
  };
}

function statusOf(base) {
  if (base.release_at) return 'Liberado';
  if (base.load_end_at && !base.dock_out_at) return 'Aguardando saída';
  if (base.dock_in_at && !base.load_end_at) return 'Em carregamento';
  if (base.gate_in_at && !base.dock_in_at) return 'Aguardando doca';
  if (base.assembly_start_at) return 'Montagem de carga';
  return 'Aguardando';
}

function withinTarget(values, target) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  return percent(valid.filter((value) => value <= target).length, valid.length);
}

function buildDashboard(bases) {
  const times = bases.map(timesOf);
  const released = bases.filter((base) => statusOf(base) === 'Liberado');

  const statuses = [
    'Aguardando', 'Montagem de carga', 'Aguardando doca',
    'Em carregamento', 'Aguardando saída', 'Liberado'
  ];

  return {
    total: bases.length,
    released: released.length,
    open: bases.length - released.length,
    releaseRate: percent(released.length, bases.length),
    pickers: bases.filter((base) => base.assembly_end_at).length,
    averageTotal: average(times.map((item) => item.total)),
    averageAssembly: average(times.map((item) => item.assembly)),
    averageWait: average(times.map((item) => item.wait)),
    averageQueue: average(times.map((item) => item.queue)),
    averageDock: average(times.map((item) => item.dock)),
    averageLoad: average(times.map((item) => item.load)),
    averageRelease: average(times.map((item) => item.release)),
    assemblyOnTarget: withinTarget(times.map((item) => item.assembly), config.goals.assemblyMinutes),
    loadOnTarget: withinTarget(times.map((item) => item.load), config.goals.loadMinutes),
    waitOnTarget: withinTarget(times.map((item) => item.wait), config.goals.waitMinutes),
    byStatus: statuses
      .map((status) => ({ status, total: bases.filter((base) => statusOf(base) === status).length }))
      .filter((item) => item.total > 0)
  };
}

function buildDaily(rows, month, year) {
  const days = new Date(year, month + 1, 0).getDate();
  const requests = Array(days).fill(0);
  const releases = Array(days).fill(0);

  for (const row of rows) {
    requests[new Date(row.createdAt).getDate() - 1] += 1;

    if (row.releasedAt) {
      const date = new Date(row.releasedAt);
      if (date.getMonth() === month && date.getFullYear() === year) {
        releases[date.getDate() - 1] += 1;
      }
    }
  }

  const labels = [];
  for (let day = 1; day <= days; day += 1) labels.push(day);

  return { labels, requests, releases };
}

function buildMonthly(rows, year) {
  const volume = Array(12).fill(0);
  const collect = [];
  for (let index = 0; index < 12; index += 1) collect.push([]);

  for (const row of rows) {
    const date = new Date(row.createdAt);
    if (date.getFullYear() !== year) continue;

    volume[date.getMonth()] += 1;

    if (row.times && row.times.total !== null && row.times.total !== undefined) {
      collect[date.getMonth()].push(row.times.total);
    }
  }

  return { volume, averages: collect.map(average) };
}

function buildByShift(rows, shifts) {
  return shifts.map((shift) => {
    const own = rows.filter((row) => row.shift === shift);
    const released = own.filter((row) => row.status === 'Liberado');

    return {
      shift,
      total: own.length,
      released: released.length,
      averageTotal: average(released.map((row) => row.times.total))
    };
  });
}

function buildRanking(rows, users) {
  return users
    .filter((user) => user.role === 'operator')
    .map((user) => {
      const own = rows.filter((row) => row.userId === user.id);
      const released = own.filter((row) => row.status === 'Liberado');

      return {
        id: user.id,
        name: user.name,
        shift: user.shift,
        total: own.length,
        released: released.length,
        releaseRate: percent(released.length, own.length),
        averageTotal: average(released.map((row) => row.times.total))
      };
    })
    .sort((a, b) => b.total - a.total);
}

module.exports = {
  averageOf,
  STEPS,
  COLUMN_BY_KEY,
  toBase,
  timesOf,
  statusOf,
  buildDashboard,
  buildDaily,
  buildMonthly,
  buildByShift,
  buildRanking
};
