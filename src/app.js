'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const authRoutes = require('./routes/auth');
const shipmentRoutes = require('./routes/shipments');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const handoverRoutes = require('./routes/handover');
const auditRoutes = require('./routes/audit');
const backupRoutes = require('./routes/backup');
const closureRoutes = require('./routes/closure');
const metrics = require('./services/metrics');
const shifts = require('./services/shifts');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'expedicao',
    version: '3.0.0',
    env: config.env,
    publicDir: fs.existsSync(publicDir)
  });
});

app.get('/api/steps', (req, res) => {
  res.json({ steps: metrics.STEPS.map((step) => ({ key: step.key, label: step.label })) });
});

app.get('/api/shifts', (req, res) => {
  res.json({ shifts: shifts.list() });
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' }
});

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/handover', handoverRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/closure', closureRoutes);

app.use(express.static(publicDir, { index: false }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso não encontrado.' });
});

app.get('*', (req, res) => {
  const indexFile = path.join(publicDir, 'index.html');

  if (!fs.existsSync(indexFile)) {
    return res.status(500).send('Interface nao encontrada. Verifique a pasta public.');
  }

  res.sendFile(indexFile);
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
