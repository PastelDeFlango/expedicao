'use strict';

const test = require('node:test');
const assert = require('node:assert');
const metrics = require('../src/services/metrics');

test('oito etapas com portaria em terceiro', () => {
  assert.strictEqual(metrics.STEPS.length, 8);
  assert.strictEqual(metrics.STEPS[2].key, 'gateIn');
});

test('mapeia colunas', () => {
  assert.strictEqual(metrics.COLUMN_BY_KEY.gateIn, 'gate_in_at');
  assert.strictEqual(metrics.COLUMN_BY_KEY.release, 'release_at');
});

test('calcula tempos', () => {
  const times = metrics.timesOf({
    assembly_start_at: '2026-09-24T08:00:00.000Z',
    assembly_end_at: '2026-09-24T09:00:00.000Z',
    gate_in_at: '2026-09-24T09:20:00.000Z',
    dock_in_at: '2026-09-24T09:40:00.000Z',
    load_start_at: '2026-09-24T09:50:00.000Z',
    load_end_at: '2026-09-24T10:50:00.000Z',
    dock_out_at: '2026-09-24T10:55:00.000Z',
    release_at: '2026-09-24T11:05:00.000Z'
  });

  assert.strictEqual(times.assembly, 60);
  assert.strictEqual(times.wait, 20);
  assert.strictEqual(times.total, 185);
});
