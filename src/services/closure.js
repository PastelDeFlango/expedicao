'use strict';

const db = require('../db');
const metrics = require('./metrics');
const shifts = require('./shifts');

const SQL_CARGAS = 'SELECT s.*, u.name AS user_name FROM shipments s LEFT JOIN users u ON u.id = s.user_id WHERE s.shift_code = ? AND s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at';
const SQL_OCORR = 'SELECT o.*, u.name AS user_name FROM occurrences o LEFT JOIN users u ON u.id = o.created_by WHERE o.created_at >= ? AND o.created_at < ? ORDER BY o.id DESC';
const SQL_PENDENTES = 'SELECT s.* FROM shipments s WHERE s.shift_code = ? AND s.release_at IS NULL ORDER BY s.created_at';
const SQL_HANDOVER = 'SELECT h.*, u.name AS user_name FROM handovers h LEFT JOIN users u ON u.id = h.created_by WHERE h.from_shift = ? AND h.created_at >= ? AND h.created_at < ? ORDER BY h.id DESC LIMIT 1';

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function montar(codigoTurno, dataReferencia) {
  const turno = shifts.list().find((s) => s.code === codigoTurno);

  if (!turno) {
    return { erro: 'Turno invalido.' };
  }

  const inicio = inicioDoDia(dataReferencia || new Date());
  const fim = fimDoDia(dataReferencia || new Date());

  const cargas = db.prepare(SQL_CARGAS).all(codigoTurno, inicio.toISOString(), fim.toISOString());

  const resumo = metrics.buildDashboard(cargas.map((c) => ({
    assembly_start_at: c.assembly_start_at,
    assembly_end_at: c.assembly_end_at,
    gate_in_at: c.gate_in_at,
    dock_in_at: c.dock_in_at,
    load_start_at: c.load_start_at,
    load_end_at: c.load_end_at,
    dock_out_at: c.dock_out_at,
    release_at: c.release_at
  })));

  const ocorrencias = db.prepare(SQL_OCORR).all(inicio.toISOString(), fim.toISOString());

  const porCategoria = [];
  for (const o of ocorrencias) {
    const achado = porCategoria.find((x) => x.categoria === o.category);

    if (achado) {
      achado.total += 1;
      achado.minutos += o.minutes_lost || 0;
    } else {
      porCategoria.push({ categoria: o.category, total: 1, minutos: o.minutes_lost || 0 });
    }
  }

  const pendentes = db.prepare(SQL_PENDENTES).all(codigoTurno);
  const passagem = db.prepare(SQL_HANDOVER).get(codigoTurno, inicio.toISOString(), fim.toISOString()) || null;

  const lista = cargas.map((c) => {
    const tempos = metrics.timesOf({
      assembly_start_at: c.assembly_start_at,
      assembly_end_at: c.assembly_end_at,
      gate_in_at: c.gate_in_at,
      dock_in_at: c.dock_in_at,
      load_start_at: c.load_start_at,
      load_end_at: c.load_end_at,
      dock_out_at: c.dock_out_at,
      release_at: c.release_at
    });

    return {
      carga: c.load_code,
      placa: c.plate || '',
      operador: c.user_name || '',
      status: metrics.statusOf({
        assembly_start_at: c.assembly_start_at,
        assembly_end_at: c.assembly_end_at,
        gate_in_at: c.gate_in_at,
        dock_in_at: c.dock_in_at,
        load_start_at: c.load_start_at,
        load_end_at: c.load_end_at,
        dock_out_at: c.dock_out_at,
        release_at: c.release_at
      }),
      criadaEm: c.created_at,
      montagem: tempos.assembly,
      espera: tempos.wait,
      carregamento: tempos.load,
      total: tempos.total
    };
  });

  return {
    turno: { codigo: turno.code, nome: turno.name, inicio: turno.starts_at, fim: turno.ends_at },
    data: inicio.toISOString().slice(0, 10),
    geradoEm: new Date().toISOString(),
    resumo,
    cargas: lista,
    ocorrencias: porCategoria,
    pendentes: pendentes.map((p) => ({
      carga: p.load_code,
      placa: p.plate || '',
      etapaAtual: metrics.statusOf({
        assembly_start_at: p.assembly_start_at,
        assembly_end_at: p.assembly_end_at,
        gate_in_at: p.gate_in_at,
        dock_in_at: p.dock_in_at,
        load_start_at: p.load_start_at,
        load_end_at: p.load_end_at,
        dock_out_at: p.dock_out_at,
        release_at: p.release_at
      })
    })),
    passagem: passagem ? { resumo: passagem.summary, pendencias: passagem.pending, autor: passagem.user_name } : null
  };
}

module.exports = { montar };
