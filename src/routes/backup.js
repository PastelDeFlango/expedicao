'use strict';

const express = require('express');
const fs = require('fs');
const backup = require('../services/backup');
const audit = require('../services/audit');
const { requireAuth, requireSupervisor } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireSupervisor);

router.get('/', (req, res) => {
  res.json({ backups: backup.listar() });
});

router.post('/', async (req, res) => {
  const resultado = await backup.runBackup();

  if (resultado.erro) {
    return res.status(500).json({ error: resultado.erro });
  }

  audit.log(req.user.id, 'backup.criado', 'backup', null, resultado.arquivo);

  res.status(201).json(resultado);
});

router.get('/:arquivo/verificar', (req, res) => {
  const conferencia = backup.verificar('caminho');
  res.json({ conferencia });
});

router.post('/:arquivo/restaurar', (req, res) => {
  const resultado = backup.restaurar(req.params.arquivo);

  if (!resultado.ok) {
    return res.status(400).json({ error: resultado.erro, detalhe: resultado.conferencia });
  }

  audit.log(req.user.id, 'backup.restaurado', 'backup', null, req.params.arquivo);

  res.json(resultado);
});

module.exports = router;
