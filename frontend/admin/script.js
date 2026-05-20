const API = 'https://preguntas-frecuentes-castores.onrender.com';
let token = localStorage.getItem('token') || '';
let currentUser = null;
let preguntasData = [];
let filteredData = [];
let usuariosData = [];
let currentPage = 1;
const POR_PAGINA = 10;


function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}

// ─── AUTH ─────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !pass) { errEl.textContent = 'Completá todos los campos.'; errEl.style.display = 'block'; return; }

  try {
    const form = new URLSearchParams({ username: email, password: pass });
    const res  = await fetch(`${API}/auth/login`, { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || 'Error');

    token = data.access_token;
    localStorage.setItem('token', token);
    currentUser = { email, rol: data.rol, nombre: data.nombre || email.split('@')[0] };
    location.reload();
  } catch (e) {
    errEl.textContent = e.message || 'Credenciales incorrectas.';
    errEl.style.display = 'block';
  }
}

document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogout() {
  token = '';
  currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ─── INIT ─────────────────────────────────────
function initApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  const n = currentUser.nombre;
  document.getElementById('sidebar-name').textContent = n;
  document.getElementById('sidebar-avatar').textContent = n[0].toUpperCase();
  document.getElementById('sidebar-role').textContent = currentUser.rol === 'admin' ? 'Administrador' : 'Usuario';
  document.getElementById('rol-badge').textContent = currentUser.rol === 'admin' ? 'Admin' : 'User';

  if (currentUser.rol !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  loadMetrics();
  loadPreguntas();
}

// ─── NAVEGACIÓN ───────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  event.currentTarget.classList.add('active');

  const titles = { dashboard: 'Dashboard', preguntas: 'Preguntas', usuarios: 'Usuarios' };
  document.getElementById('topbar-title').textContent = titles[name];

  if (name === 'usuarios') loadUsuarios();
}

// ─── API HELPER ───────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (res.status === 401) { doLogout(); return null; }
  return res;
}

// ─── MÉTRICAS ─────────────────────────────────
async function loadMetrics() {
  try {
    const [mRes, pRes] = await Promise.all([
      apiFetch('/metricas/'),
      apiFetch('/preguntas/?por_pagina=1')
    ]);

    if (mRes && mRes.ok) {
      const m = await mRes.json();
      document.getElementById('m-total').textContent   = m.total_consultas;
      document.getElementById('m-resp').textContent    = m.respondidas;
      document.getElementById('m-sinresp').textContent = m.sin_respuesta;
      document.getElementById('m-tasa').textContent    = `${m.tasa_respuesta}% tasa de respuesta`;
      renderFrecuentes(m.consultas_frecuentes);
    }

    if (pRes && pRes.ok) {
      const p = await pRes.json();
      document.getElementById('m-preguntas').textContent = p.total;
    }
  } catch (e) {
    document.getElementById('frecuentes-list').innerHTML = '<div class="loading">Error al cargar métricas.</div>';
  }
}

function renderFrecuentes(lista) {
  const el = document.getElementById('frecuentes-list');
  if (!lista || lista.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Sin consultas registradas todavía.</p></div>';
    return;
  }
  const max = lista[0].veces;
  el.innerHTML = lista.map((item, i) => `
    <div class="freq-item">
      <div class="freq-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
      <div class="freq-text">${item.consulta}</div>
      <div class="freq-bar-wrap">
        <div class="freq-bar-bg">
          <div class="freq-bar" style="width:${Math.round((item.veces / max) * 100)}%"></div>
        </div>
      </div>
      <div class="freq-count">${item.veces}</div>
    </div>
  `).join('');
}

// ─── PREGUNTAS ────────────────────────────────
async function loadPreguntas() {
  try {
    const res = await apiFetch('/preguntas?incluir_inactivas=true&por_pagina=1000');
    if (!res || !res.ok) return;
    const data = await res.json();
    preguntasData = data.datos;
    filteredData  = [...preguntasData];
    currentPage   = 1;
    loadCategorias();
    renderPreguntas();
  } catch (e) {
    document.getElementById('preguntas-tbody').innerHTML =
      '<tr><td colspan="6"><div class="loading">Error al cargar.</div></td></tr>';
  }
}

