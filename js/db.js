// ─────────────────────────────────────────────────────────────
//  db.js — Capa de persistencia con Supabase + fallback a localStorage
//  Todas las funciones son async y resuelven { data, error }
// ─────────────────────────────────────────────────────────────

let supabase = null;
let useSupabase = false;

// Inicializa el cliente de Supabase si las credenciales están configuradas
function initDB() {
  const configured =
    typeof SUPABASE_URL  !== 'undefined' && !SUPABASE_URL.includes('TU_PROJECT') &&
    typeof SUPABASE_ANON !== 'undefined' && !SUPABASE_ANON.includes('TU_ANON');

  if (configured) {
    try {
      supabase   = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
      useSupabase = true;
      console.log('[TaskFlow] Conectado a Supabase ✅');
    } catch (e) {
      console.warn('[TaskFlow] Error al conectar Supabase, usando localStorage:', e);
      useSupabase = false;
    }
  } else {
    console.log('[TaskFlow] Sin credenciales Supabase → localStorage');
  }
}

// ── HELPERS LOCALSTORAGE ──────────────────────────────────────
const LS_KEY = 'taskflow_tasks';

function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}

function lsSave(tasks) {
  localStorage.setItem(LS_KEY, JSON.stringify(tasks));
}

// ── API PÚBLICA ───────────────────────────────────────────────

/**
 * Obtiene todas las tareas del usuario.
 * @returns {Promise<Array>} lista de tareas
 */
async function dbLoadTasks() {
  if (!useSupabase) return lsLoad();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] loadTasks:', error.message);
    return lsLoad(); // fallback
  }

  // Normalizar nombres de columnas snake_case → camelCase
  return (data || []).map(dbRowToTask);
}

/**
 * Guarda una tarea nueva.
 * @param {Object} task
 * @returns {Promise<Object|null>} tarea guardada o null si hubo error
 */
async function dbInsertTask(task) {
  if (!useSupabase) {
    const tasks = lsLoad();
    tasks.unshift(task);
    lsSave(tasks);
    return task;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([taskToDbRow(task)])
    .select()
    .single();

  if (error) { console.error('[DB] insertTask:', error.message); return null; }
  return dbRowToTask(data);
}

/**
 * Actualiza una tarea existente.
 * @param {string} id
 * @param {Object} changes  campos a actualizar (camelCase)
 * @returns {Promise<boolean>}
 */
async function dbUpdateTask(id, changes) {
  if (!useSupabase) {
    const tasks = lsLoad();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) { Object.assign(tasks[idx], changes); lsSave(tasks); }
    return true;
  }

  const { error } = await supabase
    .from('tasks')
    .update(taskToDbRow(changes))
    .eq('id', id);

  if (error) { console.error('[DB] updateTask:', error.message); return false; }
  return true;
}

/**
 * Elimina una tarea.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function dbDeleteTask(id) {
  if (!useSupabase) {
    const tasks = lsLoad().filter(t => t.id !== id);
    lsSave(tasks);
    return true;
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) { console.error('[DB] deleteTask:', error.message); return false; }
  return true;
}

// ── CONVERSORES camelCase ↔ snake_case ───────────────────────

function taskToDbRow(t) {
  const row = {};
  if (t.id          !== undefined) row.id           = t.id;
  if (t.pendiente   !== undefined) row.pendiente     = t.pendiente;
  if (t.descripcion !== undefined) row.descripcion   = t.descripcion;
  if (t.fechaInicio !== undefined) row.fecha_inicio  = t.fechaInicio  || null;
  if (t.fechaLimite !== undefined) row.fecha_limite  = t.fechaLimite  || null;
  if (t.status      !== undefined) row.status        = t.status;
  if (t.lapso       !== undefined) row.lapso         = t.lapso        ? Number(t.lapso) : null;
  if (t.lapsoUnit   !== undefined) row.lapso_unit    = t.lapsoUnit    || 'days';
  if (t.whatsapp    !== undefined) row.whatsapp      = t.whatsapp     || null;
  if (t.materiales  !== undefined) row.materiales    = t.materiales   || [];
  if (t.createdAt   !== undefined) row.created_at    = new Date(t.createdAt).toISOString();
  if (t.updatedAt   !== undefined) row.updated_at    = new Date(t.updatedAt).toISOString();
  return row;
}

function dbRowToTask(row) {
  return {
    id:          row.id,
    pendiente:   row.pendiente,
    descripcion: row.descripcion  || '',
    fechaInicio: row.fecha_inicio || '',
    fechaLimite: row.fecha_limite || '',
    status:      row.status       || 'pending',
    lapso:       row.lapso        != null ? String(row.lapso) : '',
    lapsoUnit:   row.lapso_unit   || 'days',
    whatsapp:    row.whatsapp     || '',
    materiales:  Array.isArray(row.materiales) ? row.materiales : [],
    createdAt:   row.created_at   ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt:   row.updated_at   ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

// Inicializar al cargar el script
initDB();
