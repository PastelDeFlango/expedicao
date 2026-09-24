'use strict';

const express = require('express');
const handover = require('../services/handover');
const audit = require('../services/audit');
const { requireAuth, requireManager, isBroad } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const escopo = isBroad(req.user.role) ? null : req.shifts;
  res.json({ handovers: handover.list(40), last: handover.lastFor(escopo || []) });
});

router.post('/', requireManager, (req, res) => {
  const body = req.body || {};
  const de = String(body.fromShift || '');
  const para = String(body.toShift || '');

  if (de && req.shifts.indexOf(de) === -1 && !isBroad(req.user.role)) {
    return res.status(403).json({ error: 'Turno de origem fora do seu acesso.' });
  }

  const created = handover.create(req.user.id, {
    fromShift: de,
    toShift: para,
    summary: body.summary,
    pending: body.pending
  });

  audit.log(req.user.id, 'passagem.criada', 'handovers', created.id, de + ' -> ' + para);

  res.status(201).json({ ok: true });
});

module.exports = router;