function loadCategorias() {
  const cats = [...new Set(preguntasData.map(p => p.categoria).filter(Boolean))].sort();
  const sel  = document.getElementById('cat-filter');
  const cur  = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`).join('');
}

function filterPreguntas() {
  const q     = document.getElementById('search-input').value.toLowerCase();
  const cat   = document.getElementById('cat-filter').value;
  const est   = document.getElementById('estado-filter').value;
  filteredData = preguntasData.filter(p => {
    const matchQ   = !q   || p.pregunta.toLowerCase().includes(q) || p.respuesta.toLowerCase().includes(q);
    const matchCat = !cat || p.categoria === cat;
    const matchEst = est === '' || String(p.activa) === est;
    return matchQ && matchCat && matchEst;
  });
  currentPage = 1;
  renderPreguntas();
}

function renderPreguntas() {
  const tbody  = document.getElementById('preguntas-tbody');
  const total  = filteredData.length;
  const pages  = Math.max(1, Math.ceil(total / POR_PAGINA));
  currentPage  = Math.min(currentPage, pages);
  const start  = (currentPage - 1) * POR_PAGINA;
  const slice  = filteredData.slice(start, start + POR_PAGINA);

  if (slice.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🔍</div><p>Sin resultados.</p></div></td></tr>';
  } else {
    tbody.innerHTML = slice.map(p => `
      <tr>
        <td style="color:var(--text-muted);font-family:'DM Mono',monospace;font-size:12px">${p.id}</td>
        <td><span class="text-truncate" title="${p.pregunta}">${p.pregunta}</span></td>
        <td><span class="text-truncate" title="${p.respuesta}" style="color:var(--text-muted)">${p.respuesta}</span></td>
        <td>${p.categoria ? `<span class="badge badge-navy">${p.categoria}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
        <td><span class="badge ${p.activa ? 'badge-success' : 'badge-danger'}">${p.activa ? 'Activa' : 'Inactiva'}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="Editar" onclick="openModalEditar(${p.id})">✏️</button>
            <button class="btn-icon success" title="${p.activa ? 'Desactivar' : 'Activar'}" onclick="togglePregunta(${p.id})">${p.activa ? '🔇' : '✅'}</button>
            ${currentUser.rol === 'admin' ? `<button class="btn-icon danger" title="Eliminar" onclick="confirmarEliminar(${p.id}, '${p.pregunta.replace(/'/g, "\\'")}')">🗑️</button>` : ""}
          </div>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('pag-info').textContent =
    `${total === 0 ? 0 : start + 1}–${Math.min(start + POR_PAGINA, total)} de ${total}`;

  const ctrl = document.getElementById('pag-controls');
  ctrl.innerHTML = '';
  const addBtn = (label, page, disabled, active) => {
    const b = document.createElement('button');
    b.className = 'pag-btn' + (active ? ' active' : '');
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = () => { currentPage = page; renderPreguntas(); };
    ctrl.appendChild(b);
  };
  addBtn('‹', currentPage - 1, currentPage === 1, false);
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(pages, currentPage + 2); i++) {
    addBtn(i, i, false, i === currentPage);
  }
  addBtn('›', currentPage + 1, currentPage === pages, false);
}

// ─── CRUD PREGUNTAS ───────────────────────────
function openModalCrear() {
  document.getElementById('edit-id').value       = '';
  document.getElementById('edit-pregunta').value = '';
  document.getElementById('edit-respuesta').value= '';
  document.getElementById('edit-categoria').value= '';
  document.getElementById('modal-pregunta-title').textContent = 'Nueva pregunta';
  openModal('modal-pregunta');
}

