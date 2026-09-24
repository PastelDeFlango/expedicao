'use strict';

const express = require('express');
const closure = require('../services/closure');
const shifts = require('../services/shifts');
const { requireAuth, requireManager, isBroad } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireManager, (req, res) => {
  const codigo = String(req.query.shift || '');
  const data = req.query.date || new Date().toISOString().slice(0, 10);

  if (!codigo) {
    return res.status(400).json({ error: 'Informe o turno.' });
  }

  if (!isBroad(req.user.role) && req.shifts.indexOf(codigo) === -1) {
    return res.status(403).json({ error: 'Sem acesso a este turno.' });
  }

  const dados = closure.montar(codigo, data);

  if (dados.erro) return res.status(400).json({ error: dados.erro });

  res.json(dados);
});

router.get('/disponiveis', requireManager, (req, res) => {
  const meus = isBroad(req.user.role) ? shifts.list() : shifts.list().filter((s) => req.shifts.indexOf(s.code) > -1);
  res.json({ shifts: meus });
});

module.exports = router;
