'use strict';

const express = require('express');
const shipments = require('../services/shipments');
const occurrences = require('../services/occurrences');
const audit = require('../services/audit');
const { requireAuth, isBroad } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function loadAllowed(req, res, next) {
  const row = shipments.findRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Registro não encontrado.' });

  const broad = isBroad(req.user.role);
  const dono = row.user_id === req.user.id;
  const noTurno = req.shifts.indexOf(row.shift_code) > -1;

  if (!broad && !dono && !noTurno) {
    return res.status(403).json({ error: 'Sem permissão para este registro.' });
  }

  req.row = row;
  next();
}

router.get('/', (req, res) => {
  const escopo = isBroad(req.user.role) ? null : req.shifts;
  res.json({ shipments: shipments.list(req.user, escopo, req.query) });
});

router.post('/', (req, res) => {
  const payload = req.body || {};

  if (!String(payload.load || '').trim()) {
    return res.status(400).json({ error: 'Informe o número da carga.' });
  }

  const pedido = payload.shift;
  const permitidos = req.shifts;

  let turno = permitidos.length ? permitidos[0] : null;

  if (pedido) {
    if (permitidos.indexOf(pedido) === -1) {
      return res.status(403).json({ error: 'Você não tem acesso a este turno.' });
    }
    turno = pedido;
  }

  if (!turno) {
    return res.status(400).json({ error: 'Nenhum turno vinculado ao seu usuário.' });
  }

  const created = shipments.create(req.user, payload, turno);
  audit.log(req.user.id, 'carga.criada', 'shipments', created.id, created.load);

  res.status(201).json({ shipment: created });
});

router.patch('/:id/step', loadAllowed, (req, res) => {
  const step = String((req.body || {}).step || '');
  const result = shipments.registerStep(req.row, step);

  if (result.error) return res.status(400).json({ error: result.error });

  audit.log(req.user.id, 'etapa.registrada', 'shipments', result.shipment.id, step);

  res.json({ shipment: result.shipment });
});

router.delete('/:id/step/:step', loadAllowed, (req, res) => {
  const result = shipments.undoStep(req.row, req.params.step);

  if (result.error) return res.status(400).json({ error: result.error });

  audit.log(req.user.id, 'etapa.desfeita', 'shipments', result.shipment.id, req.params.step);

  res.json({ shipment: result.shipment });
});

router.patch('/:id', loadAllowed, (req, res) => {
  const body = req.body || {};
  const campos = [
    ['plate', 'plate'],
    ['driver', 'driver'],
    ['carrier', 'carrier'],
    ['vehicleType', 'vehicle_type'],
    ['client', 'client'],
    ['destination', 'destination'],
    ['dock', 'dock'],
    ['notes', 'notes'],
    ['holdReason', 'hold_reason']
  ];

  const sets = [];
  const params = [];

  for (const par of campos) {
    if (body[par[0]] === undefined) continue;
    sets.push(par[1] + ' = ?');
    const valor = body[par[0]];
    params.push(par[0] === 'plate' ? String(valor).trim().toUpperCase() : valor);
  }

  if (body.quantity !== undefined) {
    sets.push('quantity = ?');
    params.push(body.quantity === '' || body.quantity === null ? null : Number(body.quantity));
  }

  if (body.weight !== undefined) {
    sets.push('weight = ?');
    params.push(body.weight === '' || body.weight === null ? null : Number(body.weight));
  }

  if (sets.length) {
    const db = require('../db');
    params.push(req.row.id);
    db.prepare('UPDATE shipments SET ' + sets.join(', ') + ' WHERE id = ?').run(...params);
  }

  audit.log(req.user.id, 'carga.editada', 'shipments', req.row.id, req.row.load_code);

  res.json({ shipment: shipments.findById(req.row.id) });
});

router.get('/:id/occurrences', loadAllowed, (req, res) => {
  res.json({ occurrences: occurrences.byShipment(req.row.id) });
});

router.post('/:id/occurrences', loadAllowed, (req, res) => {
  const body = req.body || {};

  if (!String(body.category || '').trim()) {
    return res.status(400).json({ error: 'Informe o motivo da ocorrência.' });
  }

  occurrences.create(req.user.id, {
    shipmentId: req.row.id,
    category: body.category,
    detail: body.detail,
    minutesLost: body.minutesLost
  });

  audit.log(req.user.id, 'ocorrencia.criada', 'shipments', req.row.id, body.category);

  res.status(201).json({ occurrences: occurrences.byShipment(req.row.id) });
});

router.delete('/:id', loadAllowed, (req, res) => {
  const broad = isBroad(req.user.role);
  const dono = req.row.user_id === req.user.id;

  if (!broad && !dono) {
    return res.status(403).json({ error: 'Só o autor ou a supervisão pode excluir.' });
  }

  shipments.remove(req.row.id);
  audit.log(req.user.id, 'carga.excluida', 'shipments', req.row.id, req.row.load_code);

  res.json({ ok: true });
});

module.exports = router;