function openModalEditar(id) {
  const p = preguntasData.find(x => x.id === id);
  if (!p) return;
  document.getElementById('edit-id').value        = p.id;
  document.getElementById('edit-pregunta').value  = p.pregunta;
  document.getElementById('edit-respuesta').value = p.respuesta;
  document.getElementById('edit-categoria').value = p.categoria || '';
  document.getElementById('modal-pregunta-title').textContent = 'Editar pregunta';
  openModal('modal-pregunta');
}

async function guardarPregunta() {
  const id  = document.getElementById('edit-id').value;
  const preg = document.getElementById('edit-pregunta').value.trim();
  const resp = document.getElementById('edit-respuesta').value.trim();
  const cat  = document.getElementById('edit-categoria').value.trim();

  if (!preg || !resp) { toast('Completá pregunta y respuesta.', 'error'); return; }

  const body = JSON.stringify({ pregunta: preg, respuesta: resp, categoria: cat || null });

  try {
    let res;
    if (id) {
      res = await apiFetch(`/preguntas/${id}`, { method: 'PUT', body });
    } else {
      res = await apiFetch('/preguntas/', { method: 'POST', body });
    }

    if (!res || !res.ok) {
      const err = await res.json();
      toast(err.detail || 'Error al guardar.', 'error');
      return;
    }

    closeModal('modal-pregunta');
    toast(id ? 'Pregunta actualizada.' : 'Pregunta creada.', 'success');
    await loadPreguntas();
  } catch (e) {
    toast('Error de conexión.', 'error');
  }
}

async function togglePregunta(id) {
  try {
    const res = await apiFetch(`/preguntas/${id}/toggle`, { method: 'PATCH' });
    if (!res || !res.ok) return;
    const data = await res.json();
    const p = preguntasData.find(x => x.id === id);
    if (p) p.activa = data.activa;
    filterPreguntas();
    toast(data.activa ? 'Pregunta activada.' : currentUser.rol === 'admin' ? 'Pregunta desactivada' : 'Pregunta desactivada <br> Recuerde que solo el admin puede eliminarla definitivamente', 'info');
  } catch (e) {
    toast('Error de conexión.', 'error');
  }
}

function confirmarEliminar(id, texto) {
  document.getElementById('confirm-body').textContent = `"${texto.substring(0, 80)}..." — Esta acción no se puede deshacer.`;
  document.getElementById('confirm-ok').onclick = () => eliminarPregunta(id);
  document.getElementById('confirm-overlay').classList.add('open');
}

async function eliminarPregunta(id) {
  closeConfirm();
  try {
    const res = await apiFetch(`/preguntas/${id}`, { method: 'DELETE' });
    if (!res || !res.ok) { toast('Error al eliminar.', 'error'); return; }
    preguntasData = preguntasData.filter(p => p.id !== id);
    filterPreguntas();
    toast('Pregunta eliminada.', 'success');
  } catch (e) {
    toast('Error de conexión.', 'error');
  }
}

