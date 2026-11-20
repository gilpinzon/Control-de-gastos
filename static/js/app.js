/**
 * ==============================================================================
 * INVENTARIO SOMEX — LÓGICA DE INTERFAZ FRONTEND (static/app.js)
 * Intranet Nutrinet / Somex S.A.
 * 
 * Mejoras y Correcciones:
 * 1. Contraste Total en Todas las Tablas:
 *    - Todas las celdas en Negro Carbón (#111827) y Gris Pizarra (#1E293B).
 *    - Cero texto tenue o blanco sobre fondo claro.
 * 2. Eliminación de Columna "ACCIÓN" y Botón "✓ Escanear":
 *    - En "Pendientes por Verificar", verificación 100% automatizada vía QR.
 * 3. Galería de Fotografías Organizada por Carpetas de Fecha / Ciclo:
 *    - Agrupación por jornadas de auditoría y fechas de escaneo.
 *    - Navegación con carpetas y breadcrumbs.
 *    - Controles de eliminación individuales y masivos para el Administrador.
 * 4. Gestión de Roles Estrictos (admin, auxiliar, auditor).
 * ==============================================================================
 */

// Estado Global
let allAssets = [];
let allCollaborators = [];
let allBajas = [];
let scannedAssets = [];
let currentFilter = 'Todos';
let currentCollaborator = 'Todos';
let currentSede = 'Todas';
let currentOperationalStatus = 'Todos';
let currentType = 'Todos';
let currentSearch = '';
let activeAsset = null;
let currentModalTab = 'validate';
let currentMainModule = 'inventory';
let currentAuditCycle = 'Bimensual';
let cachedReportData = null;

let currentGalleryFolderId = null;
let cachedGalleryFolders = [];

let currentUser = null;
let html5QrScanner = null;
let isCameraScanning = false;
let toastTimer = null;
let autoScanTimer = null;

// ------------------------------------------------------------------------------
// INICIALIZACIÓN INMEDIATA (NO BLOQUEANTE)
// ------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Renderizar iconos offline de inmediato
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // Asegurar selección por defecto: Todos los Dispositivos, Todas las Sedes, Todos los Estados
  const filterTypeEl = document.getElementById('filter-type');
  if (filterTypeEl) filterTypeEl.value = 'Todos';
  currentType = 'Todos';

  const filterSedeEl = document.getElementById('filter-sede');
  if (filterSedeEl) filterSedeEl.value = 'Todas';
  currentSede = 'Todas';

  const filterOpStatusEl = document.getElementById('filter-operational-status');
  if (filterOpStatusEl) filterOpStatusEl.value = 'Todos';
  currentOperationalStatus = 'Todos';

  // 2. Cargar activos y navegación de forma inmediata sin bloquear el DOM
  loadAssets();
  loadCollaborators();

  // 3. Comprobar sesión de fondo sin congelar la interfaz
  checkUserSession();

  // 4. Cerrar dropdown de colaboradores al hacer clic fuera
  document.addEventListener('click', (e) => {
    const searchBox = document.getElementById('collab-search-input');
    const dropdown = document.getElementById('collab-dropdown-list');
    if (searchBox && dropdown && !searchBox.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
});

// ------------------------------------------------------------------------------
// 1. SESIÓN REAL, LOGIN Y GESTIÓN DE ROLES (admin, auxiliar, auditor)
// ------------------------------------------------------------------------------
async function checkUserSession() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('/api/auth/me', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        currentUser = data.user;
        updateUserHeaderUI(currentUser);
        applyRolePermissions();
        return;
      }
    }
    // Usuario no autenticado
    currentUser = null;
    updateUserHeaderUI(null);
    applyRolePermissions();
  } catch (err) {
    clearTimeout(timeoutId);
    currentUser = null;
    updateUserHeaderUI(null);
    applyRolePermissions();
  }
}

function updateUserHeaderUI(user) {
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-role-badge');
  const authIcon = document.getElementById('auth-icon');

  if (user) {
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (roleEl) {
      if (user.role === 'admin') roleEl.textContent = 'Administrador TIC';
      else if (user.role === 'auxiliar') roleEl.textContent = 'Auxiliar TIC (Lectura)';
      else roleEl.textContent = 'Auditoría TIC (Lectura)';
    }
    if (authIcon) authIcon.setAttribute('data-lucide', 'log-out');
  } else {
    if (nameEl) nameEl.textContent = 'Iniciar Sesión';
    if (roleEl) roleEl.textContent = 'Modo Consulta';
    if (authIcon) authIcon.setAttribute('data-lucide', 'log-in');
  }
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function showLoginScreen() {
  const overlay = document.getElementById('login-modal-overlay');
  if (overlay) overlay.classList.remove('hidden');
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function hideLoginScreen() {
  const overlay = document.getElementById('login-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function fillLoginForm(email, password) {
  const eInput = document.getElementById('login-email');
  const pInput = document.getElementById('login-password');
  if (eInput) eInput.value = email;
  if (pInput) pInput.value = password;
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error-msg');
  const btn = document.getElementById('login-submit-btn');

  if (errorBox) errorBox.classList.add('hidden');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Credenciales incorrectas');
    }

    currentUser = data.user;
    hideLoginScreen();
    applyRolePermissions();
    showToast('success', `Bienvenido, ${currentUser.name}`);

    await loadAssets();
    await loadCollaborators();

  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Error al cerrar sesión:', err);
  } finally {
    currentUser = null;
    stopCameraScan();
    showLoginScreen();
    showToast('success', 'Sesión cerrada correctamente.');
  }
}

function applyRolePermissions() {
  if (!currentUser) return;

  const role = currentUser.role;
  const isAdmin = role === 'admin';
  const isAuxiliar = role === 'auxiliar';
  const isAuditor = role === 'auditor';
  const isReadOnly = isAuxiliar || isAuditor;

  // Actualizar datos del usuario en la barra superior
  const nameEl = document.getElementById('user-display-name');
  const badgeEl = document.getElementById('user-role-badge');
  const btnUsers = document.getElementById('btn-users-management');

  if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;
  if (badgeEl) {
    if (isAdmin) {
      badgeEl.textContent = '🛡️ Administrador';
      badgeEl.className = 'block text-[9.5px] font-bold leading-tight text-emerald-200';
    } else if (isAuxiliar) {
      badgeEl.textContent = '🔧 Auxiliar TIC (Solo Lectura)';
      badgeEl.className = 'block text-[9.5px] font-bold leading-tight text-sky-200';
    } else {
      badgeEl.textContent = '👁️ Auditoría TIC (Solo Lectura)';
      badgeEl.className = 'block text-[9.5px] font-bold leading-tight text-amber-200';
    }
  }

  // Botón de Gestión de Usuarios y Roles (Visible únicamente para Administrador)
  if (btnUsers) {
    if (isAdmin) btnUsers.classList.remove('hidden');
    else btnUsers.classList.add('hidden');
  }

  // Banner informativo para perfiles de Solo Lectura
  const banner = document.getElementById('auditor-banner');
  const bannerText = document.getElementById('auditor-banner-text');
  if (banner && bannerText) {
    if (isReadOnly) {
      banner.classList.remove('hidden');
      if (isAuxiliar) {
        bannerText.innerHTML = '<strong>Perfil Auxiliar TIC (Solo Lectura):</strong> Tienes acceso a consultar inventario, auditar por QR y revisar fotografías. Las modificaciones están reservadas para el Administrador.';
      } else {
        bannerText.innerHTML = '<strong>Perfil Auditoría TIC (Solo Lectura):</strong> Acceso de inspección y revisión de actas, soportes de baja y evidencia visual sin permisos de alteración de registros.';
      }
    } else {
      banner.classList.add('hidden');
    }
  }

  // Botones de mutación
  const btnNew = document.getElementById('btn-new-asset');
  const btnSync = document.getElementById('btn-sync-glpi');
  const btnOpenBaja = document.getElementById('btn-open-baja-modal');
  const btnResetAudit = document.getElementById('btn-reset-audit');
  const btnDeleteAllPhotos = document.getElementById('btn-delete-all-photos');
  const btnDeleteCurrentFolder = document.getElementById('btn-delete-current-folder');
  const btnReimport = document.getElementById('btn-reimport-octubre');

  if (btnNew) btnNew.style.display = isReadOnly ? 'none' : 'inline-flex';
  if (btnSync) btnSync.style.display = isReadOnly ? 'none' : 'inline-flex';
  if (btnOpenBaja) btnOpenBaja.style.display = isReadOnly ? 'none' : 'inline-flex';
  if (btnResetAudit) btnResetAudit.style.display = isAdmin ? 'inline-flex' : 'none';
  if (btnDeleteAllPhotos) btnDeleteAllPhotos.style.display = isAdmin ? 'inline-flex' : 'none';
  if (btnDeleteCurrentFolder) btnDeleteCurrentFolder.style.display = (isAdmin && currentGalleryFolderId) ? 'inline-flex' : 'none';
  if (btnReimport) btnReimport.style.display = isAdmin ? 'inline-flex' : 'none';

  // Permisos en Modal de Documentación
  const uploadBlocked = document.getElementById('auditor-upload-blocked');
  const uploadForm = document.getElementById('admin-upload-form');
  const btnSaveNotes = document.getElementById('btn-save-notes');
  const notesNotice = document.getElementById('notes-readonly-notice');
  const notesInput = document.getElementById('modal-asset-notes-input');
  const photoControls = document.getElementById('photo-upload-controls');

  if (uploadBlocked && uploadForm) {
    if (isReadOnly) {
      uploadBlocked.classList.remove('hidden');
      uploadForm.classList.add('hidden');
    } else {
      uploadBlocked.classList.add('hidden');
      uploadForm.classList.remove('hidden');
    }
  }

  if (photoControls) {
    photoControls.style.display = isReadOnly ? 'none' : 'block';
  }

  if (btnSaveNotes && notesNotice && notesInput) {
    if (isReadOnly) {
      btnSaveNotes.classList.add('hidden');
      notesNotice.classList.remove('hidden');
      notesInput.readOnly = true;
    } else {
      btnSaveNotes.classList.remove('hidden');
      notesNotice.classList.add('hidden');
      notesInput.readOnly = false;
    }
  }

  if (window.lucide) lucide.createIcons();
}

// ------------------------------------------------------------------------------
// 2. PANEL DE GESTIÓN DE USUARIOS Y ROLES (ADMIN ONLY)
// ------------------------------------------------------------------------------
async function openUsersModal() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('error', 'Acceso denegado: Solo el Administrador de Inventario puede gestionar usuarios.');
    return;
  }

  await loadUsersList();
  const modal = document.getElementById('users-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeUsersModal() {
  const modal = document.getElementById('users-modal');
  if (modal) modal.classList.add('hidden');
}

async function loadUsersList() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-slate-500">Cargando usuarios...</td></tr>';

  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (res.ok && data.users) {
      tbody.innerHTML = '';
      data.users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-200 text-[#111827] font-medium';

        let roleBadge = '';
        if (u.role === 'admin') {
          roleBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-[#00522c] border border-emerald-300">🛡️ Administrador</span>';
        } else if (u.role === 'auxiliar') {
          roleBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-300">🔧 Auxiliar TIC</span>';
        } else {
          roleBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">👁️ Auditoría TIC</span>';
        }

        const isSelf = currentUser && currentUser.email.toLowerCase() === u.email.toLowerCase();

        tr.innerHTML = `
          <td class="py-2.5 px-3 font-extrabold text-[#111827]">${u.name}</td>
          <td class="py-2.5 px-3 text-[#111827] font-mono font-bold text-[11px]">${u.email}</td>
          <td class="py-2.5 px-3">${roleBadge}</td>
          <td class="py-2.5 px-3 text-right">
            ${isSelf ? '<span class="text-[10px] text-slate-400 italic">Sesión actual</span>' : `
              <button onclick="handleDeleteUser(${u.id}, '${u.name}')" class="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded transition cursor-pointer" title="Eliminar usuario">
                <i data-lucide="trash-2" class="h-4 w-4"></i>
              </button>
            `}
          </td>
        `;
        tbody.appendChild(tr);
      });
      if (window.lucide) lucide.createIcons();
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-rose-600">Error al cargar usuarios: ${err.message}</td></tr>`;
  }
}

