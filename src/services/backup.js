'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const db = require('../db');
const config = require('../config');

const TABELAS = [
  'users',
  'shifts',
  'user_shifts',
  'shipments',
  'handovers',
  'occurrences',
  'audit'
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function alvoDiario() {
  return path.join(config.backupDir, 'expedicao-' + hoje() + '.db');
}

function limparAntigos() {
  const limite = Date.now() - config.backupRetentionDays * 24 * 60 * 60 * 1000;

  for (const nome of fs.readdirSync(config.backupDir)) {
    const arquivo = path.join(config.backupDir, nome);
    if (fs.statSync(arquivo).mtimeMs < limite) fs.unlinkSync(arquivo);
  }
}

// Abre o arquivo gerado e confere que ele é um banco válido e completo.
function verificar(destino) {
  if (!fs.existsSync(destino)) {
    return { ok: false, erro: 'arquivo nao existe' };
  }

  const tamanho = fs.statSync(destino).size;

  if (tamanho < 1024) {
    return { ok: false, erro: 'arquivo muito pequeno', tamanho };
  }

  let teste = null;

  try {
    teste = new Database(destino, { readonly: true });

    const encontradas = [];

    for (const tabela of TABELAS) {
      const existe = teste.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela);
      if (existe) encontradas.push(tabela);
    }

    const faltando = TABELAS.filter((t) => encontradas.indexOf(t) === -1);

    const contagens = {};
    for (const tabela of encontradas) {
      contagens[tabela] = teste.prepare('SELECT COUNT(*) AS total FROM ' + tabela).get().total;
    }

    const integridade = teste.pragma('integrity_check');

    return {
      ok: faltando.length === 0 && integridade[0].integrity_check === 'ok',
      tamanho,
      tabelas: encontradas.length,
      faltando,
      contagens,
      integridade: integridade[0].integrity_check
    };
  } catch (erro) {
    return { ok: false, erro: erro.message, tamanho };
  } finally {
    if (teste) teste.close();
  }
}

function runBackup() {
  fs.mkdirSync(config.backupDir, { recursive: true });

  const destino = alvoDiario();

  if (fs.existsSync(destino)) {
    const conferencia = verificar(destino);
    return Promise.resolve({ arquivo: destino, skipado: true, conferencia });
  }

  return db
    .backup(destino)
    .then(() => {
      limparAntigos();
      const conferencia = verificar(destino);

      if (!conferencia.ok) {
        console.error('Backup gerado com falha na verificacao:', conferencia);
      }

      return { arquivo: destino, skipado: false, conferencia };
    })
    .catch((erro) => ({ erro: erro.message }));
}

function listar() {
  if (!fs.existsSync(config.backupDir)) return [];

  return fs
    .readdirSync(config.backupDir)
    .filter((nome) => nome.endsWith('.db'))
    .map((nome) => {
      const caminho = path.join(config.backupDir, nome);
      const info = fs.statSync(caminho);

      return {
        arquivo: nome,
        caminho,
        tamanho: info.size,
        criadoEm: info.mtime.toISOString()
      };
    })
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
}

// Restaura um backup sobre o banco em uso, guardando o estado atual antes.
function restaurar(nomeArquivo) {
  const origem = path.join(config.backupDir, path.basename(nomeArquivo));

  if (!fs.existsSync(origem)) {
    return { ok: false, erro: 'backup nao encontrado' };
  }

  const conferencia = verificar(origem);
  if (!conferencia.ok) {
    return { ok: false, erro: 'backup invalido', conferencia };
  }

  const atual = config.databaseFile;
  const seguranca = atual + '.antes-da-restauracao';

  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    if (fs.existsSync(atual)) fs.copyFileSync(atual, seguranca);
    fs.copyFileSync(origem, atual);

    return { ok: true, restaurado: origem, copiaDeSeguranca: seguranca, conferencia };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

function scheduleDaily() {
  const agora = new Date();
  const proximo = new Date(agora);
  proximo.setHours(23, 0, 0, 0);
  if (proximo <= agora) proximo.setDate(proximo.getDate() + 1);

  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, proximo - agora);

  console.log('Backup automatico as 23:00 com verificacao (retencao de ' + config.backupRetentionDays + ' dias).');
}

module.exports = { runBackup, listar, verificar, restaurar, scheduleDaily, limparAntigos, TABELAS };