// ─── USUARIOS ─────────────────────────────────
async function loadUsuarios() {
  try {
    const res = await apiFetch('/auth/usuarios');
    if (!res || !res.ok) return;
    const data = await res.json();
    const tbody = document.getElementById('usuarios-tbody');

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>Sin usuarios registrados.</p></div></td></tr>';
      return;
    }
    usuariosData = data;

    tbody.innerHTML = data.map(u => `
      <tr>
        <td>${u.nombre || '—'}</td>
        <td style="color:var(--text-muted)">${u.email}</td>
        <td><span class="badge ${u.rol === 'admin' ? 'badge-warning' : 'badge-info'}">${u.rol}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${u.creado_en ? new Date(u.creado_en).toLocaleDateString('es-AR') : '—'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon " title="Editar" onclick="openModalEditarUser('${u.email}')">✏️</button>
            <button class="btn-icon danger" title="Eliminar" onclick="confirmarEliminarUser('${u.email}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    toast('Error al cargar usuarios.', 'error');
  }
}


function openModalUsuario() {
  document.getElementById('modal-usuario-title').textContent = 'Nuevo usuario';
  document.getElementById('password-help').style.display = 'none';

  document.getElementById('edit-user-email-original').value = '';

  document.getElementById('new-nombre').value = '';
  document.getElementById('new-email').value = '';
  document.getElementById('new-pass').value = '';
  document.getElementById('new-rol').value = 'user';

  document.getElementById('btn-guardar-usuario').onclick = guardarUsuario;

  openModal('modal-usuario');
}

function openModalEditarUser(email) {
  const u = usuariosData.find(x => x.email === email);
  document.getElementById('password-help').style.display = 'block';

  if (!u) return;

  document.getElementById('modal-usuario-title').textContent = 'Editar usuario';

  document.getElementById('edit-user-email-original').value = u.email;

  document.getElementById('new-nombre').value = u.nombre || '';
  document.getElementById('new-email').value = u.email;
  document.getElementById('new-pass').value = '';
  document.getElementById('new-rol').value = u.rol;

  document.getElementById('btn-guardar-usuario').onclick = guardarUsuario;

  openModal('modal-usuario');
}

async function guardarUsuario() {
  const emailOriginal = document.getElementById('edit-user-email-original').value;

  const nombre = document.getElementById('new-nombre').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-pass').value;
  const rol = document.getElementById('new-rol').value;

  if (!email) {
    toast('Completá el email.', 'error');
    return;
  }

  try {

    // CREAR
    if (!emailOriginal) {

      if (!password) {
        toast('Completá la contraseña.', 'error');
        return;
      }

      const params = new URLSearchParams({
        email,
        password,
        nombre,
        rol
      });

      const res = await apiFetch(`/auth/usuarios?${params}`, {
        method: 'POST'
      });

      if (!res || !res.ok) {
        const err = await res.json();
        toast(err.detail || 'Error al crear usuario.', 'error');
        return;
      }

      toast('Usuario creado correctamente.', 'success');

    } else {

      // EDITAR
      const res = await apiFetch(`/auth/usuarios/${emailOriginal}`, {
        method: 'PUT',
        body: JSON.stringify({
          email,
          nombre,
          password: password || null,
          rol
        })
      });

      if (!res || !res.ok) {
        const err = await res.json();
        toast(err.detail || 'Error al actualizar.', 'error');
        return;
      }

      toast('Usuario actualizado.', 'success');
      if (emailOriginal === currentUser.email) {
        currentUser.nombre = nombre;
        document.getElementById('sidebar-name').textContent = nombre || email.split('@')[0];
      }
    }

    closeModal('modal-usuario');

    loadUsuarios();

  } catch (e) {
    toast('Error de conexión.', 'error');
  }
}

function confirmarEliminarUser(email) {
  document.getElementById('confirm-title').textContent = '¿Eliminar usuario?';
  document.getElementById('confirm-body').textContent  = `Se eliminará ${email}. Esta acción no se puede deshacer.`;
  document.getElementById('confirm-ok').onclick = async () => {
    closeConfirm();
    const res = await apiFetch(`/auth/usuarios/${email}`, { method: 'DELETE' });
    if (res && res.ok) { toast('Usuario eliminado.', 'success'); loadUsuarios(); }
    else {const err = await res.json();
        toast(err.detail || 'Error al eliminar.', 'error');};
  };
  document.getElementById('confirm-overlay').classList.add('open');
}

// ─── UTILS ────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }

function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  t.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// Cerrar modales con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('modal-pregunta');
    closeModal('modal-usuario');
    closeConfirm();
  }
});

// Auto-login si hay token guardado
if (token) {
  apiFetch('/auth/me').then(async res => {
    if (res && res.ok) {
      const me = await res.json();
      currentUser = { email: me.email, rol: me.rol, nombre: me.nombre || me.email.split('@')[0] };
      initApp();
    } else {
      token = '';
      localStorage.removeItem('token');
    }
  });
}