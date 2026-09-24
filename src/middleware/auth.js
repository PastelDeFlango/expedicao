'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const users = require('../services/users');

function issueToken(res, user) {
  const hours = config.sessionHours;
  const token = jwt.sign({ id: user.id }, config.secret, { expiresIn: hours + 'h' });

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: hours * 60 * 60 * 1000
  });
}

function clearToken(res) {
  res.clearCookie(config.cookieName);
}

function requireAuth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies[config.cookieName], config.secret);
    const user = users.findById(payload.id);

    if (!user || !user.active) throw new Error('inativo');

    req.user = user;
    req.shifts = users.shiftsOf(user.id);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

function isBroad(role) {
  return role === 'admin' || role === 'supervisor';
}

function requireManager(req, res, next) {
  const role = req.user.role;
  if (role !== 'manager' && !isBroad(role)) {
    return res.status(403).json({ error: 'Ação exclusiva de gestor ou supervisão.' });
  }
  next();
}

function requireSupervisor(req, res, next) {
  if (!isBroad(req.user.role)) {
    return res.status(403).json({ error: 'Ação exclusiva da supervisão.' });
  }
  next();
}

const requireAdmin = requireSupervisor;

module.exports = {
  issueToken,
  clearToken,
  requireAuth,
  requireManager,
  requireSupervisor,
  requireAdmin,
  isBroad
};