async function handleCreateUser(e) {
  e.preventDefault();
  const name = document.getElementById('new-user-name').value.trim();
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-pwd').value;
  const role = document.getElementById('new-user-role').value;

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al crear usuario');

    showToast('success', `Usuario ${data.user.name} creado correctamente.`);
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-pwd').value = '';

    await loadUsersList();
  } catch (err) {
    showToast('error', err.message);
  }
}

async function handleDeleteUser(userId, userName) {
  const ok = confirm(`¿Estás seguro de que deseas eliminar al usuario "${userName}"?`);
  if (!ok) return;

  try {
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al eliminar usuario');

    showToast('success', data.message);
    await loadUsersList();
  } catch (err) {
    showToast('error', err.message);
  }
}

// ------------------------------------------------------------------------------
// 3. NAVEGACIÓN ENTRE MÓDULOS DEL NAVBAR
// ------------------------------------------------------------------------------
function switchMainModule(moduleName) {
  currentMainModule = moduleName;
  const modules = [
    { id: 'inventory', btn: 'nav-btn-inventory', sec: 'module-inventory' },
    { id: 'qr-audit', btn: 'nav-btn-qr-audit', sec: 'module-qr-audit' },
    { id: 'gallery', btn: 'nav-btn-gallery', sec: 'module-gallery' },
    { id: 'bajas', btn: 'nav-btn-bajas', sec: 'module-bajas' },
    { id: 'reports', btn: 'nav-btn-reports', sec: 'module-reports' }
  ];

  modules.forEach(m => {
    const btn = document.getElementById(m.btn);
    const sec = document.getElementById(m.sec);

    if (m.id === moduleName) {
      if (sec) sec.classList.remove('hidden');
      if (btn) {
        btn.className = 'px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold bg-white text-[#006837] transition flex items-center space-x-1.5 shadow-sm whitespace-nowrap cursor-pointer flex-shrink-0';
      }
    } else {
      if (sec) sec.classList.add('hidden');
      if (btn) {
        btn.className = 'px-2.5 sm:px-3 py-1.5 rounded-lg font-medium text-emerald-100 hover:text-white hover:bg-white/10 transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer flex-shrink-0';
      }
    }
  });

  if (moduleName !== 'qr-audit') {
    stopCameraScan();
  }

  if (moduleName === 'qr-audit') {
    loadScannedAssets();
  } else if (moduleName === 'gallery') {
    loadPhotoGallery();
  } else if (moduleName === 'bajas') {
    loadBajas();
  } else if (moduleName === 'reports') {
    loadReportsModule();
  } else if (moduleName === 'inventory') {
    renderDashboard();
  }

  if (window.lucide) lucide.createIcons();
}

// ------------------------------------------------------------------------------
// 4. LIMPIEZA DE NOMENCLATURAS (REGLA DE ACTIVO LIMPIO)
// ------------------------------------------------------------------------------
function cleanAssetTag(tag) {
  if (!tag) return '';
  let clean = tag.replace(/^(SMX|GLPI|ACT)-[A-Za-z0-9]+-(?=[A-Za-z0-9])/i, '');
  clean = clean.replace(/^(SMX|GLPI|ACT)-/i, '');
  return clean || tag;
}

// ------------------------------------------------------------------------------
// 5. CARGA DE DATOS PRINCIPALES (API)
// ------------------------------------------------------------------------------
async function loadAssets() {
  const tbody = document.getElementById('assets-table-body');
  try {
    const res = await fetch('/api/assets');
    const data = await res.json();
    if (res.ok && data.assets) {
      allAssets = data.assets;
    } else {
      allAssets = [];
    }
  } catch (err) {
    console.warn('Advertencia al consultar /api/assets:', err);
    allAssets = [];
  }
  renderDashboard();
  if (currentMainModule === 'gallery') loadPhotoGallery();
}

async function loadCollaborators() {
  try {
    const res = await fetch('/api/collaborators');
    const data = await res.json();
    if (res.ok && data.collaborators) {
      allCollaborators = data.collaborators;
      renderCollaboratorDropdown(allCollaborators);
    }
  } catch (err) {
    console.warn('Error al cargar colaboradores:', err);
  }
}

function renderDashboard() {
  updateKPIs();
  renderTable();
  if (window.lucide) lucide.createIcons();
}

function updateKPIs() {
  const activeAssets = allAssets.filter(a => a.document_status !== 'Dado de Baja');
  const total = activeAssets.length;
  const verified = activeAssets.filter(a => a.document_status === 'Verificado y Firmado').length;
  const pending = activeAssets.filter(a => a.document_status === 'Pendiente de Firma').length;
  const missing = activeAssets.filter(a => a.document_status === 'Sin Acta').length;
  const rate = total > 0 ? Math.round((verified / total) * 100) : 0;

  const kTotal = document.getElementById('kpi-total');
  const kVerif = document.getElementById('kpi-verified');
  const kPend = document.getElementById('kpi-pending');
  const kMiss = document.getElementById('kpi-missing');
  const kRate = document.getElementById('kpi-rate');

  if (kTotal) kTotal.textContent = total;
  if (kVerif) kVerif.textContent = verified;
  if (kPend) kPend.textContent = pending;
  if (kMiss) kMiss.textContent = missing;
  if (kRate) kRate.textContent = `${rate}% cumplimiento`;

  const cAll = document.getElementById('count-all');
  const cMiss = document.getElementById('count-sin-acta');
  const cPend = document.getElementById('count-pendiente');
  const cVerif = document.getElementById('count-verificado');

  if (cAll) cAll.textContent = total;
  if (cMiss) cMiss.textContent = missing;
  if (cPend) cPend.textContent = pending;
  if (cVerif) cVerif.textContent = verified;
}

// ------------------------------------------------------------------------------
// 6. RENDERIZADO DE TABLA (ALTO CONTRASTE #111827 / #1E293B + SEDE + NOTAS LIMPIAS)
// ------------------------------------------------------------------------------
function setSedeFilter(sede) {
  currentSede = sede;
  renderTable();
  if (window.lucide) lucide.createIcons();
}

function setOperationalStatusFilter(status) {
  currentOperationalStatus = status;
  renderTable();
  if (window.lucide) lucide.createIcons();
}

function setTypeFilter(type) {
  currentType = type;
  renderTable();
  if (window.lucide) lucide.createIcons();
}

