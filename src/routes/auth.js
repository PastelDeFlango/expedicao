'use strict';

const express = require('express');
const users = require('../services/users');
const { issueToken, clearToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  const user = users.findByUsername(username);

  if (!user || !users.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  issueToken(res, user);

  const perfil = users.publicUser(user);
  perfil.allowedShifts = users.shiftsOf(user.id);

  res.json({ user: perfil });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const perfil = users.publicUser(req.user);
  perfil.allowedShifts = req.shifts;

  res.json({ user: perfil });
});

router.post('/change-password', requireAuth, (req, res) => {
  const body = req.body || {};
  const atual = String(body.currentPassword || '');
  const nova = String(body.newPassword || '');

  if (!users.verifyPassword(atual, req.user.password_hash)) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }

  if (nova.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
  }

  users.changePassword(req.user.id, nova);
  res.json({ ok: true });
});

module.exports = router;
