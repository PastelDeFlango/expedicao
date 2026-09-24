(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const FALLBACK_STEPS = [
    { key: 'assemblyStart', label: 'Início da montagem de carga' },
    { key: 'assemblyEnd', label: 'Fim da montagem de carga' },
    { key: 'gateIn', label: 'Chegada na portaria' },
    { key: 'dockIn', label: 'Veículo docado' },
    { key: 'loadStart', label: 'Início do carregamento' },
    { key: 'loadEnd', label: 'Fim do carregamento' },
    { key: 'dockOut', label: 'Saída da doca' },
    { key: 'release', label: 'Liberação do veículo' }
  ];

  const TONES = {
    'Aguardando': 'tone-wait',
    'Montagem de carga': 'tone-mount',
    'Aguardando doca': 'tone-gate',
    'Em carregamento': 'tone-load',
    'Aguardando saída': 'tone-out',
    'Liberado': 'tone-done'
  };

  const ROLE_LABEL = {
    admin: 'Administrador',
    supervisor: 'Supervisão',
    manager: 'Gestor de turno',
    operator: 'Operador'
  };

  let me = null;
  let steps = FALLBACK_STEPS.slice();
  let shifts = [];
  let records = [];
  let team = [];
  let activeId = null;
  let expanded = false;
  const charts = {};
  let toastTimer = null;

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  const when = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  };

  const hour = (v) => {
    if (!v) return '--:--';
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(v));
  };

  const between = (a, b) => (a && b) ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null;

  const dur = (v) => {
    if (v === null || v === undefined) return '—';
    if (v < 60) return v + ' min';
    const h = Math.floor(v / 60);
    const m = v % 60;
    return h + 'h' + (m ? ' ' + String(m).padStart(2, '0') + 'min' : '');
  };

  const initials = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

  function toast(msg, bad) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  async function api(url, opt) {
    const conf = opt || {};
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(conf.headers || {}) },
      ...conf
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Não foi possível concluir.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const isBroad = () => me && (me.role === 'admin' || me.role === 'supervisor');
  const isManagerUp = () => me && (me.role === 'manager' || isBroad());
  const myShifts = () => (me && me.allowedShifts) || [];

  const val = (id) => {
    const el = $('#' + id);
    return el ? el.value.trim() : '';
  };

  function timesOf(rec) {
    const at = (k) => (rec.steps.find((s) => s.key === k) || {}).at || null;
    return {
      assembly: between(at('assemblyStart'), at('assemblyEnd')),
      wait: between(at('assemblyEnd'), at('gateIn')),
      queue: between(at('gateIn'), at('dockIn')),
      dock: between(at('dockIn'), at('dockOut')),
      load: between(at('loadStart'), at('loadEnd')),
      release: between(at('loadEnd'), at('release')),
      total: between(at('assemblyStart'), at('release'))
    };
  }

  function statusOf(rec) {
    const has = (k) => Boolean((rec.steps.find((s) => s.key === k) || {}).at);
    if (has('release')) return 'Liberado';
    if (has('loadEnd') && !has('dockOut')) return 'Aguardando saída';
    if (has('dockIn') && !has('loadEnd')) return 'Em carregamento';
    if (has('gateIn') && !has('dockIn')) return 'Aguardando doca';
    if (has('assemblyStart')) return 'Montagem de carga';
    return 'Aguardando';
  }

  function progressOf(rec) {
    const done = rec.steps.filter((s) => s.at).length;
    const total = rec.steps.length || 1;
    return { done, total, percent: Math.round((done / total) * 100) };
  }

  function query() {
    const p = new URLSearchParams();
    const s = $('#shiftFilter');
    if (s && s.value) p.set('shift', s.value);
    return p;
  }

  /* ---------- gráficos ---------- */

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 8, padding: 16, color: '#516074', font: { size: 12 } } },
        tooltip: { padding: 12, backgroundColor: '#08182c', cornerRadius: 10 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { precision: 0, color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,.16)' } }
      }
    };
  }

  function draw(id, type, data, options) {
    if (typeof Chart === 'undefined' || !$('#' + id)) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($('#' + id), { type, data, options });
  }

  function renderDashboard(data) {
    const s = data.summary;

    $('#pageTitle').textContent = isBroad() ? 'Painel de supervisão' : (isManagerUp() ? 'Painel do gestor' : 'Painel do ' + (me.primaryShift || ''));
    $('#periodText').textContent = MONTHS[s.month] + ' de ' + s.year;

    $('#mTotal').textContent = s.total;
    $('#mRelease').textContent = s.releaseRate + '%';
    $('#mReleased').textContent = s.released + (s.released === 1 ? ' veículo liberado' : ' veículos liberados');
    $('#mTotalTime').textContent = dur(s.averageTotal);
    $('#mAssembly').textContent = dur(s.averageAssembly);
    $('#mOpen').textContent = s.open;
    $('#mOpenDetail').textContent = s.pickers ? s.pickers + ' com montagem concluída' : 'Nenhuma carga montada';

    const cmp = $('#mCompare');
    if (s.variation === null) {
      cmp.className = '';
      cmp.textContent = 'Sem base no mês anterior';
    } else {
      cmp.className = s.variation >= 0 ? 'up' : 'down';
      cmp.textContent = (s.variation >= 0 ? '+' : '') + s.variation + '% em relação ao mês anterior';
    }

    $('#efficiency').innerHTML = [
      ['Liberações concluídas', s.releaseRate],
      ['Montagem até 120 min', s.assemblyOnTarget],
      ['Carregamento até 60 min', s.loadOnTarget],
      ['Espera até 30 min', s.waitOnTarget]
    ].map((p) => '<div class="progress-row"><div class="line"><span>' + p[0] + '</span><b>' + p[1] + '%</b></div>'
      + '<div class="track"><div class="fill" style="width:' + p[1] + '%"></div></div></div>').join('');

    draw('dailyChart', 'line', {
      labels: data.daily.labels,
      datasets: [
        { label: 'Novas cargas', data: data.daily.requests, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.12)', fill: true, tension: .36, pointRadius: 2, borderWidth: 2 },
        { label: 'Liberações', data: data.daily.releases, borderColor: '#14b8a6', tension: .36, pointRadius: 2, borderWidth: 2 }
      ]
    }, baseOptions());

    const cores = ['#f59e0b', '#0891b2', '#8b5cf6', '#3b82f6', '#eab308', '#14b8a6'];

    draw('statusChart', 'doughnut', {
      labels: s.byStatus.map((i) => i.status),
      datasets: [{ data: s.byStatus.map((i) => i.total), backgroundColor: s.byStatus.map((i, x) => cores[x % cores.length]), borderColor: '#fff', borderWidth: 4 }]
    }, {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 15, color: '#516074' } } }
    });

    const anual = baseOptions();
    anual.scales.y1 = { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: '#64748b' } },

    draw('annualChart', 'bar', {
      labels: MONTHS.map((m) => m.slice(0, 3)),
      datasets: [
        { label: 'Cargas', data: data.monthly.volume, backgroundColor: 'rgba(59,130,246,.85)', borderRadius: 7, maxBarThickness: 30 },
        { type: 'line', label: 'Tempo médio', data: data.monthly.averages, borderColor: '#6366f1', tension: .3, pointRadius: 3, borderWidth: 2, yAxisID: 'y1' }
      ]
    }, anual);

    draw('stageChart', 'bar', {
      labels: ['Montagem', 'Espera', 'Fila', 'Doca', 'Carga', 'Liberação'],
      datasets: [{
        label: 'Média (min)',
        data: [s.averageAssembly, s.averageWait, s.averageQueue, s.averageDock, s.averageLoad, s.averageRelease],
        backgroundColor: ['#0891b2', '#8b5cf6', '#6366f1', '#3b82f6', '#14b8a6', '#06b6d4'],
        borderRadius: 7, maxBarThickness: 38
      }]
    }, baseOptions());

    renderShiftChart(data.shifts);
    renderRanking(data.ranking);
    renderOccurrences(data.occurrences);
  }

  function renderShiftChart(lista) {
    const box = $('#shiftChart');
    if (!box) return;

    if (!lista || !lista.length) {
      const alvo = box.parentElement;
      if (alvo) alvo.innerHTML = '<div class="empty">Disponível para gestor e supervisão.</div>';
      return;
    }

    const opt = baseOptions();
    opt.scales.y1 = {
      position: 'right',
      beginAtZero: true,
      grid: { drawOnChartArea: false },
      ticks: { color: '#64748b', font: { size: 11 } },
      title: { display: true, text: 'Minutos', color: '#64748b' }
    };

    draw('shiftChart', 'bar', {
      labels: lista.map((i) => i.name),
      datasets: [
        { label: 'Cargas expedidas', data: lista.map((i) => i.total), backgroundColor: '#3b82f6', borderRadius: 7, maxBarThickness: 52 },
        { type: 'line', label: 'Tempo médio (min)', data: lista.map((i) => i.averageTotal), borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderWidth: 3, tension: .3, pointRadius: 5, yAxisID: 'y1' }
      ]
    }, opt);
  }

  function renderRanking(lista) {
    const box = $('#ranking');
    if (!box) return;

    if (!isBroad()) {
      box.innerHTML = '<div class="empty">Visível para a supervisão.</div>';
      return;
    }

    if (!lista || !lista.length) {
      box.innerHTML = '<div class="empty">Nenhum lançamento no período.</div>';
      return;
    }

    box.innerHTML = lista.map((u, i) =>
      '<div class="rank"><i>' + (i + 1) + '</i><div><b>' + esc(u.name) + '</b>'
      + '<small>' + esc(u.shift) + ' · ' + u.releaseRate + '% liberado · média ' + dur(u.averageTotal) + '</small></div>'
      + '<span class="value">' + u.total + '</span></div>').join('');
  }

  function renderOccurrences(lista) {
    const box = $('#occurrencesBox');
    if (!box) return;

    if (!lista || !lista.length) {
      box.innerHTML = '<div class="empty">Nenhuma ocorrência registrada no período.</div>';
      return;
    }

    box.innerHTML = lista.map((o) =>
      '<div class="rank"><i>!</i><div><b>' + esc(o.category) + '</b>'
      + '<small>' + o.total + ' registro(s) · ' + (o.minutos || 0) + ' min perdidos</small></div>'
      + '<span class="value">' + o.total + '</span></div>').join('');
  }

  function renderBanner(data) {
    const box = $('#shiftBanner');
    if (!box) return;

    const pend = data.last;

    if (!pend) {
      box.className = 'banner hidden';
      return;
    }

    box.className = 'banner';
    box.innerHTML = '<b>Passagem recebida</b>'
      + '<span>' + esc(pend.from_shift) + ' → ' + esc(pend.to_shift) + ' · ' + when(pend.created_at) + ' por ' + esc(pend.user_name || '—') + '</span>'
      + (pend.pending ? '<p><strong>Pendências:</strong> ' + esc(pend.pending) + '</p>' : '')
      + (pend.summary ? '<p>' + esc(pend.summary) + '</p>' : '');
  }

  function renderShiftTable(rec) {
    const t = timesOf(rec);
    const st = statusOf(rec);
    const pr = progressOf(rec);

    return '<tr>'
      + '<td><b>' + esc(rec.load) + '</b></td>'
      + '<td>' + (rec.plate ? esc(rec.plate) : '<span class="muted">a definir</span>') + '</td>'
      + '<td>' + esc(rec.userName || '—') + '</td>'
      + '<td>' + esc(rec.shiftName || rec.shift) + '</td>'
      + '<td><span class="status ' + (TONES[st] || 'tone-wait') + '">' + st + '</span></td>'
      + '<td><div class="progress-mini"><div class="track"><div class="fill" style="width:' + pr.percent + '%"></div></div><span>' + pr.done + '/' + pr.total + '</span></div></td>'
      + '<td>' + dur(t.assembly) + '</td>'
      + '<td>' + dur(t.wait) + '</td>'
      + '<td>' + dur(t.load) + '</td>'
      + '<td>' + dur(t.total) + '</td>'
      + '<td><button class="btn small primary" data-stage="' + rec.id + '">Abrir</button> '
      + '<button class="btn small danger" data-delete="' + rec.id + '">Excluir</button></td>'
      + '</tr>';
  }

  function renderTable() {
    const termo = ($('#search').value || '').toLowerCase().trim();
    const filtro = $('#statusFilter').value;

    const lista = records.filter((r) => {
      const texto = [r.load, r.plate, r.driver, r.carrier, r.client, r.destination, r.dock, r.userName].join(' ').toLowerCase();
      return (!termo || texto.includes(termo)) && (!filtro || statusOf(r) === filtro);
    });

    $('#tbody').innerHTML = lista.map(renderShiftTable).join('');
    $('#empty').style.display = lista.length ? 'none' : 'block';
  }

  /* ---------- modal de etapas ---------- */

  function renderStage() {
    const rec = records.find((r) => r.id === activeId);
    if (!rec) return;

    const pr = progressOf(rec);
    const st = statusOf(rec);
    const t = timesOf(rec);
    const idx = rec.steps.findIndex((s) => !s.at);
    const atual = idx === -1 ? null : rec.steps[idx];

    $('#stageMark').textContent = rec.plate ? rec.plate.slice(0, 5) : 'MONT';
    $('#stageTitle').textContent = 'Carga ' + rec.load;
    $('#stageSubtitle').textContent = [
      rec.plate || 'veículo a definir',
      rec.shiftName || rec.shift,
      rec.userName
    ].filter(Boolean).join(' · ');

    const badge = $('#stageStatus');
    badge.className = 'status ' + (TONES[st] || 'tone-wait');
    badge.textContent = st;

    $('#stageBar').style.width = pr.percent + '%';
    $('#stageProgressText').textContent = pr.done + ' de ' + pr.total + ' etapas registradas';
    $('#stageProgressHint').textContent = atual ? 'Próxima: ' + atual.label : 'Fluxo concluído';

    const total = rec.steps.length;
    const inicio = expanded || idx === -1 ? 0 : Math.max(0, Math.min(idx - 1, total - 4));
    const visiveis = rec.steps.slice(inicio, expanded ? total : inicio + 4);

    $('#timeline').innerHTML = visiveis.map((s) => {
      const pos = rec.steps.indexOf(s);
      const feito = Boolean(s.at);
      const cur = pos === idx;

      return '<div class="timeline-item ' + (feito ? 'done' : cur ? 'current' : 'locked') + '">'
        + '<div class="timeline-dot">' + (feito ? '✓' : pos + 1) + '</div>'
        + '<div class="timeline-text"><b>' + esc(s.label) + '</b>'
        + '<small>' + (feito ? 'Registrado ' + when(s.at) : cur ? 'Próxima etapa' : 'Aguardando etapa anterior') + '</small></div>'
        + '<div class="timeline-time">' + (feito ? hour(s.at) : '--:--')
        + (feito && pos > 0 ? '<button class="undo-step" data-undo="' + s.key + '">desfazer</button>' : '') + '</div>'
        + '</div>';
    }).join('');

    if (total > 4) {
      $('#timeline').insertAdjacentHTML('beforeend',
        '<button class="btn small block" id="toggleSteps" type="button">'
        + (expanded ? 'Mostrar apenas o trecho atual' : 'Ver todas as ' + total + ' etapas') + '</button>');
    }

    $('#advance').textContent = atual ? 'Registrar: ' + atual.label : 'Fluxo concluído';
    $('#advance').disabled = !atual;

    const ultima = rec.steps.slice().reverse().find((s) => s.at);
    $('#undo').disabled = !ultima;
    $('#undo').dataset.step = ultima ? ultima.key : '';

    const pares = [
      ['Montagem da carga', dur(t.assembly)],
      ['Espera do veículo', dur(t.wait)],
      ['Fila para docar', dur(t.queue)],
      ['Ocupação da doca', dur(t.dock)],
      ['Carregamento', dur(t.load)],
      ['Liberação após carga', dur(t.release)],
      ['Tempo total', dur(t.total)],
      ['Etapas concluídas', pr.done + '/' + pr.total]
    ];

    $('#summary').innerHTML = pares.map((p) =>
      '<div><small>' + p[0] + '</small><b class="' + (p[1] === '—' ? 'pending' : '') + '">' + p[1] + '</b></div>').join('');

    const dados = [
      ['Placa', rec.plate],
      ['Motorista', rec.driver],
      ['Transportadora', rec.carrier],
      ['Doca', rec.dock],
      ['Cliente', rec.client],
      ['Destino', rec.destination],
      ['Peso (kg)', rec.weight],
      ['Motivo de retenção', rec.holdReason]
    ];

    $('#detailsBody').innerHTML = dados.map((d) =>
      '<div class="row"><span>' + d[0] + '</span><b class="' + (d[1] ? '' : 'muted') + '">'
      + (d[1] ? esc(d[1]) : 'não informado') + '</b></div>').join('');

    loadOccurrences(rec.id);
  }

  async function loadOccurrences(id) {
    const box = $('#shipmentOccurrences');
    if (!box) return;

    try {
      const data = await api('/api/shipments/' + id + '/occurrences');

      if (!data.occurrences.length) {
        box.innerHTML = '<div class="row"><span>Nenhuma ocorrência</span><b class="muted">—</b></div>';
        return;
      }

      box.innerHTML = data.occurrences.map((o) =>
        '<div class="row"><span>' + esc(o.category) + '</span><b>' + o.minutes_lost + ' min</b></div>').join('');
    } catch (e) {
      box.innerHTML = '<div class="row"><span>Não foi possível carregar</span><b class="muted">—</b></div>';
    }
  }

  function openStages(id) {
    const rec = records.find((r) => r.id === Number(id));
    if (!rec) return;
    activeId = rec.id;
    expanded = false;
    renderStage();
    $('#stageModal').showModal();
  }

  /* ---------- equipe ---------- */

  function renderTeam() {
    $('#teamScope').textContent = isBroad()
      ? 'Todos os turnos'
      : 'Turnos: ' + myShifts().map((c) => shiftName(c)).join(', ');

    $('#usersBody').innerHTML = team.map((u) =>
      '<tr>'
      + '<td><b>' + esc(u.name) + '</b><br><small class="muted">' + esc(u.jobTitle || '') + '</small></td>'
      + '<td>' + esc(u.username) + '</td>'
      + '<td>' + esc(u.cpf || '—') + '</td>'
      + '<td>' + esc(u.xid || '—') + '</td>'
      + '<td>' + (ROLE_LABEL[u.role] || u.role) + '</td>'
      + '<td>' + (u.allowedShifts || []).map(shiftName).join(', ') + '</td>'
      + '<td><span class="status ' + (u.active ? 'tone-done' : 'tone-wait') + '">' + (u.active ? 'Ativo' : 'Inativo') + '</span></td>'
      + '<td><button class="btn small" data-user-shift="' + u.id + '">Turnos</button> '
      + '<button class="btn small" data-user-status="' + u.id + '" data-active="' + (!u.active) + '">'
      + (u.active ? 'Desativar' : 'Ativar') + '</button></td>'
      + '</tr>').join('');
  }

  const shiftName = (code) => (shifts.find((s) => s.code === code) || {}).name || code;

  /* ---------- passagem de turno ---------- */

  function renderHandovers(data) {
    const box = $('#handoverList');

    if (!data.handovers.length) {
      box.innerHTML = '<div class="empty">Nenhuma passagem registrada.</div>';
    } else {
      box.innerHTML = data.handovers.map((h) =>
        '<div class="rank"><i>⇄</i><div><b>' + shiftName(h.from_shift) + ' → ' + shiftName(h.to_shift) + '</b>'
        + '<small>' + when(h.created_at) + ' · ' + esc(h.user_name || '—') + '</small>'
        + (h.pending ? '<small><strong>Pendência:</strong> ' + esc(h.pending) + '</small>' : '')
        + '</div></div>').join('');
    }

    const ultima = data.last;
    const cx = $('#lastHandover');

    if (!ultima) {
      cx.innerHTML = '<div class="empty">Nenhuma passagem endereçada ao seu turno.</div>';
      return;
    }

    cx.innerHTML = '<div class="handover-head"><b>' + shiftName(ultima.from_shift) + ' → ' + shiftName(ultima.to_shift) + '</b>'
      + '<span>' + when(ultima.created_at) + ' · ' + esc(ultima.user_name || '—') + '</span></div>'
      + (ultima.pending ? '<p><strong>Pendências:</strong> ' + esc(ultima.pending) + '</p>' : '')
      + (ultima.summary ? '<p>' + esc(ultima.summary) + '</p>' : '');
  }

  function renderAudit(lista) {
    const box = $('#auditBody');

    if (!lista.length) {
      box.innerHTML = '<div class="empty">Nenhum registro de auditoria.</div>';
      return;
    }

    box.innerHTML = lista.map((a) =>
      '<div class="rank"><i>•</i><div><b>' + esc(a.action) + '</b>'
      + '<small>' + when(a.created_at) + ' · ' + esc(a.user_name || '—') + (a.detail ? ' · ' + esc(a.detail) : '') + '</small></div></div>').join('');
  }

  /* ---------- dados ---------- */

  function buildFilters() {
    const now = new Date();

    $('#monthFilter').innerHTML = MONTHS.map((m, i) => '<option value="' + i + '">' + m + '</option>').join('');
    $('#yearFilter').innerHTML = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]
      .map((y) => '<option>' + y + '</option>').join('');

    $('#monthFilter').value = now.getMonth();
    $('#yearFilter').value = now.getFullYear();

    const meus = myShifts();
    $('#shiftFilter').innerHTML = '<option value="">Todos os turnos</option>'
      + shifts.filter((s) => meus.length === 0 || meus.includes(s.code))
        .map((s) => '<option value="' + s.code + '">' + s.name + '</option>').join('');

    $('#loadShift').innerHTML = shifts.filter((s) => meus.includes(s.code))
      .map((s) => '<option value="' + s.code + '">' + s.name + '</option>').join('');

    $('#fromShift').innerHTML = shifts.filter((s) => meus.includes(s.code))
      .map((s) => '<option value="' + s.code + '">' + s.name + '</option>').join('');

    $('#toShift').innerHTML = shifts.map((s) => '<option value="' + s.code + '">' + s.name + '</option>').join('');

    $('#userShifts').innerHTML = shifts.filter((s) => meus.length === 0 || meus.includes(s.code))
      .map((s) => '<label class="check-item"><input type="checkbox" value="' + s.code + '">' + s.name + '</label>').join('');

    const papel = $('#userRole');
    if (papel) {
      papel.querySelector('option[value="supervisor"]').disabled = !isBroad();
      papel.querySelector('option[value="admin"]').disabled = !(me && me.role === 'admin');
      papel.querySelector('option[value="manager"]').disabled = !isBroad();
    }
  }

  async function loadAll() {
    const q = query();
    q.set('month', $('#monthFilter').value);
    q.set('year', $('#yearFilter').value);

    const cab = {};
    const [lista, painel, passagem] = await Promise.all([
      api('/api/shipments?' + q.toString()),
      api('/api/reports/dashboard?' + q.toString()),
      api('/api/handover').catch(() => ({ handovers: [], last: null }))
    ]);

    records = lista.shipments;
    renderTable();
    renderDashboard(painel);
    renderHandovers(passagem);
    renderBanner(passagem);

    if ($('#stageModal').open) renderStage();
  }

  async function loadTeam() {
    if (!isManagerUp()) return;
    const data = await api('/api/users');
    team = data.users;
    renderTeam();
  }

  async function loadAudit() {
    const data = await api('/api/audit?limit=120');
    renderAudit(data.entries);
  }

  async function refresh() {
    await loadAll();
    if (isManagerUp()) await loadTeam();
  }

  /* ---------- navegação ---------- */

  function showPage(nome) {
    $$('.nav').forEach((b) => b.classList.toggle('active', b.dataset.page === nome));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + nome));

    if (nome === 'team') loadTeam();
    if (nome === 'audit') loadAudit();
    if (nome === 'closure') loadClosure();
    if (nome === 'backup') loadBackups();
    if (nome === 'handover') api('/api/handover').then(renderHandovers).catch(() => {});
  }

  /* ---------- eventos ---------- */

  function bind() {
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: val('loginUser'), password: $('#loginPass').value })
        });
        $('#loginError').textContent = '';
        startSession(data.user);
      } catch (err) {
        $('#loginError').textContent = err.message;
      }
    });

    $('#logout').addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      window.location.reload();
    });

    $('#changePassword').addEventListener('click', () => $('#passwordModal').showModal());
    $('#newRecord').addEventListener('click', () => $('#recordModal').showModal());
    $('#newUser').addEventListener('click', () => $('#userModal').showModal());
    $('#newHandover').addEventListener('click', () => $('#handoverModal').showModal());
    $('#newOccurrence').addEventListener('click', () => $('#occurrenceModal').showModal());

    $$('[data-close]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.close).close()));
    $$('.nav').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

    $('#monthFilter').addEventListener('change', loadAll);
    $('#yearFilter').addEventListener('change', loadAll);
    $('#shiftFilter').addEventListener('change', loadAll);
    $('#search').addEventListener('input', renderTable);
    $('#statusFilter').addEventListener('change', renderTable);

    $('#exportCsv').addEventListener('click', () => {
      window.location.href = '/api/reports/export?' + query().toString();
    });

    $('#dPlate') && $('#dPlate').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    });

    $('#recordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/shipments', {
          method: 'POST',
          body: JSON.stringify({
            load: val('load'),
            shift: val('loadShift'),
            client: val('client'),
            destination: val('destination'),
            notes: val('notes')
          })
        });
        e.target.reset();
        $('#recordModal').close();
        await refresh();
        toast('Montagem de carga iniciada.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#tbody').addEventListener('click', async (e) => {
      const abrir = e.target.closest('[data-stage]');
      const excluir = e.target.closest('[data-delete]');

      if (abrir) return openStages(abrir.dataset.stage);

      if (excluir) {
        const rec = records.find((r) => r.id === Number(excluir.dataset.delete));
        if (!rec || !window.confirm('Excluir a carga ' + rec.load + '?')) return;
        try {
          await api('/api/shipments/' + rec.id, { method: 'DELETE' });
          await refresh();
          toast('Registro excluído.');
        } catch (err) {
          toast(err.message, true);
        }
      }
    });

    $('#advance').addEventListener('click', async () => {
      const rec = records.find((r) => r.id === activeId);
      if (!rec || !rec.nextStep) return;
      try {
        await api('/api/shipments/' + rec.id + '/step', { method: 'PATCH', body: JSON.stringify({ step: rec.nextStep }) });
        await refresh();
        toast('Etapa registrada.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#undo').addEventListener('click', async () => {
      const key = $('#undo').dataset.step;
      if (!key) return;
      try {
        await api('/api/shipments/' + activeId + '/step/' + key, { method: 'DELETE' });
        await refresh();
        toast('Etapa desfeita.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#timeline').addEventListener('click', async (e) => {
      if (e.target.closest('#toggleSteps')) {
        expanded = !expanded;
        return renderStage();
      }

      const rev = e.target.closest('[data-undo]');
      if (rev) {
        try {
          await api('/api/shipments/' + activeId + '/step/' + rev.dataset.undo, { method: 'DELETE' });
          await refresh();
          toast('Etapa desfeita.');
        } catch (err) {
          toast(err.message, true);
        }
      }
    });

    $('#editDetails').addEventListener('click', () => {
      const rec = records.find((r) => r.id === activeId);
      if (!rec) return;

      $('#dPlate').value = rec.plate || '';
      $('#dDriver').value = rec.driver || '';
      $('#dCarrier').value = rec.carrier || '';
      $('#dVehicleType').value = rec.vehicleType || '';
      $('#dDock').value = rec.dock || '';
      $('#dQuantity').value = rec.quantity === null ? '' : rec.quantity;
      $('#dWeight').value = rec.weight === null ? '' : rec.weight;
      $('#dHoldReason').value = rec.holdReason || '';

      $('#detailsModal').showModal();
    });

    $('#detailsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/shipments/' + activeId, {
          method: 'PATCH',
          body: JSON.stringify({
            plate: val('dPlate'), driver: val('dDriver'), carrier: val('dCarrier'),
            vehicleType: val('dVehicleType'), dock: val('dDock'),
            quantity: val('dQuantity'), weight: val('dWeight'),
            holdReason: val('dHoldReason')
          })
        });
        $('#detailsModal').close();
        await refresh();
        toast('Dados do veículo atualizados.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#occurrenceForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/shipments/' + activeId + '/occurrences', {
          method: 'POST',
          body: JSON.stringify({
            category: val('occCategory'),
            detail: val('occDetail'),
            minutesLost: val('occMinutes')
          })
        });
        e.target.reset();
        $('#occurrenceModal').close();
        renderStage();
        await refresh();
        toast('Ocorrência registrada.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#userForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const marcados = [...document.querySelectorAll('#userShifts input:checked')].map((i) => i.value);

      if (!marcados.length) {
        toast('Selecione ao menos um turno.', true);
        return;
      }

      try {
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: val('userName'),
            username: val('userUsername'),
            password: $('#userPassword').value,
            cpf: val('userCpf'),
            xid: val('userXid'),
            registration: val('userRegistration'),
            jobTitle: val('userJobTitle'),
            phone: val('userPhone'),
            hiredAt: val('userHiredAt'),
            role: val('userRole'),
            primaryShift: marcados[0],
            shifts: marcados
          })
        });

        e.target.reset();
        $('#userModal').close();
        await loadTeam();
        toast('Funcionário cadastrado.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#usersBody').addEventListener('click', async (e) => {
      const status = e.target.closest('[data-user-status]');
      const turnos = e.target.closest('[data-user-shift]');

      if (status) {
        try {
          await api('/api/users/' + status.dataset.userStatus + '/status', {
            method: 'PATCH',
            body: JSON.stringify({ active: status.dataset.active === 'true' })
          });
          await loadTeam();
          toast('Status atualizado.');
        } catch (err) {
          toast(err.message, true);
        }
        return;
      }

      if (turnos) {
        if (!isBroad()) {
          toast('Apenas a supervisão autoriza turno extra.', true);
          return;
        }

        const pessoa = team.find((u) => u.id === Number(turnos.dataset.userShift));
        const livres = shifts.filter((s) => !(pessoa.allowedShifts || []).includes(s.code));

        if (!livres.length) {
          toast('Este usuário já acessa todos os turnos.');
          return;
        }

        const escolha = window.prompt('Autorizar qual turno para ' + pessoa.name + '?\n' + livres.map((s) => s.code + ' = ' + s.name).join('\n'));
        const alvo = livres.find((s) => s.code === escolha || s.name === escolha);

        if (!alvo) return;

        try {
          await api('/api/users/' + pessoa.id + '/shifts', {
            method: 'POST',
            body: JSON.stringify({ shift: alvo.code })
          });
          await loadTeam();
          toast('Turno autorizado.');
        } catch (err) {
          toast(err.message, true);
        }
      }
    });

    $('#handoverForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/handover', {
          method: 'POST',
          body: JSON.stringify({
            fromShift: val('fromShift'),
            toShift: val('toShift'),
            summary: val('hoSummary'),
            pending: val('hoPending')
          })
        });
        e.target.reset();
        $('#handoverModal').close();
        await loadAll();
        toast('Passagem registrada.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#passwordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword: $('#currentPassword').value, newPassword: $('#newPassword').value })
        });
        e.target.reset();
        $('#passwordModal').close();
        toast('Senha alterada.');
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  /* ---------- inicialização ---------- */

  async function bootstrap() {
    const dados = await api('/api/steps');
    if (Array.isArray(dados.steps) && dados.steps.length) steps = dados.steps;

    const lista = await api('/api/shifts');
    shifts = lista.shifts;

    buildFilters();
    fillClosureFilters();
    bindClosureAndBackup();

    $$('.manager-only').forEach((el) => el.classList.toggle('hidden', !isManagerUp()));
    $$('.broad-only').forEach((el) => el.classList.toggle('hidden', !isBroad()));

    await refresh();
  }

  function startSession(user) {
    me = user;
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#sessionName').textContent = me.name;
    $('#sessionRole').textContent = (ROLE_LABEL[me.role] || me.role) + ' · ' + myShifts().length + ' turno(s)';
    $('#avatar').textContent = initials(me.name);
    bootstrap();
  }

  async function start() {
    bind();
    try {
      const dados = await api('/api/auth/me');
      startSession(dados.user);
    } catch (err) {
      $('#loginScreen').classList.remove('hidden');
    }
  }


  /* ---------- fechamento de turno ---------- */

  function fillClosureFilters() {
    const sel = $('#closureShift');
    const data = $('#closureDate');
    if (!sel || !data) return;

    const meus = myShifts();
    const lista = isBroad() ? shifts : shifts.filter((s) => meus.indexOf(s.code) > -1);

    sel.innerHTML = lista.map((s) => '<option value="' + s.code + '">' + esc(s.name) + '</option>').join('');
    data.value = new Date().toISOString().slice(0, 10);
  }

  async function loadClosure() {
    const turno = $('#closureShift').value;
    const data = $('#closureDate').value;
    if (!turno) return;

    try {
      const d = await api('/api/closure?shift=' + encodeURIComponent(turno) + '&date=' + encodeURIComponent(data));
      renderClosure(d);
    } catch (err) {
      $('#closureBody').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    }
  }

  function renderClosure(d) {
    const r = d.resumo;

    const cargas = d.cargas.length
      ? d.cargas.map((c) => '<tr><td><b>' + esc(c.carga) + '</b></td><td>' + esc(c.placa || '—') + '</td>'
        + '<td>' + esc(c.operador) + '</td><td>' + esc(c.status) + '</td>'
        + '<td>' + dur(c.montagem) + '</td><td>' + dur(c.espera) + '</td>'
        + '<td>' + dur(c.carregamento) + '</td><td>' + dur(c.total) + '</td></tr>').join('')
      : '<tr><td colspan="8">Nenhuma carga neste turno no dia.</td></tr>';

    const ocorr = d.ocorrencias.length
      ? d.ocorrencias.map((o) => '<tr><td>' + esc(o.categoria) + '</td><td>' + o.total + '</td><td>' + o.minutos + ' min</td></tr>').join('')
      : '<tr><td colspan="3">Nenhuma ocorrencia registrada.</td></tr>';

    const pend = d.pendentes.length
      ? d.pendentes.map((p) => '<tr><td><b>' + esc(p.carga) + '</b></td><td>' + esc(p.placa || '—') + '</td><td>' + esc(p.etapaAtual) + '</td></tr>').join('')
      : '<tr><td colspan="3">Nenhuma pendencia.</td></tr>';

    $('#closureBody').innerHTML = [
      '<div class="closure-head"><h3>' + esc(d.turno.nome) + ' — ' + d.data + '</h3>'
        + '<span>Horario: ' + esc(d.turno.inicio) + ' as ' + esc(d.turno.fim) + '</span>'
        + '<span>Gerado em ' + when(d.geradoEm) + '</span></div>',

      '<div class="closure-grid">'
        + '<div><small>Cargas expedidas</small><b>' + r.total + '</b></div>'
        + '<div><small>Liberadas</small><b>' + r.released + ' (' + r.releaseRate + '%)</b></div>'
        + '<div><small>Tempo total medio</small><b>' + dur(r.averageTotal) + '</b></div>'
        + '<div><small>Montagem media</small><b>' + dur(r.averageAssembly) + '</b></div>'
        + '<div><small>Carregamento medio</small><b>' + dur(r.averageLoad) + '</b></div>'
        + '<div><small>Pendencias</small><b>' + d.pendentes.length + '</b></div>'
        + '</div>',

      '<h4>Cargas do turno</h4>',
      '<div class="table-wrap"><table><thead><tr><th>Carga</th><th>Placa</th><th>Operador</th><th>Situacao</th><th>Montagem</th><th>Espera</th><th>Carregamento</th><th>Total</th></tr></thead><tbody>' + cargas + '</tbody></table></div>',

      '<h4>Ocorrencias</h4>',
      '<div class="table-wrap"><table class="users-table"><thead><tr><th>Motivo</th><th>Registros</th><th>Minutos perdidos</th></tr></thead><tbody>' + ocorr + '</tbody></table></div>',

      '<h4>Pendencias para o proximo turno</h4>',
      '<div class="table-wrap"><table class="users-table"><thead><tr><th>Carga</th><th>Placa</th><th>Onde parou</th></tr></thead><tbody>' + pend + '</tbody></table></div>',

      d.passagem ? '<h4>Passagem registrada</h4><p>' + esc(d.passagem.pendencias || d.passagem.resumo || '') + '</p>' : ''
    ].join('');
  }

  /* ---------- backup ---------- */

  async function loadBackups() {
    try {
      const d = await api('/api/backup');
      const box = $('#backupBody');
      if (!box) return;

      if (!d.backups.length) {
        box.innerHTML = '';
        $('#backupEmpty').style.display = 'block';
        return;
      }

      $('#backupEmpty').style.display = 'none';

      box.innerHTML = d.backups.map((b) =>
        '<tr><td><b>' + esc(b.arquivo) + '</b></td>'
        + '<td>' + when(b.criadoEm) + '</td>'
        + '<td>' + Math.round(b.tamanho / 1024) + ' KB</td>'
        + '<td><button class="btn small" data-backup-check="' + esc(b.arquivo) + '">Verificar</button> '
        + '<button class="btn small danger" data-backup-restore="' + esc(b.arquivo) + '">Restaurar</button></td></tr>'
      ).join('');
    } catch (err) {
      $('#backupBody').innerHTML = '<tr><td colspan="4">' + esc(err.message) + '</td></tr>';
    }
  }

  function bindClosureAndBackup() {
    const carregar = $('#closureLoad');
    if (carregar) carregar.addEventListener('click', loadClosure);

    const imprimir = $('#closurePrint');
    if (imprimir) imprimir.addEventListener('click', () => window.print());

    const novo = $('#newBackup');
    if (novo) novo.addEventListener('click', async () => {
      try {
        await api('/api/backup', { method: 'POST' });
        await loadBackups();
        toast('Backup gerado e verificado.');
      } catch (err) {
        toast(err.message, true);
      }
    });

    const corpo = $('#backupBody');
    if (corpo) corpo.addEventListener('click', async (e) => {
      const ver = e.target.closest('[data-backup-check]');
      const res = e.target.closest('[data-backup-restore]');

      if (ver) {
        try {
          const r = await api('/api/backup/' + encodeURIComponent(ver.dataset.backupCheck) + '/verificar');
          const c = r.conferencia;
          toast(c.ok ? 'Backup integro: ' + c.tabelas + ' tabelas.' : 'Falha na verificacao.', !c.ok);
        } catch (err) {
          toast(err.message, true);
        }
      }

      if (res) {
        const nome = res.dataset.backupRestore;
        if (!window.confirm('Restaurar ' + nome + '? O banco atual sera copiado antes.')) return;

        try {
          await api('/api/backup/' + encodeURIComponent(nome) + '/restaurar', { method: 'POST' });
          toast('Backup restaurado. Recarregue a pagina.');
        } catch (err) {
          toast(err.message, true);
        }
      }
    });
  }

  start();
})();