function getOperationalStatusBadge(status) {
  const s = (status || 'Activo').trim();
  switch (s) {
    case 'Activo':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-[#006837] border border-emerald-300 truncate" title="Activo Operativo"><i data-lucide="check-circle-2" class="h-3 w-3 text-[#006837] shrink-0"></i><span class="truncate">Activo</span></span>`;
    case 'Activo Backup':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300 truncate" title="Activo Backup"><i data-lucide="shield" class="h-3 w-3 text-blue-700 shrink-0"></i><span class="truncate">Activo Backup</span></span>`;
    case 'Activo Sin uso':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 truncate" title="Activo Sin Uso"><i data-lucide="pause-circle" class="h-3 w-3 text-amber-700 shrink-0"></i><span class="truncate">Sin Uso</span></span>`;
    case 'Activo de Baja':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 truncate" title="Activo de Baja"><i data-lucide="x-octagon" class="h-3 w-3 text-rose-700 shrink-0"></i><span class="truncate">De Baja</span></span>`;
    case 'Inactivo - En Bodega':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-300 truncate" title="Inactivo - En Bodega"><i data-lucide="package" class="h-3 w-3 text-purple-700 shrink-0"></i><span class="truncate">En Bodega</span></span>`;
    case 'Inactivo - En Revisión':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-orange-100 text-orange-800 border border-orange-300 truncate" title="Inactivo - En Revisión"><i data-lucide="wrench" class="h-3 w-3 text-orange-700 shrink-0"></i><span class="truncate">En Revisión</span></span>`;
    case 'Inactivo - En Garantía':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-cyan-100 text-cyan-800 border border-cyan-300 truncate" title="Inactivo - En Garantía"><i data-lucide="shield-alert" class="h-3 w-3 text-cyan-700 shrink-0"></i><span class="truncate">En Garantía</span></span>`;
    case 'Inactivo para venta':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 truncate" title="Inactivo para Venta"><i data-lucide="tag" class="h-3 w-3 text-indigo-700 shrink-0"></i><span class="truncate">Para Venta</span></span>`;
    case 'Inactivo desechado':
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-800 border border-slate-300 truncate" title="Inactivo Desechado"><i data-lucide="trash-2" class="h-3 w-3 text-slate-700 shrink-0"></i><span class="truncate">Desechado</span></span>`;
    default:
      return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-[#111827] border border-slate-300 truncate">${s}</span>`;
  }
}

function renderTable() {
  const tbody = document.getElementById('assets-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = allAssets.filter(asset => {
    if (asset.document_status === 'Dado de Baja') return false;

    const matchesFilter = currentFilter === 'Todos' || asset.document_status === currentFilter;
    const matchesOpStatus = currentOperationalStatus === 'Todos' || (asset.operational_status && asset.operational_status.trim() === currentOperationalStatus);
    const matchesType = currentType === 'Todos' || (asset.type && asset.type.trim() === currentType);
    const matchesCollab = currentCollaborator === 'Todos' || (asset.responsible_name && asset.responsible_name.toLowerCase() === currentCollaborator.toLowerCase());
    const matchesSede = currentSede === 'Todas' || (asset.sede && asset.sede.toLowerCase() === currentSede.toLowerCase());

    const term = currentSearch.toLowerCase();
    const matchesSearch = !term ||
      (asset.asset_tag && asset.asset_tag.toLowerCase().includes(term)) ||
      (asset.serial && asset.serial.toLowerCase().includes(term)) ||
      (asset.equipment_name && asset.equipment_name.toLowerCase().includes(term)) ||
      (asset.operational_status && asset.operational_status.toLowerCase().includes(term)) ||
      (asset.responsible_name && asset.responsible_name.toLowerCase().includes(term)) ||
      (asset.responsible_cedula && asset.responsible_cedula.includes(term)) ||
      (asset.type && asset.type.toLowerCase().includes(term)) ||
      (asset.sede && asset.sede.toLowerCase().includes(term)) ||
      (asset.notes && asset.notes.toLowerCase().includes(term)) ||
      (asset.imei && asset.imei.includes(term));

    return matchesFilter && matchesOpStatus && matchesType && matchesCollab && matchesSede && matchesSearch;
  });

  const footer = document.getElementById('footer-count');
  if (footer) {
    footer.textContent = `Mostrando ${filtered.length} de ${allAssets.length} activos en pantalla`;
  }

  if (allAssets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-14 text-center text-[#111827] font-semibold text-xs">
          <div class="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#006837] mx-auto mb-3 shadow-sm">
            <i data-lucide="package" class="h-6 w-6"></i>
          </div>
          <p class="text-sm font-bold text-slate-800">Base de datos lista para operar con datos reales</p>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">No hay activos de prueba. Incorpore activos reales mediante el botón <strong>"+ Nuevo Activo"</strong> o sincronice directamente con el servidor <strong>GLPI</strong>.</p>
        </td>
      </tr>
    `;
    if (footer) footer.textContent = '0 activos en la base de datos Somex';
    if (window.lucide) lucide.createIcons();
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-12 text-center text-[#111827] font-semibold text-xs">
          <i data-lucide="sliders-horizontal" class="h-6 w-6 mx-auto mb-2 text-slate-400"></i>
          No se encontraron activos con los filtros aplicados.
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  filtered.forEach(asset => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-emerald-50/50 transition border-b border-slate-200 text-[#111827] font-medium';

    let iconName = 'laptop';
    let iconColor = 'text-[#006837]';
    const tLower = (asset.type || '').toLowerCase();
    if (tLower.includes('notebook') || tLower.includes('laptop')) { iconName = 'laptop'; iconColor = 'text-[#006837]'; }
    else if (tLower.includes('monitor')) { iconName = 'monitor'; iconColor = 'text-blue-700'; }
    else if (tLower.includes('celular')) { iconName = 'smartphone'; iconColor = 'text-emerald-700'; }
    else if (tLower.includes('tablet')) { iconName = 'tablet'; iconColor = 'text-teal-700'; }
    else if (tLower.includes('proteína') || tLower.includes('medidor')) { iconName = 'activity'; iconColor = 'text-purple-700'; }
    else if (tLower.includes('redes') || tLower.includes('switch') || tLower.includes('router') || tLower.includes('fortinet')) { iconName = 'network'; iconColor = 'text-indigo-700'; }
    else if (tLower.includes('comunicaciones') || tLower.includes('audio')) { iconName = 'volume-2'; iconColor = 'text-sky-700'; }
    else if (tLower.includes('impresora')) { iconName = 'printer'; iconColor = 'text-orange-700'; }
    else if (tLower.includes('ups')) { iconName = 'zap'; iconColor = 'text-amber-600'; }
    else if (tLower.includes('desktop') || tLower.includes('servidor')) { iconName = 'server'; iconColor = 'text-slate-800'; }
    else if (tLower.includes('televisor') || tLower.includes('tv')) { iconName = 'tv'; iconColor = 'text-fuchsia-700'; }
    else if (tLower.includes('cámara') || tLower.includes('vigilancia')) { iconName = 'camera'; iconColor = 'text-red-700'; }
    else if (tLower.includes('lectores') || tLower.includes('biometría')) { iconName = 'fingerprint'; iconColor = 'text-emerald-800'; }
    else if (tLower.includes('almacenamiento')) { iconName = 'hard-drive'; iconColor = 'text-slate-700'; }
    else if (tLower.includes('drone') || tLower.includes('dron')) { iconName = 'navigation'; iconColor = 'text-amber-700'; }
    else if (tLower.includes('video beam') || tLower.includes('proyector')) { iconName = 'projector'; iconColor = 'text-blue-600'; }
    else if (tLower.includes('periféricos')) { iconName = 'mouse'; iconColor = 'text-cyan-700'; }
    else if (tLower.includes('aire')) { iconName = 'wind'; iconColor = 'text-teal-600'; }
    else { iconName = 'cpu'; iconColor = 'text-slate-700'; }

    const opBadgeHtml = getOperationalStatusBadge(asset.operational_status);
    const cleanTag = cleanAssetTag(asset.asset_tag);

    const hasPhoto = asset.photo_url && asset.photo_url.trim().length > 0;
    const photoCellHtml = hasPhoto
      ? `<img src="${asset.photo_url}" onclick="openDocModalToTab(${asset.id}, 'photo')" class="h-7 w-7 rounded-lg object-cover mx-auto cursor-pointer border-2 border-slate-300 hover:border-[#006837] hover:scale-110 transition shadow-sm" title="Ver fotografía de ${asset.asset_tag}" />`
      : `<button onclick="openDocModalToTab(${asset.id}, 'photo')" class="text-slate-400 hover:text-[#006837] p-1 rounded transition cursor-pointer" title="Subir / ver fotografía">
           <i data-lucide="camera" class="h-4 w-4 mx-auto"></i>
         </button>`;

    // Notas / Motivo limpio
    let cleanNotes = (asset.notes || '').trim();
    if (cleanNotes.toLowerCase().includes('sincronizado')) cleanNotes = '';
    const hasNotes = cleanNotes.length > 0;
    const notesHtml = hasNotes
      ? `<span class="inline-flex items-center space-x-1 text-[#111827] font-semibold truncate max-w-full" title="${cleanNotes}">
          <i data-lucide="message-square" class="h-3 w-3 text-[#006837] shrink-0"></i>
          <span class="truncate text-[10.5px] text-[#111827] font-bold">${cleanNotes}</span>
        </span>`
      : `<span class="text-slate-400 text-[10px] font-bold">-</span>`;

    tr.innerHTML = `
      <!-- Dispositivo + Nombre Equipo (11%) -->
      <td class="py-3 px-2 truncate">
        <div class="flex items-center space-x-1.5 truncate">
          <div class="p-1 rounded bg-slate-100 border border-slate-200 shrink-0">
            <i data-lucide="${iconName}" class="h-3.5 w-3.5 ${iconColor}"></i>
          </div>
          <div class="truncate">
            <span class="font-extrabold text-[#111827] truncate text-[11.5px] block">${asset.type}</span>
            ${asset.equipment_name ? `<span class="text-[9.5px] text-slate-500 font-semibold block truncate" title="${asset.equipment_name}">${asset.equipment_name}</span>` : ''}
          </div>
        </div>
      </td>

      <!-- ACTIVO LIMPIO (9%) -->
      <td class="py-3 px-2 font-mono font-extrabold text-[#006837] truncate text-xs" title="Código completo: ${asset.asset_tag}">
        ${cleanTag}
      </td>

      <!-- Serial (12%) -->
      <td class="py-3 px-2 font-mono font-bold text-[#111827] truncate text-[11px]" title="${asset.serial}">
        ${asset.serial}
      </td>

      <!-- IMEI (11%) -->
      <td class="py-3 px-2 font-mono font-bold text-[#111827] truncate text-[11px]" title="${asset.imei || 'N/A'}">
        ${asset.imei ? `<span class="text-[#111827] font-bold">${asset.imei}</span>` : '<span class="text-slate-400 font-normal">N/A</span>'}
      </td>

      <!-- Responsable / Sede (16%) -->
      <td class="py-3 px-2.5 font-bold text-[#111827] truncate text-[11.5px]" title="Clic para filtrar por ${asset.responsible_name}">
        <button onclick="selectCollaborator('${asset.responsible_name}')" class="hover:text-[#006837] hover:underline truncate text-left max-w-full block font-extrabold cursor-pointer text-[#111827]">
          ${asset.responsible_name}
        </button>
        <span class="text-[9px] text-[#006837] font-extrabold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-300 inline-block leading-tight mt-0.5">${asset.sede || 'MEDELLIN ADMON'}</span>
      </td>

      <!-- Cédula (10%) -->
      <td class="py-3 px-2 font-mono font-bold text-[#111827] truncate text-[11px]">
        ${asset.responsible_cedula || '-'}
      </td>

      <!-- Estado Operativo Real (13%) -->
      <td class="py-3 px-2 truncate">
        ${opBadgeHtml}
      </td>

      <!-- Fotografía (5%) -->
      <td class="py-3 px-2 text-center">
        ${photoCellHtml}
      </td>

      <!-- Notas / Motivo (6%) -->
      <td class="py-3 px-2 truncate">
        ${notesHtml}
      </td>

      <!-- Acción (7%) -->
      <td class="py-3 px-2.5 text-right whitespace-nowrap">
        <button
          onclick="openDocModal(${asset.id})"
          class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#006837] hover:bg-[#00522c] text-white border border-[#00522c] transition shadow-sm cursor-pointer"
          title="Ver o adjuntar actas"
        >
          <i data-lucide="file-text" class="h-3 w-3"></i>
          <span>Acta</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (window.lucide) lucide.createIcons();
}

// ------------------------------------------------------------------------------
// 7. BUSCADOR AVANZADO INTERACTIVO DE COLABORADORES
// ------------------------------------------------------------------------------
function openCollabDropdown() {
  const dropdown = document.getElementById('collab-dropdown-list');
  renderCollaboratorDropdown(allCollaborators);
  if (dropdown) dropdown.classList.remove('hidden');
}

function onCollabSearchInput(term) {
  const dropdown = document.getElementById('collab-dropdown-list');
  if (dropdown) dropdown.classList.remove('hidden');

  const filtered = allCollaborators.filter(c => 
    c.responsible_name.toLowerCase().includes(term.toLowerCase()) ||
    c.responsible_cedula.includes(term)
  );

  renderCollaboratorDropdown(filtered);
}

function renderCollaboratorDropdown(list) {
  const dropdown = document.getElementById('collab-dropdown-list');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  const allItem = document.createElement('div');
  allItem.className = 'p-2.5 hover:bg-emerald-50 cursor-pointer flex items-center justify-between text-[#006837] font-bold';
  allItem.innerHTML = '<span>👥 Ver todos los colaboradores</span>';
  allItem.onclick = () => selectCollaborator('Todos');
  dropdown.appendChild(allItem);

  if (list.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'p-3 text-center text-slate-400 italic text-[11px]';
    emptyItem.textContent = 'No se encontraron colaboradores.';
    dropdown.appendChild(emptyItem);
    return;
  }

  list.forEach(c => {
    const item = document.createElement('div');
    item.className = 'p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition text-[#111827]';
    item.innerHTML = `
  < div class="truncate pr-2" >
        <span class="font-extrabold text-[#111827] block truncate text-[11.5px]">👤 ${c.responsible_name}</span>
        <span class="text-[10px] text-slate-500 font-mono font-bold">C.C. ${c.responsible_cedula}</span>
      </div >
  <span class="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-[#111827] border border-slate-300 shrink-0">
    ${c.count} eq.
  </span>
`;
    item.onclick = () => selectCollaborator(c.responsible_name);
    dropdown.appendChild(item);
  });
}

function selectCollaborator(name) {
  const input = document.getElementById('collab-search-input');
  const clearBtn = document.getElementById('collab-clear-btn');
  const banner = document.getElementById('collaborator-active-banner');
  const activeName = document.getElementById('active-collaborator-name');
  const dropdown = document.getElementById('collab-dropdown-list');

  currentCollaborator = name;
  if (dropdown) dropdown.classList.add('hidden');

  if (name && name !== 'Todos') {
    if (input) input.value = name;
    if (clearBtn) clearBtn.classList.remove('hidden');
    if (banner) banner.classList.remove('hidden');
    if (activeName) activeName.textContent = name;
  } else {
    currentCollaborator = 'Todos';
    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
  }

  if (currentMainModule !== 'inventory') {
    switchMainModule('inventory');
  }

  renderTable();
  if (window.lucide) lucide.createIcons();
}

function clearCollaboratorFilter() {
  selectCollaborator('Todos');
}

function handleSearch(term) {
  currentSearch = term;
  renderTable();
  if (window.lucide) lucide.createIcons();
}

// ------------------------------------------------------------------------------
// 8. FILTROS RÁPIDOS
// ------------------------------------------------------------------------------
function setFilter(filter) {
  currentFilter = filter;
  const buttons = ['Todos', 'Sin-Acta', 'Pendiente', 'Verificado'];
  buttons.forEach(b => {
    const el = document.getElementById(`filter - ${ b } `);
    if (el) {
      el.className = 'px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition';
    }
  });

  const activeBtnKey = filter === 'Todos' ? 'Todos' : filter === 'Sin Acta' ? 'Sin-Acta' : filter === 'Pendiente de Firma' ? 'Pendiente' : 'Verificado';
  const activeEl = document.getElementById(`filter - ${ activeBtnKey } `);
  if (activeEl) {
    activeEl.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#006837] text-white shadow-sm transition';
  }

  if (currentMainModule !== 'inventory') {
    switchMainModule('inventory');
  }

  renderTable();
  if (window.lucide) lucide.createIcons();
}

// ------------------------------------------------------------------------------
// 9. SINCRONIZACIÓN EN SEGUNDO PLANO SILENCIOSA (TOAST A 3 SEGUNDOS)
// ------------------------------------------------------------------------------
async function syncGLPI() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador de Inventario puede sincronizar con GLPI.');
    return;
  }

  const btn = document.getElementById('btn-sync-glpi');
  if (!btn || btn.dataset.syncing === 'true') return;

  btn.dataset.syncing = 'true';
  btn.disabled = true;
  btn.innerHTML = `
  < svg class="animate-spin h-3.5 w-3.5 text-white inline mr-1" xmlns = "http://www.w3.org/2000/svg" fill = "none" viewBox = "0 0 24 24" >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg >
  <span>Sincronizando...</span>
`;

  try {
    const res = await fetch('/api/glpi/sync', { method: 'POST' });
    const data = await res.json();

    showToast('success', data.message || 'Sincronización completada con GLPI Somex.', 3000);

    await loadAssets();
    await loadCollaborators();

  } catch (err) {
    showToast('error', `Aviso al sincronizar: ${ err.message } `, 3000);
  } finally {
    btn.dataset.syncing = 'false';
    btn.disabled = false;
    btn.innerHTML = `
  < i data - lucide="refresh-cw" class="h-3.5 w-3.5 text-emerald-200" ></i >
    <span class="hidden lg:inline">Sincronizar GLPI</span>
`;
    if (window.lucide) lucide.createIcons();
  }
}

// ------------------------------------------------------------------------------
// 10. AUDITORÍA QR CON ESCANEO 100% AUTOMÁTICO (CERO BOTÓN MANUAL)
// ------------------------------------------------------------------------------
function setAuditCycle(cycle) {
  currentAuditCycle = cycle;

  const btnBim = document.getElementById('btn-cycle-bimensual');
  const btnSem = document.getElementById('btn-cycle-semestral');
  const label = document.getElementById('audit-cycle-label');

  if (label) label.textContent = cycle;

  if (cycle === 'Bimensual') {
    if (btnBim) btnBim.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#006837] text-white transition text-xs shadow-sm cursor-pointer';
    if (btnSem) btnSem.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition text-xs cursor-pointer';
  } else {
    if (btnBim) btnBim.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition text-xs cursor-pointer';
    if (btnSem) btnSem.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#006837] text-white transition text-xs shadow-sm cursor-pointer';
  }

  loadScannedAssets();
}

function toggleCameraScan() {
  if (isCameraScanning) {
    stopCameraScan();
  } else {
    startCameraScan();
  }
}

function startCameraScan() {
  const wrapper = document.getElementById('camera-scanner-wrapper');
  const btnText = document.getElementById('btn-toggle-camera-text');

  if (typeof Html5Qrcode === 'undefined') {
    showToast('error', 'Librería de lectura QR no disponible.');
    return;
  }

  if (wrapper) wrapper.classList.remove('hidden');
  if (btnText) btnText.textContent = '✕ Detener Cámara';
  isCameraScanning = true;

  try {
    if (!html5QrScanner) {
      html5QrScanner = new Html5Qrcode('qr-camera-reader');
    }

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    };

    html5QrScanner.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        onQrCodeDetected(decodedText);
      },
      (error) => {}
    ).catch(err => {
      console.warn('Fallback a cámara frontal...', err);
      html5QrScanner.start(
        { facingMode: 'user' },
        config,
        (decodedText) => onQrCodeDetected(decodedText),
        (err) => {}
      ).catch(e => {
        showToast('error', `No se pudo abrir la cámara: ${ e } `);
        stopCameraScan();
      });
    });

  } catch (err) {
    showToast('error', `Error al acceder a la cámara: ${ err.message } `);
    stopCameraScan();
  }
}

