'use strict';

const express = require('express');
const shipments = require('../services/shipments');
const users = require('../services/users');
const shifts = require('../services/shifts');
const metrics = require('../services/metrics');
const occurrences = require('../services/occurrences');
const { toCsv } = require('../utils/csv');
const { requireAuth, isBroad } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function faixa(query) {
  const agora = new Date();
  const mes = query.month === undefined || query.month === '' ? agora.getMonth() : Number(query.month);
  const ano = query.year ? Number(query.year) : agora.getFullYear();
  return { mes, ano };
}

function escopo(req) {
  return isBroad(req.user.role) ? null : req.shifts;
}

router.get('/dashboard', (req, res) => {
  const periodo = faixa(req.query);
  const minhas = escopo(req);
  const todas = shipments.list(req.user, minhas, {});

  const doMes = todas.filter((row) => {
    const data = new Date(row.createdAt);
    return data.getMonth() === periodo.mes && data.getFullYear() === periodo.ano;
  });

  const resumo = metrics.buildDashboard(doMes);
  resumo.month = periodo.mes;
  resumo.year = periodo.ano;

  let mesAnterior = periodo.mes - 1;
  let anoAnterior = periodo.ano;
  if (mesAnterior < 0) { mesAnterior = 11; anoAnterior -= 1; }

  const anteriores = todas.filter((row) => {
    const data = new Date(row.createdAt);
    return data.getMonth() === mesAnterior && data.getFullYear() === anoAnterior;
  }).length;

  resumo.previousTotal = anteriores;
  resumo.variation = anteriores ? Math.round(((doMes.length - anteriores) / anteriores) * 100) : null;

  const payload = {
    summary: resumo,
    daily: metrics.buildDaily(doMes, periodo.mes, periodo.ano),
    monthly: metrics.buildMonthly(todas, periodo.ano)
  };

  const gestor = req.user.role === 'manager';

  if (isBroad(req.user.role) || gestor) {
    payload.shifts = shifts.list().map((turno) => {
      const doTurno = doMes.filter((row) => row.shift === turno.code);
      const liberadas = doTurno.filter((row) => metrics.statusOf(row) === 'Liberado');

      return {
        shift: turno.code,
        name: turno.name,
        total: doTurno.length,
        released: liberadas.length,
        averageTotal: metrics.averageOf(liberadas.map((row) => metrics.timesOf(row).total))
      };
    });
  }

  if (isBroad(req.user.role)) {
    payload.ranking = metrics.buildRanking(doMes, users.list());
  }

  payload.occurrences = occurrences.summarySince(
    new Date(periodo.ano, periodo.mes, 1).toISOString()
  );

  res.json(payload);
});

router.get('/export', (req, res) => {
  const rows = shipments.list(req.user, escopo(req), req.query);
  const labels = metrics.STEPS.map((step) => step.label);

  const headers = [
    'Carga', 'Placa', 'Operador', 'Turno', 'Situacao', 'Progresso'
  ].concat(labels).concat([
    'Montagem (min)', 'Espera (min)', 'Fila doca (min)', 'Doca (min)',
    'Carregamento (min)', 'Liberacao (min)', 'Total (min)'
  ]);

  const body = rows.map((row) => {
    const tempos = metrics.timesOf(row);
    const feitas = row.steps.filter((step) => step.at).length;

    const fixos = [
      row.load,
      row.plate,
      row.userName,
      row.shiftName,
      metrics.statusOf(row),
      feitas + '/' + row.steps.length
    ];

    const marcos = row.steps.map((step) => step.at || '');

    const medidas = [
      tempos.assembly,
      tempos.wait,
      tempos.queue,
      tempos.dock,
      tempos.load,
      tempos.release,
      tempos.total
    ];

    return fixos.concat(marcos).concat(medidas);
  });

  const arquivo = 'expedicao-' + new Date().toISOString().slice(0, 10) + '.csv';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=' + arquivo);
  res.send(toCsv(headers, body));
});

module.exports = router;
