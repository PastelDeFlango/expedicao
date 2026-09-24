'use strict';

require('dotenv').config();

const path = require('path');

const config = {
  port: Number(process.env.PORT || 3000),
  env: process.env.NODE_ENV || 'development',
  secret: process.env.JWT_SECRET || 'desenvolvimento-troque-esta-chave',
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  databaseFile: path.resolve(process.cwd(), process.env.DB_FILE || './data/expedicao.db'),
  backupDir: path.resolve(process.cwd(), process.env.BACKUP_DIR || './backups'),
  backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 30),
  goals: {
    assemblyMinutes: 120,
    waitMinutes: 30,
    loadMinutes: 60
  },
  cookieName: 'expedicao_token'
};

module.exports = config;