function stopCameraScan() {
  const wrapper = document.getElementById('camera-scanner-wrapper');
  const btnText = document.getElementById('btn-toggle-camera-text');

  if (wrapper) wrapper.classList.add('hidden');
  if (btnText) btnText.textContent = 'Activar Cámara para Escanear QR';
  isCameraScanning = false;

  if (html5QrScanner) {
    html5QrScanner.stop().catch(() => {});
  }
}

function onQrCodeDetected(code) {
  const input = document.getElementById('qr-scan-input');
  if (input) input.value = code;
  processAssetScan(code);
}

function handleScanQRAuto(val) {
  if (autoScanTimer) clearTimeout(autoScanTimer);
  const code = val.trim();
  if (code.length >= 4) {
    autoScanTimer = setTimeout(() => {
      processAssetScan(code);
    }, 350);
  }
}

async function handleScanQR() {
  if (autoScanTimer) clearTimeout(autoScanTimer);
  const input = document.getElementById('qr-scan-input');
  if (!input) return;
  const code = input.value.trim();
  if (!code) return;
  await processAssetScan(code);
}

async function processAssetScan(code) {
  try {
    const res = await fetch('/api/audit/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_code: code, cycle: currentAuditCycle })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || 'No se pudo registrar el escaneo');
    }

    const input = document.getElementById('qr-scan-input');
    if (input) {
      input.value = '';
      input.focus();
    }

    showToast('success', `¡Activo ${ data.asset.asset_tag } (${ data.asset.type }) verificado en ${ currentAuditCycle } !`, 3000);

    // Actualizar datos de auditoría
    await loadScannedAssets();
    await loadAssets();

    if (currentMainModule === 'gallery') {
      loadPhotoGallery();
    }

  } catch (err) {
    showToast('error', err.message, 3000);
  }
}

let currentAuditSubtab = 'scanned';

