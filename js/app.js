// ─────────────────────────────────────────────────────────────
//  app.js — Lógica principal de TaskFlow
// ─────────────────────────────────────────────────────────────

let tasks        = [];
let editingId    = null;
let currentMaterials = [];
let checkInterval = null;

// ── MATERIALES ───────────────────────────────────────────────
function addMaterial() {
  const input = document.getElementById('fMatInput');
  const val   = input.value.trim();
  if (!val) return;
  if (currentMaterials.includes(val)) { input.value = ''; return; }
  currentMaterials.push(val);
  input.value = '';
  renderMaterials();
  input.focus();
}

function removeMaterial(i) {
  currentMaterials.splice(i, 1);
  renderMaterials();
}

function renderMaterials() {
  const container = document.getElementById('matTags');
  container.innerHTML = currentMaterials.map((m, i) =>
    `<div class="mat-tag">${escHtml(m)}<button class="mat-tag-del" onclick="removeMaterial(${i})">✕</button></div>`
  ).join('');
}

// ── UTILS ────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function today() { return new Date().toISOString().split('T')[0]; }

function getLapsoLabel(val, unit) {
  const labels = { hours: 'hora', days: 'día', weeks: 'semana' };
  const label  = labels[unit] || 'día';
  return `${val} ${label}${parseInt(val) !== 1 ? 's' : ''}`;
}

function isOverdue(task) {
  if (task.status === 'done') return false;
  if (!task.fechaLimite) return false;
  return new Date(task.fechaLimite + 'T23:59:59') < new Date();
}

function isUrgent(task) {
  if (task.status === 'done') return false;
  if (!task.fechaLimite) return false;
  const diff = new Date(task.fechaLimite + 'T23:59:59') - new Date();
  return diff >= 0 && diff < 86400000 * 2;
}

function getDaysLeft(task) {
  if (!task.fechaLimite) return null;
  const diff = new Date(task.fechaLimite + 'T23:59:59') - new Date();
  if (diff < 0) return null;
  return Math.ceil(diff / 86400000);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── STATUS ───────────────────────────────────────────────────
const STATUS = {
  pending:  { label: '⏳ Pendiente',  cls: 's-pending',  bar: 'bar-pending'  },
  progress: { label: '🔄 En Proceso', cls: 's-progress', bar: 'bar-progress' },
  done:     { label: '✅ Completado', cls: 's-done',     bar: 'bar-done'     },
  overdue:  { label: '🚨 Vencido',    cls: 's-overdue',  bar: 'bar-overdue'  },
};

function nextStatus(current) {
  const cycle = ['pending', 'progress', 'done'];
  const i = cycle.indexOf(current);
  return cycle[(i + 1) % cycle.length];
}

// ── WHATSAPP ─────────────────────────────────────────────────
function buildWaLink(task) {
  const phone = (task.whatsapp || '').replace(/\D/g, '');
  if (!phone) return null;
  const matLine = task.materiales && task.materiales.length
    ? `\n🧰 Materiales: ${task.materiales.join(', ')}`
    : '';
  const msg = encodeURIComponent(
    `🔔 *Recordatorio TaskFlow*\n\n` +
    `📋 *${task.pendiente}*\n` +
    `📅 Fecha límite: ${formatDate(task.fechaLimite)}\n` +
    `📝 ${task.descripcion || 'Sin descripción'}` +
    matLine +
    `\n\n⚠️ Esta tarea aún no ha sido completada. ¡Atiéndela pronto!`
  );
  return `https://wa.me/${phone}?text=${msg}`;
}

// ── SYNC STATUS UI ───────────────────────────────────────────
function setSyncStatus(state) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (state === 'syncing') { el.textContent = '🔄'; el.title = 'Sincronizando...'; }
  else if (state === 'ok') { el.textContent = '☁️'; el.title = 'Sincronizado con Supabase'; }
  else if (state === 'local') { el.textContent = '💾'; el.title = 'Guardado localmente'; }
  else if (state === 'error') { el.textContent = '⚠️'; el.title = 'Error al sincronizar'; }
}

