'use strict';

const express = require('express');
const audit = require('../services/audit');
const { requireAuth, requireSupervisor } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireSupervisor);

router.get('/', (req, res) => {
  res.json({ entries: audit.list(req.query.limit) });
});

module.exports = router;