function switchAuditSubtab(tab) {
  currentAuditSubtab = tab;
  const btnScanned = document.getElementById('audit-subtab-scanned-btn');
  const btnPending = document.getElementById('audit-subtab-pending-btn');
  const viewScanned = document.getElementById('audit-subview-scanned');
  const viewPending = document.getElementById('audit-subview-pending');

  if (tab === 'scanned') {
    if (btnScanned) btnScanned.className = 'py-3 px-4 font-bold text-[#006837] border-b-2 border-[#006837] transition flex items-center space-x-1.5 cursor-pointer';
    if (btnPending) btnPending.className = 'py-3 px-4 font-semibold text-slate-500 hover:text-slate-800 transition flex items-center space-x-1.5 cursor-pointer';
    if (viewScanned) viewScanned.classList.remove('hidden');
    if (viewPending) viewPending.classList.add('hidden');
  } else {
    if (btnScanned) btnScanned.className = 'py-3 px-4 font-semibold text-slate-500 hover:text-slate-800 transition flex items-center space-x-1.5 cursor-pointer';
    if (btnPending) btnPending.className = 'py-3 px-4 font-bold text-amber-700 border-b-2 border-amber-600 transition flex items-center space-x-1.5 cursor-pointer';
    if (viewScanned) viewScanned.classList.add('hidden');
    if (viewPending) viewPending.classList.remove('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

async function loadScannedAssets() {
  try {
    const res = await fetch(`/ api / audit / scanned ? cycle = ${ currentAuditCycle } `);
    const data = await res.json();
    if (res.ok) {
      scannedAssets = data.scanned || [];
      const pendingAssets = data.pending || [];

      const kTotal = document.getElementById('audit-kpi-total');
      const kScanned = document.getElementById('audit-kpi-scanned');
      const kPending = document.getElementById('audit-kpi-pending');
      const pPct = document.getElementById('audit-progress-percent');
      const pBar = document.getElementById('audit-progress-bar');
      const tabScanned = document.getElementById('scanned-tab-count');
      const tabPending = document.getElementById('pending-tab-count');

      if (kTotal) kTotal.textContent = data.total;
      if (kScanned) kScanned.textContent = data.count;
      if (kPending) kPending.textContent = data.pending_count;
      if (pPct) pPct.textContent = `${ data.compliance_percentage }% `;
      if (pBar) pBar.style.width = `${ data.compliance_percentage }% `;
      if (tabScanned) tabScanned.textContent = data.count;
      if (tabPending) tabPending.textContent = data.pending_count;

      renderScannedGrid(scannedAssets);
      renderPendingAuditTable(pendingAssets);
    }
  } catch (err) {
    console.error('Error cargando estado dinámico de auditoría:', err);
  }
}

// REQUERIMIENTO: ALTO CONTRASTE (#111827 / #1E293B) EN CUADRÍCULA DE ESCANEADOS
function renderScannedGrid(list) {
  const grid = document.getElementById('scanned-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (list.length === 0) {
    grid.innerHTML = `
  < div class="col-span-full py-12 text-center text-[#111827] bg-slate-50 border border-slate-200 rounded-2xl" >
        <i data-lucide="qr-code" class="h-8 w-8 mx-auto mb-2 text-slate-400"></i>
        <p class="text-xs font-bold text-[#111827]">No hay equipos escaneados en este ciclo ${currentAuditCycle}.</p>
        <p class="text-[11px] text-slate-600 mt-1">Usa la cámara web/celular o la pistola lectora arriba para verificar la presencia física de los activos.</p>
      </div >
  `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  list.forEach(asset => {
    const card = document.createElement('div');
    card.className = 'bg-white border-2 border-slate-200 hover:border-[#006837] rounded-xl overflow-hidden shadow-sm transition flex flex-col';

    const cleanTag = cleanAssetTag(asset.asset_tag);
    const photoUrl = asset.photo_url || '/static/demo_laptop.svg';

    card.innerHTML = `
  < div class="relative h-32 bg-slate-100 border-b border-slate-200 overflow-hidden flex items-center justify-center group" >
        <img src="${photoUrl}" alt="Foto de ${asset.asset_tag}" class="w-full h-full object-cover" />
        <span class="absolute top-2 right-2 px-2 py-0.5 rounded text-[9.5px] font-extrabold bg-[#006837] text-white shadow-sm flex items-center space-x-1">
          <i data-lucide="check" class="h-2.5 w-2.5"></i>
          <span>VERIFICADO</span>
        </span>
        <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10.5px] font-mono font-extrabold bg-white text-[#006837] border border-slate-300 shadow-md">
          ${cleanTag}
        </span>
      </div >

  <div class="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
    <div>
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-[#111827] text-xs">${asset.type}</span>
        <span class="text-[10.5px] text-[#1E293B] font-mono font-bold">${asset.serial}</span>
      </div>
      <p class="text-[#111827] font-bold text-xs truncate mt-1">👤 ${asset.responsible_name}</p>
      <p class="text-[10.5px] text-[#1E293B] font-mono font-bold mt-0.5">C.C. ${asset.responsible_cedula}</p>
    </div>

    <div class="pt-2 border-t border-slate-200 flex items-center justify-between text-[10.5px]">
      <span class="flex items-center space-x-1 text-[#006837] font-extrabold">
        <i data-lucide="check-circle" class="h-3.5 w-3.5"></i>
        <span>${asset.last_scanned_at || 'Hoy'}</span>
      </span>
      <span class="px-2 py-0.5 rounded bg-emerald-50 text-[#006837] border border-emerald-300 font-extrabold text-[10px]">
        ${asset.audit_cycle || currentAuditCycle}
      </span>
    </div>
  </div>
`;

    grid.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

// REQUERIMIENTO: SE ELIMINÓ POR COMPLETO LA COLUMNA 'ACCIÓN' Y EL BOTÓN '✓ ESCANEAR'
function renderPendingAuditTable(list) {
  const tbody = document.getElementById('pending-audit-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
  < tr >
  <td colspan="5" class="py-10 text-center text-[#006837] font-bold text-xs">
    <i data-lucide="check-check" class="h-7 w-7 mx-auto mb-1 text-[#006837]"></i>
    ¡Excelente! Todos los activos del inventario han sido verificados al 100% en este ciclo.
  </td>
      </tr >
  `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  list.forEach(asset => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-amber-50/40 transition border-b border-slate-200 text-[#111827] font-medium';

    const cleanTag = cleanAssetTag(asset.asset_tag);

    tr.innerHTML = `
  < td class="py-3 px-3 font-extrabold text-[#111827] truncate text-[11.5px]" > ${ asset.type }</td >
      <td class="py-3 px-3 font-mono font-extrabold text-[#006837] truncate text-xs" title="Placa: ${asset.asset_tag}">${cleanTag}</td>
      <td class="py-3 px-3 font-mono font-bold text-[#111827] text-[11px] truncate">${asset.serial}</td>
      <td class="py-3 px-3 text-[#111827] font-bold truncate text-[11.5px]">👤 ${asset.responsible_name}</td>
      <td class="py-3 px-3">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-extrabold ${
          asset.document_status === 'Pendiente de Firma'
            ? 'bg-amber-100 text-[#78350f] border border-amber-300'
            : 'bg-rose-100 text-[#881337] border border-rose-300'
        }">
          ${asset.document_status || 'Sin Acta'}
        </span>
      </td>
`;
    tbody.appendChild(tr);
  });

  if (window.lucide) lucide.createIcons();
}

function downloadAuditPDF() {
  showToast('success', 'Generando informe oficial en PDF para Control Organizacional...', 3000);
  const url = `/ api / audit / report - pdf ? cycle = ${ encodeURIComponent(currentAuditCycle) } `;
  window.open(url, '_blank');
}

async function resetAuditCyclePrompt() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede reiniciar rondas de auditoría.');
    return;
  }

  const ok = confirm(`¿Deseas reiniciar la ronda de auditoría ${ currentAuditCycle }? Esto marcará todos los activos como pendientes de escaneo.`);
  if (!ok) return;

  try {
    const res = await fetch('/api/audit/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle: currentAuditCycle })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('success', data.message || `Ronda ${ currentAuditCycle } reiniciada.`, 3000);
      await loadScannedAssets();
      await loadAssets();
    }
  } catch (err) {
    showToast('error', err.message);
  }
}

// ------------------------------------------------------------------------------
// 11. MÓDULO DE FOTOGRAFÍAS ORGANIZADO POR CARPETAS (FECHA / CICLO) + ELIMINACIÓN
// ------------------------------------------------------------------------------
function groupPhotosIntoFolders(assets) {
  const withPhotos = assets.filter(a => a.photo_url && a.photo_url.trim().length > 0);
  const groups = {};

  withPhotos.forEach(a => {
    let folderKey = 'inventario_base';
    let folderName = 'Inventario Base — Fotografías Generales';
    let cycleName = a.audit_cycle || 'General';
    let dateSort = '1970-01-01';

    if (a.last_scanned_at && a.last_scanned_at.trim().length > 0) {
      const scanDateStr = a.last_scanned_at.trim().split(' ')[0].split('T')[0];
      const cycle = a.audit_cycle || 'Bimensual';
      folderKey = `${ scanDateStr }_${ cycle } `;
      dateSort = scanDateStr;

      let friendlyDate = scanDateStr;
      try {
        const parts = scanDateStr.split('-');
        if (parts.length === 3) {
          const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          const mIdx = parseInt(parts[1], 10) - 1;
          friendlyDate = `${ parts[2] } ${ months[mIdx] || parts[1] } ${ parts[0] } `;
        }
      } catch (e) {}

      folderName = `${ friendlyDate } — Auditoría ${ cycle } `;
      cycleName = cycle;
    }

    if (!groups[folderKey]) {
      groups[folderKey] = {
        id: folderKey,
        name: folderName,
        cycle: cycleName,
        dateSort: dateSort,
        assets: []
      };
    }
    groups[folderKey].assets.push(a);
  });

  return Object.values(groups).sort((a, b) => b.dateSort.localeCompare(a.dateSort));
}

function loadPhotoGallery() {
  const foldersContainer = document.getElementById('gallery-folders-container');
  const photosContainer = document.getElementById('gallery-photos-container');
  const grid = document.getElementById('gallery-grid');
  const countSpan = document.getElementById('gallery-total-count');
  const breadcrumb = document.getElementById('gallery-breadcrumb');
  const backBtn = document.getElementById('gallery-back-btn');
  const btnDeleteAll = document.getElementById('btn-delete-all-photos');
  const btnDeleteFolder = document.getElementById('btn-delete-current-folder');

  if (!foldersContainer || !photosContainer || !grid) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  cachedGalleryFolders = groupPhotosIntoFolders(allAssets);

  // Total de fotos en la galería
  const totalPhotos = allAssets.filter(a => a.photo_url && a.photo_url.trim().length > 0).length;
  if (countSpan) countSpan.textContent = totalPhotos;

  // Botón Vaciar Galería (solo visible para Administrador si hay fotos)
  if (btnDeleteAll) {
    btnDeleteAll.style.display = (isAdmin && totalPhotos > 0) ? 'inline-flex' : 'none';
  }

  // ESTADO 1: Vista Dentro de una Carpeta Específica
  if (currentGalleryFolderId) {
    const currentFolder = cachedGalleryFolders.find(f => f.id === currentGalleryFolderId);
    if (!currentFolder || currentFolder.assets.length === 0) {
      currentGalleryFolderId = null;
      loadPhotoGallery();
      return;
    }

    foldersContainer.classList.add('hidden');
    photosContainer.classList.remove('hidden');
    if (backBtn) backBtn.classList.remove('hidden');

    if (breadcrumb) {
      breadcrumb.innerHTML = `
  < i data - lucide="folder-open" class="h-4 w-4 text-[#006837]" ></i >
        <span class="text-[#006837]">${currentFolder.name}</span>
        <span class="text-slate-400 font-normal">(${currentFolder.assets.length} fotografías)</span>
`;
    }

    if (btnDeleteFolder) {
      btnDeleteFolder.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    grid.innerHTML = '';
    currentFolder.assets.forEach(asset => {
      const card = document.createElement('div');
      card.className = 'relative bg-white border-2 border-slate-200 hover:border-[#006837] rounded-xl overflow-hidden shadow-sm transition flex flex-col group';

      const cleanTag = cleanAssetTag(asset.asset_tag);
      const photoUrl = asset.photo_url;
      const isAuditScanned = asset.is_scanned === 1;

      card.innerHTML = `
  < div class="relative h-28 bg-slate-100 border-b border-slate-200 overflow-hidden flex items-center justify-center cursor-pointer" onclick = "openDocModalToTab(${asset.id}, 'photo')" >
          <img src="${photoUrl}" alt="Foto de ${asset.asset_tag}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          <span class="absolute bottom-1.5 left-1.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-extrabold bg-white text-[#006837] border border-slate-300 shadow-sm">
            ${cleanTag}
          </span>
          ${
  isAuditScanned ? `
            <span class="absolute top-1.5 left-1.5 px-1.5 py-0.2 rounded text-[8.5px] font-extrabold bg-[#006837] text-white shadow-sm flex items-center space-x-0.5">
              <i data-lucide="check-circle" class="h-2.5 w-2.5"></i>
              <span>QR</span>
            </span>
          ` : ''
}

          < !--Botón de eliminación individual de foto(Solo Administrador)-- >
  ${
    isAdmin ? `
            <button
              onclick="event.stopPropagation(); confirmDeleteSinglePhoto(${asset.id}, '${cleanTag}')"
              class="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 hover:bg-rose-600 text-slate-600 hover:text-white border border-slate-300 hover:border-rose-600 transition shadow-sm cursor-pointer"
              title="Eliminar fotografía de ${cleanTag}"
            >
              <i data-lucide="trash-2" class="h-3.5 w-3.5"></i>
            </button>
          ` : ''
}
        </div >

  <div class="p-2.5 space-y-0.5 text-[11px] cursor-pointer" onclick="openDocModalToTab(${asset.id}, 'photo')">
    <div class="flex items-center justify-between">
      <span class="font-extrabold text-[#111827] truncate">${asset.type}</span>
      <span class="text-[9.5px] text-[#006837] font-bold">${asset.sede || 'Medellín'}</span>
    </div>
    <span class="text-[#111827] font-semibold block truncate text-[10.5px]">👤 ${asset.responsible_name}</span>
    <span class="text-slate-500 block font-mono text-[9.5px] truncate">${asset.serial}</span>
  </div>
`;

      grid.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
    return;
  }

  // ESTADO 2: Vista Principal de Carpetas Agrupadas por Fecha/Ciclo
  photosContainer.classList.add('hidden');
  foldersContainer.classList.remove('hidden');
  if (backBtn) backBtn.classList.add('hidden');
  if (btnDeleteFolder) btnDeleteFolder.style.display = 'none';

  if (breadcrumb) {
    breadcrumb.innerHTML = `
  < i data - lucide="folder" class="h-4 w-4 text-[#006837]" ></i >
    <span>Carpetas por Jornada y Ciclo de Auditoría</span>
`;
  }

  foldersContainer.innerHTML = '';

  if (cachedGalleryFolders.length === 0) {
    foldersContainer.innerHTML = `
  < div class="col-span-full py-14 text-center text-[#111827] bg-white border-2 border-slate-200 rounded-2xl shadow-sm" >
        <i data-lucide="camera" class="h-10 w-10 mx-auto mb-2 text-slate-400"></i>
        <p class="text-sm font-extrabold text-[#111827]">No hay fotografías registradas aún en el sistema.</p>
        <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">Al escanear un activo con la cámara web/celular o adjuntar su foto en el inventario, se organizará automáticamente por su jornada correspondiente aquí.</p>
      </div >
  `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  cachedGalleryFolders.forEach(folder => {
    const card = document.createElement('div');
    card.className = 'bg-white border-2 border-slate-200 hover:border-[#006837] rounded-2xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between group cursor-pointer';
    card.onclick = () => openGalleryFolder(folder.id);

    // Miniaturas de muestra (hasta 3 fotos)
    const previewAssets = folder.assets.slice(0, 3);
    const thumbsHtml = previewAssets.map(a => `
  < div class="h-10 w-10 rounded-lg overflow-hidden border border-slate-300 bg-slate-100 shrink-0 shadow-sm" >
    <img src="${a.photo_url}" class="h-full w-full object-cover" />
      </div >
  `).join('');

    card.innerHTML = `
  < div class="space-y-3" >
        <div class="flex items-start justify-between">
          <div class="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#006837] shadow-sm group-hover:bg-[#006837] group-hover:text-white transition">
            <i data-lucide="folder" class="h-6 w-6"></i>
          </div>
          
          <div class="flex items-center space-x-1.5">
            <span class="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-emerald-50 text-[#006837] border border-emerald-200">
              ${folder.cycle}
            </span>
            ${isAdmin ? `
              <button
                onclick="event.stopPropagation(); confirmDeleteFolderPhotos('${folder.id}', '${folder.name}', ${JSON.stringify(folder.assets.map(a => a.id))})"
                class="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Vaciar carpeta ${folder.name}"
              >
                <i data-lucide="trash-2" class="h-4 w-4"></i>
              </button>
            ` : ''}
          </div>
        </div>

        <div>
          <h3 class="font-extrabold text-[#111827] text-sm group-hover:text-[#006837] transition leading-snug">
            ${folder.name}
          </h3>
          <p class="text-xs text-slate-600 font-semibold mt-0.5">
            📁 ${folder.assets.length} fotografías verificadas
          </p>
        </div>
      </div >

  <div class="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
    <div class="flex items-center -space-x-1.5">
      ${thumbsHtml}
    </div>
    <span class="text-xs font-bold text-[#006837] group-hover:underline flex items-center space-x-1">
      <span>Abrir carpeta</span>
      <i data-lucide="chevron-right" class="h-3.5 w-3.5"></i>
    </span>
  </div>
`;

    foldersContainer.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function openGalleryFolder(folderId) {
  currentGalleryFolderId = folderId;
  loadPhotoGallery();
}

function closeGalleryFolder() {
  currentGalleryFolderId = null;
  loadPhotoGallery();
}

// Eliminación individual de foto
async function confirmDeleteSinglePhoto(assetId, assetTag) {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede eliminar fotografías.');
    return;
  }

  const ok = confirm(`¿Estás seguro de que deseas eliminar la fotografía del activo "${assetTag}" ? Esta acción borrará el archivo y no se puede deshacer.`);
  if (!ok) return;

  try {
    const res = await fetch(`/ api / assets / ${ assetId }/photo`, { method: 'DELETE' });
const data = await res.json();
if (!res.ok) throw new Error(data.detail || 'Error al eliminar la fotografía');

showToast('success', data.message || 'Fotografía eliminada con éxito.', 3000);
await loadAssets();
loadPhotoGallery();
  } catch (err) {
  showToast('error', err.message);
}
}

// Eliminación masiva de carpeta
async function confirmDeleteCurrentFolder() {
  if (!currentGalleryFolderId) return;
  const currentFolder = cachedGalleryFolders.find(f => f.id === currentGalleryFolderId);
  if (!currentFolder) return;
  const assetIds = currentFolder.assets.map(a => a.id);
  await confirmDeleteFolderPhotos(currentFolder.id, currentFolder.name, assetIds);
}

async function confirmDeleteFolderPhotos(folderId, folderName, assetIds) {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede eliminar fotografías.');
    return;
  }

  const ok = confirm(`¿Estás seguro de que deseas eliminar TODAS las ${assetIds.length} fotografías de la jornada:\n"${folderName}"?\n\nEsta acción borrará los archivos físicos del servidor.`);
  if (!ok) return;

  try {
    const res = await fetch('/api/photos/delete-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_ids: assetIds, folder_name: folderName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al eliminar las fotografías');

    showToast('success', data.message || 'Fotografías eliminadas con éxito.', 3000);
    currentGalleryFolderId = null;
    await loadAssets();
    loadPhotoGallery();
  } catch (err) {
    showToast('error', err.message);
  }
}

// Vaciar toda la galería
async function confirmDeleteAllPhotos() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede vaciar la galería.');
    return;
  }

  const ok = confirm(`⚠️ ADVERTENCIA CRÍTICA: ¿Estás seguro de que deseas vaciar TODA la galería de fotografías?\n\nSe eliminarán permanentemente todas las imágenes de todos los activos en el servidor.`);
  if (!ok) return;

  try {
    const res = await fetch('/api/photos/delete-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al vaciar la galería');

    showToast('success', data.message || 'Todas las fotografías han sido eliminadas.', 3000);
    currentGalleryFolderId = null;
    await loadAssets();
    loadPhotoGallery();
  } catch (err) {
    showToast('error', err.message);
  }
}

async function uploadAssetPhotoFromModal() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede subir fotografías.');
    return;
  }

  if (!activeAsset) return;
  const input = document.getElementById('modal-photo-file-input');
  if (!input.files || input.files.length === 0) {
    showToast('error', 'Selecciona un archivo de imagen (JPG, PNG).');
    return;
  }

  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/assets/${activeAsset.id}/photo`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al subir la fotografía');

    activeAsset.photo_url = data.photo_url;
    showToast('success', 'Fotografía guardada con éxito.');

    const img = document.getElementById('modal-asset-photo-img');
    const placeholder = document.getElementById('modal-asset-photo-placeholder');
    if (img && placeholder) {
      img.src = data.photo_url;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    }

    await loadAssets();
    if (currentMainModule === 'gallery') loadPhotoGallery();

  } catch (err) {
    showToast('error', err.message);
  }
}

// ------------------------------------------------------------------------------
// 12. MÓDULO DE ACTIVOS DADOS DE BAJA (ALTO CONTRASTE + DOCUMENTOS)
// ------------------------------------------------------------------------------
async function loadBajas() {
  const tbody = document.getElementById('bajas-table-body');
  const footer = document.getElementById('bajas-footer-count');
  if (!tbody) return;
  tbody.innerHTML = '';

  try {
    const res = await fetch('/api/bajas');
    const data = await res.json();
    if (res.ok) {
      allBajas = data.bajas || [];
      if (footer) footer.textContent = `${allBajas.length} equipo(s) retirado(s) formalmente`;

      if (allBajas.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="py-12 text-center text-[#111827] font-semibold text-xs">
              <i data-lucide="archive" class="h-6 w-6 mx-auto mb-2 text-slate-400"></i>
              No hay activos dados de baja en el registro histórico.
            </td>
          </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      allBajas.forEach(asset => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-200 text-[#111827] font-medium';

        const cleanTag = cleanAssetTag(asset.asset_tag);

        tr.innerHTML = `
          <td class="py-3 px-3 font-extrabold text-[#111827] truncate text-[11.5px]">${asset.type}</td>
          <td class="py-3 px-3 font-mono font-extrabold text-amber-800 truncate text-xs" title="Código: ${asset.asset_tag}">${cleanTag}</td>
          <td class="py-3 px-3 font-mono font-bold text-[#111827] truncate text-[11px]">${asset.serial}</td>
          <td class="py-3 px-3 text-[#111827] font-bold truncate text-[11.5px]">👤 ${asset.responsible_name}</td>
          <td class="py-3 px-3 font-mono font-bold text-[#111827] text-[11px]">${asset.baja_date || '-'}</td>
          <td class="py-3 px-3 text-[#111827] font-medium truncate text-[11px]" title="${asset.baja_reason || ''}">${asset.baja_reason || '-'}</td>
          
          <!-- DOCUMENTO 1 - ACTA DE BAJA PDF REAL -->
          <td class="py-3 px-2 text-center">
            ${asset.baja_acta_url ? `
              <a 
                href="${asset.baja_acta_url}" 
                target="_blank" 
                download 
                class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-100 text-[#78350f] hover:bg-amber-200 border border-amber-300 transition text-[11px] font-extrabold shadow-sm"
                title="Descargar / Ver Acta de Baja"
              >
                <i data-lucide="file-text" class="h-3 w-3"></i>
                <span>Acta</span>
              </a>
            ` : '<span class="text-slate-400 font-bold text-[10px]">-</span>'}
          </td>

          <!-- DOCUMENTO 2 - CERTIFICADO DISPOSICIÓN FINAL RAEE PDF REAL -->
          <td class="py-3 px-2 text-center">
            ${asset.disposicion_final_url ? `
              <a 
                href="${asset.disposicion_final_url}" 
                target="_blank" 
                download 
                class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-[#00522c] hover:bg-emerald-200 border border-emerald-300 transition text-[11px] font-extrabold shadow-sm"
                title="Descargar / Ver Certificado Disposición Final RAEE"
              >
                <i data-lucide="shield-check" class="h-3 w-3"></i>
                <span>RAEE</span>
              </a>
            ` : '<span class="text-slate-400 font-bold text-[10px]">-</span>'}
          </td>
        `;

        tbody.appendChild(tr);
      });

      if (window.lucide) lucide.createIcons();
    }
  } catch (err) {
    console.error('Error al cargar bajas:', err);
  }
}

function openBajaModal() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede tramitar bajas de activos.');
    return;
  }

  const select = document.getElementById('baja-select-asset');
  const dateInput = document.getElementById('baja-date-input');

  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  if (select) {
    select.innerHTML = '<option value="">-- Seleccionar Activo --</option>';
    const actives = allAssets.filter(a => a.document_status !== 'Dado de Baja');
    actives.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${cleanAssetTag(a.asset_tag)} - ${a.type} (${a.serial}) - ${a.responsible_name}`;
      select.appendChild(opt);
    });
  }

  const modal = document.getElementById('baja-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeBajaModal() {
  const modal = document.getElementById('baja-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleDecommissionAsset(e) {
  e.preventDefault();
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede tramitar bajas.');
    return;
  }

  const assetId = document.getElementById('baja-select-asset').value;
  const bajaDate = document.getElementById('baja-date-input').value;
  const reason = document.getElementById('baja-reason-select').value;
  const actaFile = document.getElementById('baja-pdf-file').files[0];
  const disposicionFile = document.getElementById('disposicion-pdf-file').files[0];
  const btn = document.getElementById('btn-submit-baja');

  if (!assetId) {
    showToast('error', 'Selecciona el activo a dar de baja.');
    return;
  }
  if (!actaFile || !disposicionFile) {
    showToast('error', 'Es obligatorio adjuntar tanto el Acta de Baja como el Certificado de Disposición Final.');
    return;
  }

  const formData = new FormData();
  formData.append('baja_date', bajaDate);
  formData.append('reason', reason);
  formData.append('acta_file', actaFile);
  formData.append('disposicion_file', disposicionFile);

  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/assets/${assetId}/baja`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al procesar la baja');

    showToast('success', 'Baja tramitada con éxito y documentos archivados.');
    closeBajaModal();
    await loadAssets();
    await loadBajas();

  } catch (err) {
    showToast('error', err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ------------------------------------------------------------------------------
// 13. MODAL DE GESTIÓN DOCUMENTAL Y VISOR DE ACTAS EN PDF REAL
// ------------------------------------------------------------------------------
function openDocModal(assetId) {
  openDocModalToTab(assetId, null);
}

function openDocModalToTab(assetId, preferredTab) {
  activeAsset = allAssets.find(a => a.id === assetId);
  if (!activeAsset) return;

  const cleanTag = cleanAssetTag(activeAsset.asset_tag);
  const tagEl = document.getElementById('modal-asset-tag');
  const subEl = document.getElementById('modal-asset-sub');
  const respEl = document.getElementById('modal-resp-name');
  const cedEl = document.getElementById('modal-resp-cedula');
  const notesInput = document.getElementById('modal-asset-notes-input');

  if (tagEl) tagEl.textContent = `Activo: ${cleanTag} (${activeAsset.asset_tag})`;
  if (subEl) subEl.textContent = `${activeAsset.type} • Serial: ${activeAsset.serial} ${activeAsset.imei ? '• IMEI: ' + activeAsset.imei : ''} • Sede: ${activeAsset.sede || 'Medellín'}`;
  if (respEl) respEl.textContent = activeAsset.responsible_name;
  if (cedEl) cedEl.textContent = activeAsset.responsible_cedula;

  let userNotes = activeAsset.notes || '';
  if (userNotes.toLowerCase().includes('sincronizado')) userNotes = '';
  if (notesInput) notesInput.value = userNotes;

  const photoImg = document.getElementById('modal-asset-photo-img');
  const photoPlh = document.getElementById('modal-asset-photo-placeholder');
  if (photoImg && photoPlh) {
    if (activeAsset.photo_url) {
      photoImg.src = activeAsset.photo_url;
      photoImg.classList.remove('hidden');
      photoPlh.classList.add('hidden');
    } else {
      photoImg.src = '';
      photoImg.classList.add('hidden');
      photoPlh.classList.remove('hidden');
    }
  }

  const fileInput = document.getElementById('modal-pdf-file');
  const errBox = document.getElementById('modal-error-box');
  const reportBox = document.getElementById('validation-report-container');
  if (fileInput) fileInput.value = '';
  if (errBox) errBox.classList.add('hidden');
  if (reportBox) reportBox.classList.add('hidden');

  renderDocHistory(activeAsset.documents || []);
  applyRolePermissions();

  if (preferredTab) {
    switchModalTab(preferredTab);
  } else if (activeAsset.documents && activeAsset.documents.length > 0) {
    switchModalTab('viewer');
  } else {
    switchModalTab('validate');
  }

  const modal = document.getElementById('doc-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeDocModal() {
  const modal = document.getElementById('doc-modal');
  if (modal) modal.classList.add('hidden');
  const iframe = document.getElementById('pdf-iframe-viewer');
  if (iframe) iframe.src = 'about:blank';
  activeAsset = null;
}

function switchModalTab(tab) {
  currentModalTab = tab;
  const tabs = ['validate', 'viewer', 'photo', 'notes'];

  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    if (t === tab) {
      if (btn) btn.className = 'py-3 px-3.5 font-bold text-[#006837] border-b-2 border-[#006837] transition flex items-center space-x-1.5 cursor-pointer';
      if (content) content.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'py-3 px-3.5 font-medium text-slate-500 hover:text-slate-800 transition flex items-center space-x-1.5 cursor-pointer';
      if (content) content.classList.add('hidden');
    }
  });

  if (tab === 'viewer' && activeAsset && activeAsset.documents && activeAsset.documents.length > 0) {
    const firstDoc = activeAsset.documents[0];
    if (firstDoc.file_url) {
      viewPdfInViewer(firstDoc.file_url, firstDoc.file_name);
    }
  }

  if (window.lucide) lucide.createIcons();
}

function renderDocHistory(docs) {
  const container = document.getElementById('modal-history-list');
  const countEl = document.getElementById('viewer-count');
  if (!container) return;
  container.innerHTML = '';

  if (countEl) countEl.textContent = `${docs.length} documento(s) asociado(s)`;

  if (docs.length === 0) {
    container.innerHTML = '<div class="p-3 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold">No hay actas ni facturas adjuntas a este equipo aún.</div>';
    const iframe = document.getElementById('pdf-iframe-viewer');
    const placeholder = document.getElementById('pdf-placeholder-msg');
    const extLink = document.getElementById('btn-open-external-pdf');
    if (iframe) iframe.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (extLink) extLink.classList.add('hidden');
    return;
  }

  docs.forEach((d, idx) => {
    const div = document.createElement('div');
    div.className = 'p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs hover:border-[#006837] transition';

    div.innerHTML = `
      <div class="truncate pr-2">
        <span class="font-extrabold text-[#111827] block truncate text-[11.5px]">${d.doc_type}</span>
        <span class="text-[10px] text-slate-600 font-mono font-bold">${d.file_name} • ${d.created_at || ''}</span>
      </div>
      <div class="flex items-center space-x-1.5 shrink-0">
        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${d.validation_status === 'Aprobado'
        ? 'bg-emerald-100 text-[#00522c] border border-emerald-300'
        : 'bg-amber-100 text-[#78350f] border border-amber-300'
      }">
          ${d.validation_status}
        </span>
        ${d.file_url ? `
          <button 
            onclick="viewPdfInViewer('${d.file_url}', '${d.file_name}')" 
            class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#006837] text-white hover:bg-[#00522c] transition flex items-center space-x-1 shadow-sm cursor-pointer"
          >
            <i data-lucide="eye" class="h-3 w-3"></i>
            <span>Ver PDF</span>
          </button>
        ` : ''}
      </div>
    `;
    container.appendChild(div);

    if (idx === 0 && d.file_url) {
      viewPdfInViewer(d.file_url, d.file_name);
    }
  });

  if (window.lucide) lucide.createIcons();
}

function viewPdfInViewer(url, title) {
  const iframe = document.getElementById('pdf-iframe-viewer');
  const placeholder = document.getElementById('pdf-placeholder-msg');
  const titleEl = document.getElementById('current-viewing-title');
  const externalLink = document.getElementById('btn-open-external-pdf');

  if (titleEl) titleEl.textContent = `Viendo documento: ${title}`;
  if (iframe) {
    iframe.src = url;
    iframe.classList.remove('hidden');
  }
  if (placeholder) placeholder.classList.add('hidden');

  if (externalLink) {
    externalLink.href = url;
    externalLink.setAttribute('download', title || 'documento.pdf');
    externalLink.classList.remove('hidden');
  }
}

// ------------------------------------------------------------------------------
// 14. SUBIDA Y VALIDACIÓN DE ACTAS CON MOTOR PYTHON
// ------------------------------------------------------------------------------
async function uploadAndValidatePDF() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador de Inventario puede adjuntar actas.');
    return;
  }

  const fileInput = document.getElementById('modal-pdf-file');
  const errorBox = document.getElementById('modal-error-box');
  const btn = document.getElementById('btn-run-validation');
  const btnText = document.getElementById('btn-run-validation-text');

  if (!fileInput.files || fileInput.files.length === 0) {
    if (errorBox) {
      errorBox.textContent = 'Selecciona un archivo PDF para validar.';
      errorBox.classList.remove('hidden');
    }
    return;
  }

  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    if (errorBox) {
      errorBox.textContent = 'Solo se admiten documentos en formato PDF.';
      errorBox.classList.remove('hidden');
    }
    return;
  }

  if (errorBox) errorBox.classList.add('hidden');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Extrayendo texto y procesando validación TIC-F-001...';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_type', document.getElementById('modal-doc-type').value);

  try {
    const res = await fetch(`/api/assets/${activeAsset.id}/validate-doc`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al validar el documento PDF');

    renderValidationReport(data);

    activeAsset.document_status = data.new_status;
    if (data.file_url) {
      if (!activeAsset.documents) activeAsset.documents = [];
      activeAsset.documents.unshift({
        doc_type: document.getElementById('modal-doc-type').value,
        file_name: file.name,
        file_url: data.file_url,
        validation_status: data.validation.is_valid ? 'Aprobado' : 'Observación',
        created_at: 'Ahora'
      });
      renderDocHistory(activeAsset.documents);
    }

    await loadAssets();
    showToast('success', 'Documento verificado y almacenado correctamente.', 3000);

  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Validar Automáticamente con Motor Python';
  }
}

function renderValidationReport(data) {
  const container = document.getElementById('validation-report-container');
  const val = data.validation;
  if (!container || !val) return;
  container.classList.remove('hidden');

  const banner = document.getElementById('report-banner');
  const title = document.getElementById('report-banner-title');
  const summary = document.getElementById('report-banner-summary');
  const icon = document.getElementById('report-banner-icon');

  if (val.is_valid) {
    banner.className = 'p-3.5 rounded-xl border text-xs flex items-start space-x-3 bg-emerald-50 border-emerald-200 text-[#006837]';
    icon.innerHTML = '<i data-lucide="check-circle" class="h-4 w-4 text-[#006837]"></i>';
    title.textContent = 'Validación Exitosa (Documento Conforme Somex)';
    summary.textContent = `Se verificó la coincidencia formal de cédula, serial y cláusula de recepción. Estado actualizado a "${data.new_status}".`;
  } else {
    banner.className = 'p-3.5 rounded-xl border text-xs flex items-start space-x-3 bg-amber-50 border-amber-200 text-amber-800';
    icon.innerHTML = '<i data-lucide="alert-triangle" class="h-4 w-4 text-amber-600"></i>';
    title.textContent = 'Documento con Observaciones';
    summary.textContent = `El documento presenta discrepancias en las validaciones de control. Estado asignado: "${data.new_status}".`;
  }

  const pCount = document.getElementById('report-pages-count');
  if (pCount) pCount.textContent = `${val.total_pages} página(s) analizada(s)`;

  const cd = val.checks.cedula;
  document.getElementById('check-cedula-exp').textContent = cd.expected;
  document.getElementById('check-cedula-found').textContent = cd.found;
  document.getElementById('check-cedula-status').innerHTML = cd.passed
    ? '<span class="text-[#006837] flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="check" class="h-3 w-3"></i><span>Coincide</span></span>'
    : '<span class="text-rose-600 flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="x" class="h-3 w-3"></i><span>Difiere</span></span>';

  const hw = val.checks.hardware;
  document.getElementById('check-hw-exp').textContent = hw.expected;
  document.getElementById('check-hw-found').textContent = hw.found;
  document.getElementById('check-hw-status').innerHTML = hw.passed
    ? '<span class="text-[#006837] flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="check" class="h-3 w-3"></i><span>Coincide</span></span>'
    : '<span class="text-rose-600 flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="x" class="h-3 w-3"></i><span>No coincide</span></span>';

  const dt = val.checks.date;
  document.getElementById('check-date-found').textContent = dt.found;
  document.getElementById('check-date-status').innerHTML = dt.passed
    ? '<span class="text-[#006837] flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="check-circle" class="h-3 w-3"></i><span>Detectada</span></span>'
    : '<span class="text-amber-600 flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="alert-triangle" class="h-3 w-3"></i><span>Faltante</span></span>';

  const sg = val.checks.signature;
  document.getElementById('check-sign-found').textContent = sg.found;
  document.getElementById('check-sign-status').innerHTML = sg.passed
    ? '<span class="text-[#006837] flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="check-circle" class="h-3 w-3"></i><span>Recibido</span></span>'
    : '<span class="text-rose-600 flex items-center space-x-0.5 text-[10px] font-bold"><i data-lucide="x-circle" class="h-3 w-3"></i><span>Sin firma</span></span>';

  if (window.lucide) lucide.createIcons();
}

// ------------------------------------------------------------------------------
// 15. GUARDADO DE NOTAS Y OBSERVACIONES
// ------------------------------------------------------------------------------
async function saveAssetNotes() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede modificar notas internas.');
    return;
  }

  if (!activeAsset) return;
  const notesText = document.getElementById('modal-asset-notes-input').value;
  const btn = document.getElementById('btn-save-notes');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Guardando...</span>';
  }

  try {
    const res = await fetch(`/api/assets/${activeAsset.id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesText })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al guardar notas');

    activeAsset.notes = notesText;
    showToast('success', 'Observaciones guardadas exitosamente.', 3000);
    await loadAssets();

  } catch (err) {
    showToast('error', `Error al guardar notas: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save" class="h-3.5 w-3.5"></i><span>Guardar Notas</span>';
    }
    if (window.lucide) lucide.createIcons();
  }
}

// ------------------------------------------------------------------------------
// 16. REGISTRO DE NUEVO ACTIVO (CON CAMPO SEDE Y LIMPIEZA TOTAL)
// ------------------------------------------------------------------------------
function onNewAssetTypeChange(val) {
  const container = document.getElementById('container-new-asset-imei');
  const cedulaContainer = document.getElementById('container-new-asset-cedula');
  const imeiInput = document.getElementById('new-asset-imei');
  const isCelular = (val || '').toLowerCase().includes('celular') || (val || '').toLowerCase().includes('móvil') || (val || '').toLowerCase().includes('movil');

  if (container) {
    if (isCelular) {
      container.classList.remove('hidden');
      if (cedulaContainer) cedulaContainer.classList.remove('col-span-2');
    } else {
      container.classList.add('hidden');
      if (cedulaContainer) cedulaContainer.classList.add('col-span-2');
      if (imeiInput) imeiInput.value = '';
    }
  }
}

function openAssetModal() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede registrar nuevos activos.');
    return;
  }

  // 1. Limpieza absoluta de todos los campos del modal + Nuevo
  const typeSelect = document.getElementById('new-asset-type');
  const sedeSelect = document.getElementById('new-asset-sede');
  const tagInput = document.getElementById('new-asset-tag');
  const serialInput = document.getElementById('new-asset-serial');
  const imeiInput = document.getElementById('new-asset-imei');
  const cedulaInput = document.getElementById('new-asset-resp-cedula');
  const nameInput = document.getElementById('new-asset-resp-name');
  const notesInput = document.getElementById('new-asset-notes');

  if (typeSelect) typeSelect.selectedIndex = 0;
  if (sedeSelect) sedeSelect.value = 'Medellín';
  if (tagInput) tagInput.value = '';
  if (serialInput) serialInput.value = '';
  if (imeiInput) imeiInput.value = '';
  if (cedulaInput) cedulaInput.value = '';
  if (nameInput) nameInput.value = '';
  if (notesInput) notesInput.value = '';

  // 2. Estado condicional de IMEI: oculto por defecto
  onNewAssetTypeChange(typeSelect ? typeSelect.value : '');

  const modal = document.getElementById('asset-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeAssetModal() {
  const modal = document.getElementById('asset-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleCreateAsset(e) {
  e.preventDefault();
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador tiene permisos para crear activos.');
    return;
  }

  const sedeSelect = document.getElementById('new-asset-sede');
  const payload = {
    type: document.getElementById('new-asset-type').value,
    asset_tag: document.getElementById('new-asset-tag').value,
    serial: document.getElementById('new-asset-serial').value,
    imei: document.getElementById('new-asset-imei').value || null,
    responsible_name: document.getElementById('new-asset-resp-name').value,
    responsible_cedula: document.getElementById('new-asset-resp-cedula').value,
    notes: document.getElementById('new-asset-notes').value || '',
    sede: sedeSelect ? sedeSelect.value : 'Medellín'
  };

  try {
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Error al registrar el activo');
    }

    closeAssetModal();
    showToast('success', `Activo "${payload.asset_tag}" (${payload.type}) registrado con éxito en sede ${payload.sede}.`, 3000);
    await loadAssets();
    await loadCollaborators();

  } catch (err) {
    showToast('error', err.message);
  }
}

// ------------------------------------------------------------------------------
// 17. NOTIFICACIONES TOAST (DESAPARICIÓN ESTRICTA A 3 SEGUNDOS)
// ------------------------------------------------------------------------------
function showToast(type, msg, duration = 3000) {
  const toast = document.getElementById('toast');
  const inner = document.getElementById('toast-inner');
  const text = document.getElementById('toast-msg');

  if (!toast || !inner || !text) return;

  if (toastTimer) clearTimeout(toastTimer);

  text.textContent = msg;
  inner.className = type === 'success'
    ? 'p-3.5 rounded-xl border text-xs flex items-center justify-between bg-emerald-50 border-emerald-300 text-[#006837] font-bold shadow-xl'
    : 'p-3.5 rounded-xl border text-xs flex items-center justify-between bg-rose-50 border-rose-300 text-rose-900 font-bold shadow-xl';

  toast.classList.remove('hidden');
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.add('hidden');
}


// ==============================================================================
// 18. MÓDULO DE REPORTES Y AUDITORÍA ORGANIZACIONAL (ESTADÍSTICAS DEL REPORTE REAL)
// ==============================================================================
async function loadReportsModule() {
  try {
    const res = await fetch('/api/reports/summary');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al obtener resumen de auditoría');
    cachedReportData = data;
    renderReportsSummary(data);
  } catch (err) {
    showToast('error', `Error al cargar reportes: ${err.message}`);
  }
}

function renderReportsSummary(data) {
  if (!data) return;

  // 1. Tarjetas de Resumen Ejecutivo
  const elTotal = document.getElementById('report-total');
  const elScanned = document.getElementById('report-scanned');
  const elScannedPct = document.getElementById('report-scanned-pct');
  const elPending = document.getElementById('report-pending');
  const elPendingPct = document.getElementById('report-pending-pct');
  const elDate = document.getElementById('report-date');

  if (elTotal) elTotal.textContent = data.total_assets;
  if (elScanned) elScanned.textContent = data.scanned_assets;
  if (elScannedPct) elScannedPct.textContent = `${data.compliance_pct}% verificado`;
  if (elPending) elPending.textContent = data.pending_assets;
  if (elPendingPct) {
    const pendPct = data.total_assets > 0 ? (100 - data.compliance_pct).toFixed(1) : 0;
    elPendingPct.textContent = `${pendPct}% pendiente`;
  }
  if (elDate) elDate.textContent = data.date || '21/10/2026';

  // 2. Gráfico de Cumplimiento por Sede
  const sedesContainer = document.getElementById('report-sedes-container');
  if (sedesContainer && data.sedes) {
    sedesContainer.innerHTML = data.sedes.map(s => {
      return `
        <div class="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="flex items-center justify-between text-xs">
            <span class="font-extrabold text-[#111827] flex items-center space-x-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-[#006837]"></span>
              <span>${s.sede}</span>
            </span>
            <span class="font-black text-[#006837] text-sm">${s.compliance_pct}%</span>
          </div>
          <!-- Barra de progreso -->
          <div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div class="bg-[#006837] h-2.5 rounded-full transition-all duration-500" style="width: ${s.compliance_pct}%"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>✅ <strong>${s.scanned}</strong> escaneados</span>
            <span class="${s.pending > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}">⚠️ <strong>${s.pending}</strong> pendientes</span>
            <span>Total: <strong>${s.total}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Distribución por Estado Operativo
  const statusContainer = document.getElementById('report-status-container');
  if (statusContainer && data.operational_statuses) {
    statusContainer.innerHTML = data.operational_statuses.map(st => {
      return `
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div class="flex items-center space-x-2">
            ${getOperationalStatusBadge(st.status)}
            <span class="font-bold text-[#111827]">${st.total} equipos</span>
          </div>
          <div class="flex items-center space-x-3 text-[11px]">
            <span class="text-slate-500 font-medium">${st.pct_of_total}% del total</span>
            <span class="text-emerald-700 font-bold">(${st.scanned} verif.)</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Desglose por Tipo de Equipo (Top 20 categorías)
  const typesContainer = document.getElementById('report-types-container');
  if (typesContainer && data.equipment_types) {
    typesContainer.innerHTML = data.equipment_types.map(t => {
      return `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 hover:border-[#006837] transition shadow-xs">
          <div class="flex items-center justify-between text-[11.5px]">
            <span class="font-extrabold text-[#111827] truncate">${t.type}</span>
            <span class="font-black text-[#006837]">${t.total}</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div class="bg-[#16A34A] h-1.5 rounded-full" style="width: ${t.compliance_pct}%"></div>
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-500">
            <span>${t.scanned} verif.</span>
            <span class="${t.pending > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}">${t.pending} pend.</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Historial de Rondas
  const historyContainer = document.getElementById('report-history-container');
  if (historyContainer && data.history) {
    historyContainer.innerHTML = data.history.map(h => {
      return `
        <div class="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-sm hover:border-[#006837] transition">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-50 text-[#006837] border border-emerald-200">${h.cycle}</span>
            <span class="text-[10px] text-slate-400">${h.date}</span>
          </div>
          <div>
            <h4 class="text-xs font-bold text-slate-900 leading-tight">${h.title}</h4>
            <p class="text-[10.5px] text-slate-500 mt-0.5">${h.description}</p>
          </div>
          <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span class="font-bold text-[#006837]">${h.compliance} cumplimiento</span>
            <a href="${h.pdf_url}" target="_blank" class="inline-flex items-center space-x-1 px-2.5 py-1 text-[10.5px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#006837] border border-emerald-200 transition">
              <i data-lucide="file-text" class="h-3 w-3"></i>
              <span>Descargar PDF</span>
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Listado de 53 Activos No Escaneados en el Ciclo
  renderReportPendingTable();

  if (window.lucide) lucide.createIcons();
}

function renderReportPendingTable(filterTerm = '') {
  const tbody = document.getElementById('report-pending-table-body');
  const countEl = document.getElementById('report-pending-table-count');
  if (!tbody) return;

  const pendingList = allAssets.filter(a => a.is_scanned === 0 && a.document_status !== 'Dado de Baja');
  if (countEl) countEl.textContent = pendingList.length;

  const term = (filterTerm || '').toLowerCase().trim();
  const filtered = pendingList.filter(a => {
    if (!term) return true;
    return (
      (a.asset_tag && a.asset_tag.toLowerCase().includes(term)) ||
      (a.serial && a.serial.toLowerCase().includes(term)) ||
      (a.sede && a.sede.toLowerCase().includes(term)) ||
      (a.type && a.type.toLowerCase().includes(term)) ||
      (a.operational_status && a.operational_status.toLowerCase().includes(term)) ||
      (a.equipment_name && a.equipment_name.toLowerCase().includes(term)) ||
      (a.notes && a.notes.toLowerCase().includes(term))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-500 font-medium text-xs">
          ${term ? 'No se encontraron activos pendientes que coincidan con la búsqueda.' : '¡Excelente! No hay activos pendientes en este reporte.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const cleanTag = cleanAssetTag(a.asset_tag);
    const opBadge = getOperationalStatusBadge(a.operational_status);
    const noteText = (a.notes || '').trim() || '<span class="text-slate-400 font-normal">Sin comentarios</span>';
    return `
      <tr class="hover:bg-amber-50/50 transition border-b border-slate-200 text-[#111827]">
        <td class="py-2.5 px-3 font-mono font-bold text-[#006837] text-xs">${cleanTag}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-[#111827] text-xs">${a.serial}</td>
        <td class="py-2.5 px-3 font-extrabold text-[#111827] text-xs">${a.sede}</td>
        <td class="py-2.5 px-3 font-bold text-[#111827] text-xs">${a.type}</td>
        <td class="py-2.5 px-3">${opBadge}</td>
        <td class="py-2.5 px-3 font-semibold text-[#111827] text-xs">${a.equipment_name || '-'}</td>
        <td class="py-2.5 px-3 text-xs text-[#111827] font-medium">${noteText}</td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function filterReportPendingTable(term) {
  renderReportPendingTable(term);
}

function downloadOctubrePdf() {
  window.open('/api/reports/octubre-pdf', '_blank');
}

async function triggerReimportOctubre() {
  if (currentUser && currentUser.role !== 'admin') {
    showToast('error', 'Solo el Administrador puede re-importar datos oficiales.');
    return;
  }
  const confirmRe = confirm('¿Desea re-sincronizar los 468 activos desde "Reporte inventario Octubre.pdf"? Esto restablecerá los registros al estado del reporte oficial.');
  if (!confirmRe) return;

  try {
    showToast('success', 'Iniciando importación desde Reporte inventario Octubre.pdf...', 2000);
    const res = await fetch('/api/migration/import-octubre', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error en la importación');
    showToast('success', data.message || 'Sincronización completada con éxito.', 3500);
    await loadAssets();
    await loadReportsModule();
  } catch (err) {
    showToast('error', `Error al re-importar: ${err.message}`);
  }
}