// ── RENDER ───────────────────────────────────────────────────
function render() {
  const list = document.getElementById('taskList');

  tasks.forEach(t => {
    if (t.status !== 'done' && isOverdue(t)) t.status = 'overdue';
  });

  const pending  = tasks.filter(t => t.status === 'pending').length;
  const progress = tasks.filter(t => t.status === 'progress').length;
  const done     = tasks.filter(t => t.status === 'done').length;
  const overdue  = tasks.filter(t => t.status === 'overdue').length;

  document.getElementById('cntPending').textContent  = `${pending} Pendiente${pending !== 1 ? 's' : ''}`;
  document.getElementById('cntProgress').textContent = `${progress} En Proceso`;
  document.getElementById('cntDone').textContent     = `${done} Completado${done !== 1 ? 's' : ''}`;
  document.getElementById('cntOverdue').textContent  = `${overdue} Vencido${overdue !== 1 ? 's' : ''}`;

  const badge = document.getElementById('overdueBadge');
  if (overdue > 0) { badge.style.display = 'flex'; badge.textContent = overdue; }
  else badge.style.display = 'none';

  const alertC = document.getElementById('alertContainer');
  alertC.innerHTML = '';
  const urgentTasks = tasks.filter(t => isUrgent(t) && t.status !== 'done');
  if (urgentTasks.length) {
    const div = document.createElement('div');
    div.className = 'alert-banner';
    div.innerHTML = `⚠️ <strong>${urgentTasks.length}</strong> tarea${urgentTasks.length > 1 ? 's' : ''} vence${urgentTasks.length > 1 ? 'n' : ''} en menos de 2 días`;
    alertC.appendChild(div);
  }

  if (tasks.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📋</div>
        <div class="empty-title">Sin tareas aún</div>
        <div class="empty-sub">Presiona "Nueva Tarea" para empezar a organizar tu día</div>
      </div>`;
    return;
  }

  const groups = [
    { key: 'overdue',  label: '🚨 Vencidas',   items: tasks.filter(t => t.status === 'overdue') },
    { key: 'pending',  label: '⏳ Pendientes',  items: tasks.filter(t => t.status === 'pending') },
    { key: 'progress', label: '🔄 En Proceso',  items: tasks.filter(t => t.status === 'progress') },
    { key: 'done',     label: '✅ Completadas', items: tasks.filter(t => t.status === 'done') },
  ].filter(g => g.items.length > 0);

  list.innerHTML = groups.map(g => `
    <div class="section-label">${g.label} (${g.items.length})</div>
    ${g.items.map(t => renderCard(t)).join('')}
  `).join('');
}

function renderCard(task) {
  const st       = STATUS[task.status] || STATUS.pending;
  const daysLeft = getDaysLeft(task);
  const overdue  = isOverdue(task);
  const urgent   = isUrgent(task);
  const waLink   = buildWaLink(task);

  const daysChip = task.fechaLimite
    ? overdue
      ? `<div class="meta-chip" style="color:var(--red);border-color:#F5B0B7;background:#FEE8EA"><span class="icon">🚨</span>Venció ${formatDate(task.fechaLimite)}</div>`
      : daysLeft !== null
        ? `<div class="meta-chip" style="${daysLeft <= 2 ? 'color:var(--orange);border-color:#F7C89A;background:#FEF3E8' : ''}"><span class="icon">📅</span>${daysLeft === 0 ? 'Vence hoy' : daysLeft === 1 ? 'Vence mañana' : `${daysLeft} días`}</div>`
        : ''
    : '';

  const lapsoChip = task.lapso
    ? `<div class="meta-chip"><span class="icon">⏳</span>${getLapsoLabel(task.lapso, task.lapsoUnit)}</div>`
    : '';

  const waChip = task.whatsapp
    ? `<div class="meta-chip" style="color:#0A8A50;border-color:#A8EAC8;background:#E8FAF0"><span class="icon">📱</span>WA activo</div>`
    : '';

  const matChip = task.materiales && task.materiales.length
    ? `<div class="meta-chip" style="color:var(--accent);border-color:#C4C0F7;background:#EFEDFF"><span class="icon">🧰</span>${task.materiales.length} material${task.materiales.length !== 1 ? 'es' : ''}</div>`
    : '';

  const matBlock = task.materiales && task.materiales.length
    ? `<div class="task-materiales"><strong>🧰 Materiales</strong>${task.materiales.map(m => `• ${escHtml(m)}`).join(' &nbsp;')}</div>`
    : '';

  const waBtn = waLink
    ? `<a href="${waLink}" target="_blank" class="wa-btn${overdue || urgent ? ' urgent-ring' : ''}" title="Enviar recordatorio por WhatsApp">📲</a>`
    : '';

  return `
    <div class="task-card" id="card-${task.id}">
      <div class="task-side-bar ${st.bar}"></div>
      <div class="task-header">
        <div class="task-title-wrap">
          <div class="task-title">${escHtml(task.pendiente)}</div>
          <div class="task-date">📅 Inicio: ${formatDate(task.fechaInicio) || '—'}</div>
        </div>
        <div class="task-actions">
          <div class="btn-icon" onclick="openModal('${task.id}')" title="Editar">✏️</div>
          <div class="btn-icon del" onclick="deleteTask('${task.id}')" title="Eliminar">🗑</div>
        </div>
      </div>
      <div class="task-body">
        ${task.descripcion ? `<div class="task-desc">${escHtml(task.descripcion)}</div>` : ''}
        ${matBlock}
        <div class="task-meta">
          ${daysChip}${lapsoChip}${matChip}${waChip}
        </div>
        <div class="task-footer">
          <button class="status-btn ${st.cls}" onclick="cycleStatus('${task.id}')">${st.label}</button>
          ${waBtn}
        </div>
      </div>
    </div>`;
}

// ── ACTIONS ──────────────────────────────────────────────────
async function cycleStatus(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.status = t.status === 'overdue' ? 'done' : nextStatus(t.status);
  render();
  setSyncStatus('syncing');
  const ok = await dbUpdateTask(id, { status: t.status, updatedAt: Date.now() });
  setSyncStatus(ok ? (useSupabase ? 'ok' : 'local') : 'error');
}

async function deleteTask(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  tasks = tasks.filter(t => t.id !== id);
  render();
  setSyncStatus('syncing');
  const ok = await dbDeleteTask(id);
  setSyncStatus(ok ? (useSupabase ? 'ok' : 'local') : 'error');
}

// ── MODAL ────────────────────────────────────────────────────
function openModal(id) {
  editingId = id || null;
  document.getElementById('modalTitle').textContent = id ? 'Editar Tarea' : 'Nueva Tarea';
  currentMaterials = [];

  if (id) {
    const t = tasks.find(t => t.id === id);
    if (t) {
      document.getElementById('fPendiente').value   = t.pendiente   || '';
      document.getElementById('fFechaInicio').value = t.fechaInicio || '';
      document.getElementById('fFechaLimite').value = t.fechaLimite || '';
      document.getElementById('fDescripcion').value = t.descripcion || '';
      document.getElementById('fLapso').value       = t.lapso       || '';
      document.getElementById('fLapsoUnit').value   = t.lapsoUnit   || 'days';
      document.getElementById('fWhatsApp').value    = t.whatsapp    || '';
      document.getElementById('fStatus').value      = (t.status === 'overdue' ? 'pending' : t.status) || 'pending';
      currentMaterials = t.materiales ? [...t.materiales] : [];
    }
  } else {
    document.getElementById('fPendiente').value   = '';
    document.getElementById('fFechaInicio').value = today();
    document.getElementById('fFechaLimite').value = '';
    document.getElementById('fDescripcion').value = '';
    document.getElementById('fLapso').value       = '';
    document.getElementById('fLapsoUnit').value   = 'days';
    document.getElementById('fWhatsApp').value    = '';
    document.getElementById('fStatus').value      = 'pending';
  }

  document.getElementById('fMatInput').value = '';
  renderMaterials();
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

async function saveTask() {
  const pendiente   = document.getElementById('fPendiente').value.trim();
  const fechaInicio = document.getElementById('fFechaInicio').value;
  const fechaLimite = document.getElementById('fFechaLimite').value;
  const descripcion = document.getElementById('fDescripcion').value.trim();
  const lapso       = document.getElementById('fLapso').value;
  const lapsoUnit   = document.getElementById('fLapsoUnit').value;
  const whatsapp    = document.getElementById('fWhatsApp').value.trim();
  const status      = document.getElementById('fStatus').value;

  if (!pendiente) { alert('El título del pendiente es obligatorio'); return; }

  setSyncStatus('syncing');

  if (editingId) {
    const t = tasks.find(t => t.id === editingId);
    if (t) {
      const changes = { pendiente, fechaInicio, fechaLimite, descripcion,
        lapso, lapsoUnit, whatsapp, status, materiales: [...currentMaterials],
        updatedAt: Date.now() };
      Object.assign(t, changes);
      render();
      closeModal();
      const ok = await dbUpdateTask(editingId, changes);
      setSyncStatus(ok ? (useSupabase ? 'ok' : 'local') : 'error');
    }
  } else {
    const newTask = {
      id: uid(), pendiente, fechaInicio, fechaLimite, descripcion,
      lapso, lapsoUnit, whatsapp, status,
      materiales: [...currentMaterials],
      createdAt: Date.now(), updatedAt: Date.now()
    };
    tasks.unshift(newTask);
    render();
    closeModal();
    const saved = await dbInsertTask(newTask);
    if (saved && saved.id !== newTask.id) {
      // Actualizar id local si Supabase lo sobreescribió (UUID)
      const idx = tasks.findIndex(t => t.id === newTask.id);
      if (idx !== -1) tasks[idx].id = saved.id;
    }
    setSyncStatus(saved ? (useSupabase ? 'ok' : 'local') : 'error');
  }
}

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  setSyncStatus('syncing');
  tasks = await dbLoadTasks();
  setSyncStatus(useSupabase ? 'ok' : 'local');
  render();

  // Re-verificar vencidos cada minuto
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(() => render(), 60000);
}

init();
