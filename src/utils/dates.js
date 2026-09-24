'use strict';

function nowIso() {
  return new Date().toISOString();
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function average(values) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

module.exports = { nowIso, minutesBetween, average, percent };
