'use strict';

const express = require('express');
const users = require('../services/users');
const shifts = require('../services/shifts');
const audit = require('../services/audit');
const { requireAuth, requireManager, requireSupervisor, isBroad } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/shifts', (req, res) => {
  res.json({ shifts: shifts.list() });
});

router.get('/', requireManager, (req, res) => {
  const broad = isBroad(req.user.role);
  const lista = broad ? users.list() : users.listByShifts(req.shifts);

  res.json({
    users: lista,
    scope: { role: req.user.role, shifts: req.shifts, broad }
  });
});

router.post('/', requireManager, (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  const role = String(body.role || 'operator');
  const broad = isBroad(req.user.role);

  if (!username || !name) {
    return res.status(400).json({ error: 'Informe nome e usuário.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
  }

  const permitidos = [];
  permitidos.push('operator');
  if (broad) permitidos.push('manager', 'supervisor', 'admin');

  if (permitidos.indexOf(role) === -1) {
    return res.status(403).json({ error: 'Você não pode criar este perfil.' });
  }

  const pedidos = Array.isArray(body.shifts) ? body.shifts : [body.primaryShift];
  const validos = pedidos.filter((code) => shifts.isValid(code));

  if (!validos.length) {
    return res.status(400).json({ error: 'Selecione ao menos um turno válido.' });
  }

  if (!broad) {
    const fora = validos.filter((code) => req.shifts.indexOf(code) === -1);
    if (fora.length) {
      return res.status(403).json({ error: 'Você só pode cadastrar em turnos que você acessa.' });
    }
  }

  if (body.cpf && !users.validCpf(body.cpf)) {
    return res.status(400).json({ error: 'CPF inválido.' });
  }

  if (users.cpfTaken(body.cpf)) {
    return res.status(409).json({ error: 'Já existe um cadastro com este CPF.' });
  }

  if (users.xidTaken(body.xid)) {
    return res.status(409).json({ error: 'Já existe um cadastro com este XID.' });
  }

  try {
    const created = users.create({
      username, password, name,
      cpf: body.cpf,
      xid: body.xid,
      registration: body.registration,
      jobTitle: body.jobTitle,
      phone: body.phone,
      hiredAt: body.hiredAt,
      role,
      primaryShift: validos[0],
      shifts: validos
    }, req.user.id);

    audit.log(req.user.id, 'usuario.criado', 'users', created.id, name);

    res.status(201).json({ user: created });
  } catch (error) {
    res.status(409).json({ error: 'Este nome de usuário já existe.' });
  }
});

router.patch('/:id', requireManager, (req, res) => {
  const alvo = users.findById(Number(req.params.id));
  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (!isBroad(req.user.role)) {
    const alvoShifts = users.shiftsOf(alvo.id);
    const podeVer = alvoShifts.some((code) => req.shifts.indexOf(code) > -1);
    if (!podeVer) return res.status(403).json({ error: 'Sem permissão para este usuário.' });
  }

  const body = req.body || {};

  if (body.cpf && !users.validCpf(body.cpf)) {
    return res.status(400).json({ error: 'CPF inválido.' });
  }

  if (users.cpfTaken(body.cpf, alvo.id)) {
    return res.status(409).json({ error: 'Já existe um cadastro com este CPF.' });
  }

  if (users.xidTaken(body.xid, alvo.id)) {
    return res.status(409).json({ error: 'Já existe um cadastro com este XID.' });
  }

  const atualizado = users.update(alvo.id, body);
  audit.log(req.user.id, 'usuario.editado', 'users', alvo.id, atualizado.name);

  res.json({ user: atualizado });
});

router.post('/:id/shifts', requireSupervisor, (req, res) => {
  const code = String((req.body || {}).shift || '');

  if (!shifts.isValid(code)) {
    return res.status(400).json({ error: 'Turno inválido.' });
  }

  const user = users.grantShift(Number(req.params.id), code, req.user.id);
  audit.log(req.user.id, 'turno.autorizado', 'users', user.id, user.name);

  res.json({ user });
});

router.delete('/:id/shifts/:code', requireSupervisor, (req, res) => {
  const user = users.revokeShift(Number(req.params.id), req.params.code);
  audit.log(req.user.id, 'turno.revogado', 'users', user.id, user.name);

  res.json({ user });
});

router.patch('/:id/status', requireManager, (req, res) => {
  const active = Boolean((req.body || {}).active);
  const alvo = users.findById(Number(req.params.id));

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (alvo.id === req.user.id && !active) {
    return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário.' });
  }

  if (!isBroad(req.user.role)) {
    const alvoShifts = users.shiftsOf(alvo.id);
    const podeVer = alvoShifts.some((code) => req.shifts.indexOf(code) > -1);
    if (!podeVer) return res.status(403).json({ error: 'Sem permissão para este usuário.' });
  }

  users.setActive(alvo.id, active);
  audit.log(req.user.id, active ? 'usuario.ativado' : 'usuario.desativado', 'users', alvo.id, alvo.name);

  res.json({ ok: true });
});

module.exports = router;
