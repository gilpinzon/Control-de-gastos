/**
 * DUOCONTROL | LÓGICA PRINCIPAL DE LA APLICACIÓN (PWA & CLOUD SYNC)
 * Presupuesto Unificado del Hogar: Gil & Ale 🏡
 * 100% Mobile-First • Datos en Ceros • Selector de Meses Nativo
 */

// Generador de UUID compatible con PostgreSQL y navegadores
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Estado global inicial limpio (100% en ceros, sin datos de prueba)
const DEFAULT_INITIAL_STATE = {
  activeTab: 'dashboard',
  selectedMonth: {
    year: new Date().getFullYear(),
    month: new Date().getMonth() // Mes actual del sistema (0 = Enero, ..., 10 = Noviembre, 11 = Diciembre)
  },
  txFilter: 'todos',
  couple: {
    name1: 'Gil',
    name2: 'Ale',
    email1: '',
    email2: '',
    currency: 'COP',
    symbol: '$',
    monthlySavingsGoal: 0
  },
  neon: {
    isConnected: false,
    lastSyncedAt: null
  },
  transactions: [], // Limpio en ceros
  shoppingList: []  // Limpio en ceros
};

// Categorías oficiales solicitadas
const CATEGORIES = {
  gasto: [
    { name: 'Servicios públicos', icon: 'zap', color: '#f59e0b', emoji: '💡' },
    { name: 'Administración del conjunto', icon: 'building', color: '#6366f1', emoji: '🏢' },
    { name: 'Mantenimiento de la moto', icon: 'wrench', color: '#06b6d4', emoji: '🏍️' },
    { name: 'Gasolina', icon: 'fuel', color: '#ef4444', emoji: '⛽' },
    { name: 'Mercado / Supermercado', icon: 'shopping-cart', color: '#10b981', emoji: '🛒', isMarket: true },
    { name: 'Otros', icon: 'folder', color: '#8b5cf6', emoji: '📂' }
  ],
  ingreso: [
    { name: 'Salario / Sueldo', icon: 'briefcase', color: '#10b981', emoji: '💼' },
    { name: 'Negocios / Extra', icon: 'trending-up', color: '#06b6d4', emoji: '📈' },
    { name: 'Otros Ingresos', icon: 'dollar-sign', color: '#3b82f6', emoji: '🎁' }
  ]
};

class DuoControlApp {
  constructor() {
    this.state = this.loadState();
    this.chartInstance = null;
    this.historyChartInstance = null;
    this.currentInsightIndex = 0;
    this.insightsList = [];
    this.modalTxType = 'gasto';
    this.deferredPrompt = null;

    this.init();
  }

  // Carga el estado de localStorage bajo la clave exclusiva de Gil & Ale
  loadState() {
    try {
      const saved = localStorage.getItem('duocontrol_gil_ale_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Garantizar nombres de Gil & Ale
        if (parsed.couple) {
          parsed.couple.name1 = parsed.couple.name1 || 'Gil';
          parsed.couple.name2 = parsed.couple.name2 || 'Ale';
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Error al cargar estado de localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE));
  }

  // Guarda el estado en localStorage
  saveState() {
    try {
      localStorage.setItem('duocontrol_gil_ale_v3', JSON.stringify(this.state));
    } catch (e) {
      console.warn('Error al guardar estado:', e);
    }
  }

  // Inicialización de la aplicación
  init() {
    this.setupPwaListeners();
    this.setupDateDefaults();
    this.setupMonthDropdown();
    this.applySettingsToUI();
    this.updateHeaderUI();
    this.renderDashboard();
    this.renderMarket();
    this.renderUnifiedFund();
    this.refreshSmartInsights();

    // Sincronización automática con Neon Cloud (PostgreSQL)
    this.checkNeonStatus();
    this.syncFromNeon();

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Configura la fecha actual por defecto en el input
  setupDateDefaults() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('txDateInput');
    if (dateInput) dateInput.value = today;
  }

  // Configura el selector de meses desplegable (<select>) de Enero a Diciembre
  setupMonthDropdown() {
    const select = document.getElementById('monthDropdownSelect');
    if (!select) return;

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const currentYear = this.state.selectedMonth.year || new Date().getFullYear();
    const currentMonth = this.state.selectedMonth.month !== undefined ? this.state.selectedMonth.month : new Date().getMonth();

    select.innerHTML = monthNames.map((name, index) => {
      const isSelected = index === currentMonth ? 'selected' : '';
      return `<option value="${index}" ${isSelected}>📅 ${name} ${currentYear}</option>`;
    }).join('');

    select.value = currentMonth;
  }

  // Manejador del cambio en el selector desplegable de meses
  handleMonthDropdownChange(event) {
    const newMonth = parseInt(event.target.value, 10);
    this.state.selectedMonth.month = newMonth;
    this.saveState();

    this.updateHeaderUI();
    this.renderDashboard();
    this.renderUnifiedFund();
    this.refreshSmartInsights();

    if (navigator.vibrate) navigator.vibrate(15);
  }

  // Formateador de moneda dinámico
  formatCurrency(amount) {
    const currency = this.state.couple.currency || 'COP';
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      return (this.state.couple.symbol || '$') + ' ' + Number(amount).toLocaleString();
    }
  }

  // Actualiza textos del encabezado
  updateHeaderUI() {
    const c = this.state.couple;
    const coupleNameEl = document.getElementById('headerCoupleName');
    if (coupleNameEl) {
      coupleNameEl.textContent = `${c.name1} & ${c.name2} • Presupuesto Unificado 🏡`;
    }

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const mLabel = `${monthNames[this.state.selectedMonth.month]} ${this.state.selectedMonth.year}`;
    const chartMonthBadge = document.getElementById('chartMonthBadge');
    if (chartMonthBadge) chartMonthBadge.textContent = mLabel;

    // Actualiza botones en el modal
    const paidLabel1 = document.getElementById('paidByLabel1');
    const paidLabel2 = document.getElementById('paidByLabel2');
    if (paidLabel1) paidLabel1.textContent = c.name1;
    if (paidLabel2) paidLabel2.textContent = c.name2;
  }

  // Navegación entre pestañas optimizada para móvil
  switchTab(tabId) {
    this.state.activeTab = tabId;
    const tabs = ['dashboard', 'market', 'balance', 'settings'];
    
    tabs.forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      const btn = document.getElementById(`navBtn-${t}`);
      if (el) {
        if (t === tabId) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
      if (btn) {
        if (t === tabId) {
          btn.classList.add('text-emerald-400');
          btn.classList.remove('text-slate-400');
        } else {
          btn.classList.remove('text-emerald-400');
          btn.classList.add('text-slate-400');
        }
      }
    });

    if (tabId === 'dashboard') {
      this.renderDashboard();
    } else if (tabId === 'market') {
      this.renderMarket();
    } else if (tabId === 'balance') {
      this.renderUnifiedFund();
    } else if (tabId === 'settings') {
      this.applySettingsToUI();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.lucide) lucide.createIcons();
    if (navigator.vibrate) navigator.vibrate(10);
  }

  // =========================================================================
  // MÓDULO 1: FINANZAS & FONDO COMÚN
  // =========================================================================

  getFilteredTransactions() {
    const { year, month } = this.state.selectedMonth;
    return (this.state.transactions || []).filter(tx => {
      if (!tx.date) return false;
      const d = new Date(tx.date + 'T00:00:00');
      const matchesMonth = d.getFullYear() === year && d.getMonth() === month;
      if (!matchesMonth) return false;

      if (this.state.txFilter === 'gasto') return tx.type === 'gasto';
      if (this.state.txFilter === 'ingreso') return tx.type === 'ingreso';
      return true;
    });
  }

  setTxFilter(filter) {
    this.state.txFilter = filter;
    const btns = {
      todos: document.getElementById('filterBtnTodos'),
      gasto: document.getElementById('filterBtnGastos'),
      ingreso: document.getElementById('filterBtnIngresos')
    };

    Object.keys(btns).forEach(key => {
      const btn = btns[key];
      if (!btn) return;
      if (key === filter) {
        btn.className = 'min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 touch-press';
      } else {
        btn.className = 'min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-400 hover:text-white touch-press';
      }
    });

    this.renderTransactionsList();
    if (navigator.vibrate) navigator.vibrate(10);
  }

  renderDashboard() {
    const { year, month } = this.state.selectedMonth;
    const monthTxs = (this.state.transactions || []).filter(tx => {
      if (!tx.date) return false;
      const d = new Date(tx.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = {};

    monthTxs.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'ingreso') {
        totalIncome += amt;
      } else if (tx.type === 'gasto') {
        totalExpense += amt;
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + amt;
      }
    });

    const netBalance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netBalance / totalIncome) * 100)) : 0;
    const budgetUsedPercent = totalIncome > 0 ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0;

    // Actualizar KPIs
    const kpiIncome = document.getElementById('kpiIncome');
    const kpiExpense = document.getElementById('kpiExpense');
    const kpiBalance = document.getElementById('kpiBalance');
    const kpiSavingsRate = document.getElementById('kpiSavingsRate');

    if (kpiIncome) kpiIncome.textContent = this.formatCurrency(totalIncome);
    if (kpiExpense) kpiExpense.textContent = this.formatCurrency(totalExpense);
    if (kpiBalance) {
      kpiBalance.textContent = this.formatCurrency(netBalance);
      kpiBalance.className = `text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight mt-0.5 ${netBalance >= 0 ? 'text-white' : 'text-rose-400'}`;
    }
    if (kpiSavingsRate) {
      kpiSavingsRate.textContent = `${savingsRate}%`;
      kpiSavingsRate.className = `text-base font-bold tabular-nums ${netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // Barra de progreso mensual
    const progressBar = document.getElementById('budgetProgressBar');
    const pLeft = document.getElementById('progressBarLabelLeft');
    const pRight = document.getElementById('progressBarLabelRight');
    if (progressBar) {
      progressBar.style.width = `${budgetUsedPercent}%`;
      if (budgetUsedPercent > 90) {
        progressBar.className = 'h-full rounded-full bg-rose-500 transition-all duration-700';
      } else if (budgetUsedPercent > 70) {
        progressBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-700';
      } else {
        progressBar.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-700';
      }
    }
    if (pLeft) pLeft.textContent = `${budgetUsedPercent}% de los ingresos consumidos`;
    if (pRight) {
      if (totalIncome === 0 && totalExpense === 0) {
        pRight.textContent = 'Fondo listo e iniciado en ceros';
      } else {
        pRight.textContent = netBalance >= 0 
          ? `${this.formatCurrency(netBalance)} restante en el fondo` 
          : `Déficit: ${this.formatCurrency(Math.abs(netBalance))}`;
      }
    }

    this.renderCategoryDonutChart(categoryTotals, totalExpense);
    this.renderTransactionsList();
    this.refreshSmartInsights();
  }

  renderCategoryDonutChart(categoryTotals, totalExpense) {
    const canvas = document.getElementById('categoryDonutChart');
    const emptyState = document.getElementById('chartEmptyState');
    const legendsGrid = document.getElementById('categoryLegendsGrid');
    if (!canvas) return;

    const categories = Object.keys(categoryTotals);
    if (categories.length === 0 || totalExpense === 0) {
      if (this.chartInstance) this.chartInstance.destroy();
      canvas.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      if (legendsGrid) legendsGrid.innerHTML = '';
      return;
    }

    canvas.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    const labels = [];
    const data = [];
    const colors = [];

    // Colores por categoría temática
    const colorMap = {
      'Servicios públicos': '#f59e0b',
      'Administración del conjunto': '#6366f1',
      'Mantenimiento de la moto': '#06b6d4',
      'Gasolina': '#ef4444',
      'Mercado / Supermercado': '#10b981',
      'Otros': '#8b5cf6'
    };

    categories.sort((a, b) => categoryTotals[b] - categoryTotals[a]);

    categories.forEach(cat => {
      labels.push(cat);
      data.push(categoryTotals[cat]);
      colors.push(colorMap[cat] || '#64748b');
    });

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    this.chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: '#07090e',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (item) => {
                const val = item.raw || 0;
                const pct = Math.round((val / totalExpense) * 100);
                return ` ${this.formatCurrency(val)} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    // Leyendas táctiles amplias
    if (legendsGrid) {
      legendsGrid.innerHTML = categories.map((cat, idx) => {
        const val = categoryTotals[cat];
        const pct = Math.round((val / totalExpense) * 100);
        const col = colors[idx];
        const isMarket = cat === 'Mercado / Supermercado';

        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/5 min-h-[44px]">
            <div class="flex items-center space-x-2 truncate">
              <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${col};"></span>
              <span class="truncate font-semibold text-xs text-slate-200">${cat}</span>
              ${isMarket ? `<button onclick="app.switchTab('market')" class="text-[10px] text-emerald-400 underline shrink-0 hover:text-emerald-300">Ver lista</button>` : ''}
            </div>
            <div class="text-right shrink-0 ml-2">
              <span class="font-extrabold text-white text-xs tabular-nums">${pct}%</span>
              <span class="block text-[10px] text-slate-400 tabular-nums">${this.formatCurrency(val)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  renderTransactionsList() {
    const container = document.getElementById('transactionsContainer');
    if (!container) return;

    const txs = this.getFilteredTransactions();

    if (txs.length === 0) {
      container.innerHTML = `
        <div class="text-center py-10 px-4 text-slate-500 space-y-3 bg-white/[0.02] rounded-2xl border border-white/5">
          <div class="w-12 h-12 mx-auto rounded-2xl bg-white/5 flex items-center justify-center text-slate-500">
            <i data-lucide="receipt" class="w-6 h-6"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-300">Fondo limpio y en ceros</p>
            <p class="text-xs text-slate-500 mt-1">Aún no hay movimientos registrados para este mes.</p>
          </div>
          <div class="flex justify-center space-x-2 pt-1">
            <button onclick="app.openTransactionModal('gasto')" class="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 touch-press">
              + Registrar Gasto
            </button>
            <button onclick="app.openTransactionModal('ingreso')" class="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30 touch-press">
              + Registrar Ingreso
            </button>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    txs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Iconos de categorías
    const iconByCat = {
      'Servicios públicos': 'zap',
      'Administración del conjunto': 'building',
      'Mantenimiento de la moto': 'wrench',
      'Gasolina': 'fuel',
      'Mercado / Supermercado': 'shopping-cart',
      'Otros': 'folder',
      'Salario / Sueldo': 'briefcase',
      'Negocios / Extra': 'trending-up',
      'Otros Ingresos': 'dollar-sign'
    };

    container.innerHTML = txs.map(tx => {
      const isExpense = tx.type === 'gasto';
      const sign = isExpense ? '-' : '+';
      const colorClass = isExpense ? 'text-rose-400' : 'text-emerald-400';
      const iconName = iconByCat[tx.category] || (isExpense ? 'arrow-up-right' : 'arrow-down-left');
      const iconBg = isExpense ? 'bg-rose-500/15 text-rose-400 border-rose-500/20' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

      return `
        <div class="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/5 transition-all min-h-[58px]">
          <div class="flex items-center space-x-3 truncate">
            <div class="w-11 h-11 rounded-2xl ${iconBg} border flex items-center justify-center shrink-0">
              <i data-lucide="${iconName}" class="w-5 h-5"></i>
            </div>
            <div class="truncate">
              <div class="flex items-center space-x-1.5">
                <span class="text-sm font-bold text-slate-100 truncate">${tx.description || tx.category}</span>
              </div>
              <div class="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                <span class="text-emerald-400/90 font-medium">${tx.category}</span>
                <span>•</span>
                <span>${tx.date}</span>
                <span>•</span>
                <span class="text-slate-300 font-semibold">${tx.paidBy}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2 shrink-0 ml-2">
            <span class="text-sm sm:text-base font-black tabular-nums ${colorClass}">
              ${sign}${this.formatCurrency(tx.amount)}
            </span>
            <button onclick="app.deleteTransaction('${tx.id}')" class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors touch-press" title="Eliminar">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  deleteTransaction(id) {
    if (!confirm('¿Deseas eliminar este movimiento del fondo común?')) return;
    this.state.transactions = (this.state.transactions || []).filter(t => t.id !== id);
    this.saveState();
    this.renderDashboard();
    this.renderUnifiedFund();
    this.showToast('Movimiento eliminado del fondo');

    if (window.fetch) {
      fetch(`/api/transactions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        .then(() => this.updateNeonStatus(true))
        .catch(err => console.warn('Aviso al eliminar de Neon:', err));
    }
  }

  // =========================================================================
  // MÓDULO 2: LISTA DE MERCADO EN TIEMPO REAL
  // =========================================================================

  renderMarket() {
    const list = this.state.shoppingList || [];
    const pending = list.filter(i => !i.isPurchased);
    const completed = list.filter(i => i.isPurchased);

    const pendingCount = document.getElementById('pendingCount');
    const completedCount = document.getElementById('completedCount');
    const navBadge = document.getElementById('navMarketBadge');
    const progressText = document.getElementById('marketProgressText');
    const progressPercent = document.getElementById('marketProgressPercent');
    const progressBar = document.getElementById('marketProgressBar');

    if (pendingCount) pendingCount.textContent = pending.length;
    if (completedCount) completedCount.textContent = completed.length;

    if (navBadge) {
      if (pending.length > 0) {
        navBadge.textContent = pending.length;
        navBadge.classList.remove('hidden');
      } else {
        navBadge.classList.add('hidden');
      }
    }

    const total = list.length;
    const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
    if (progressText) progressText.textContent = `${completed.length} de ${total} comprados`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressBar) progressBar.style.width = `${pct}%`;

    // Render Pendientes
    const pendingContainer = document.getElementById('pendingGroceryList');
    if (pendingContainer) {
      if (pending.length === 0) {
        pendingContainer.innerHTML = `
          <div class="text-center py-8 px-4 text-slate-500 bg-white/[0.02] rounded-2xl border border-white/5">
            <i data-lucide="shopping-basket" class="w-8 h-8 mx-auto text-emerald-400 mb-2"></i>
            <p class="text-sm font-semibold text-slate-200">Lista de compras limpia</p>
            <p class="text-xs text-slate-400 mt-0.5">Añade los artículos que hagan falta para el hogar arriba.</p>
          </div>
        `;
      } else {
        pendingContainer.innerHTML = pending.map(item => `
          <div class="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-emerald-500/40 transition-all min-h-[56px]">
            <div class="flex items-center space-x-3 truncate">
              <!-- Touch Checkbox ampliado (min 44px) -->
              <button onclick="app.toggleGroceryItem('${item.id}', true)" class="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 touch-press">
                <span class="w-6 h-6 rounded-lg border-2 border-slate-500 hover:border-emerald-400 flex items-center justify-center transition-colors"></span>
              </button>
              <div class="truncate">
                <span class="text-sm font-bold text-white block truncate">${item.name}</span>
                <div class="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                  <span class="text-emerald-400 font-medium">${item.category}</span>
                  <span>•</span>
                  <span>Cant: <strong class="text-slate-200">${item.quantity || '1'}</strong></span>
                  <span>•</span>
                  <span>Por ${item.addedBy || 'Hogar'}</span>
                </div>
              </div>
            </div>
            <button onclick="app.deleteGroceryItem('${item.id}')" class="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-rose-400 rounded-xl touch-press">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('');
      }
    }

    // Render Comprados
    const completedContainer = document.getElementById('completedGroceryList');
    if (completedContainer) {
      if (completed.length === 0) {
        completedContainer.innerHTML = `
          <p class="text-center py-3 text-xs text-slate-600">Ningún artículo en el carrito todavía</p>
        `;
      } else {
        completedContainer.innerHTML = completed.map(item => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 opacity-65 hover:opacity-100 transition-opacity min-h-[48px]">
            <div class="flex items-center space-x-3 truncate">
              <button onclick="app.toggleGroceryItem('${item.id}', false)" class="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 touch-press">
                <span class="w-5 h-5 rounded-md bg-emerald-500 text-slate-950 flex items-center justify-center">
                  <i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>
                </span>
              </button>
              <span class="text-xs sm:text-sm font-medium text-slate-400 line-through truncate">${item.name} (${item.quantity || '1'})</span>
            </div>
            <button onclick="app.deleteGroceryItem('${item.id}')" class="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-rose-400 touch-press">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('');
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  selectGroceryCategory(cat) {
    const input = document.getElementById('selectedGroceryCategory');
    if (input) input.value = cat;

    document.querySelectorAll('.grocery-cat-chip').forEach(btn => {
      if (btn.textContent.includes(cat.split(' ')[0])) {
        btn.className = 'grocery-cat-chip min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 touch-press';
      } else {
        btn.className = 'grocery-cat-chip min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-400 hover:text-white shrink-0 touch-press';
      }
    });
  }

  handleAddShoppingItem(event) {
    event.preventDefault();
    const nameInput = document.getElementById('groceryItemInput');
    const qtyInput = document.getElementById('groceryQuantityInput');
    const catInput = document.getElementById('selectedGroceryCategory');

    const name = nameInput ? nameInput.value.trim() : '';
    const quantity = qtyInput ? qtyInput.value.trim() || '1' : '1';
    const category = catInput ? catInput.value : 'Mercado / Supermercado';

    if (!name) return;

    const newItem = {
      id: generateUUID(),
      name: name,
      category: category,
      quantity: quantity,
      isPurchased: false,
      addedBy: this.state.couple.name1 || 'Gil',
      createdAt: new Date().toISOString()
    };

    if (!this.state.shoppingList) this.state.shoppingList = [];
    this.state.shoppingList.unshift(newItem);
    this.saveState();

    if (nameInput) nameInput.value = '';
    this.renderMarket();
    this.refreshSmartInsights();
    this.showToast(`"${name}" añadido a la lista`);

    if (navigator.vibrate) navigator.vibrate(20);

    if (window.fetch) {
      fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) this.updateNeonStatus(true);
      })
      .catch(err => console.warn('Aviso al añadir a Neon:', err));
    }
  }

  toggleGroceryItem(id, isPurchased) {
    const item = (this.state.shoppingList || []).find(i => i.id === id);
    if (!item) return;

    item.isPurchased = isPurchased;
    this.saveState();
    this.renderMarket();
    this.refreshSmartInsights();

    if (navigator.vibrate) {
      navigator.vibrate(25);
    }

    const remaining = this.state.shoppingList.filter(i => !i.isPurchased);
    if (isPurchased && remaining.length === 0 && window.confetti) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
      this.showToast('¡Mercado completado al 100%! 🛒✨');
    }

    if (window.fetch) {
      fetch('/api/shopping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, isPurchased: isPurchased })
      })
      .then(() => this.updateNeonStatus(true))
      .catch(err => console.warn('Aviso al actualizar en Neon:', err));
    }
  }

  deleteGroceryItem(id) {
    this.state.shoppingList = (this.state.shoppingList || []).filter(i => i.id !== id);
    this.saveState();
    this.renderMarket();
    this.refreshSmartInsights();

    if (window.fetch) {
      fetch(`/api/shopping?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        .then(() => this.updateNeonStatus(true))
        .catch(err => console.warn('Aviso al eliminar de Neon:', err));
    }
  }

  clearCompletedItems() {
    const count = (this.state.shoppingList || []).filter(i => i.isPurchased).length;
    if (count === 0) return;
    if (!confirm(`¿Eliminar los ${count} productos ya comprados?`)) return;

    this.state.shoppingList = this.state.shoppingList.filter(i => !i.isPurchased);
    this.saveState();
    this.renderMarket();
    this.refreshSmartInsights();
    this.showToast('Productos comprados limpiados');

    if (window.fetch) {
      fetch('/api/shopping?allCompleted=true', { method: 'DELETE' })
        .then(() => this.updateNeonStatus(true))
        .catch(err => console.warn('Aviso al limpiar de Neon:', err));
    }
  }

  uncheckAllItems() {
    (this.state.shoppingList || []).forEach(i => i.isPurchased = false);
    this.saveState();
    this.renderMarket();
    this.showToast('Todos los productos marcados como pendientes');

    if (window.fetch) {
      fetch('/api/shopping?uncheckAll=true', { method: 'PATCH' })
        .then(() => this.updateNeonStatus(true))
        .catch(err => console.warn('Aviso al desmarcar en Neon:', err));
    }
    }
  }

  // =========================================================================
  // MÓDULO 3: SMART INSIGHTS & RECOMENDACIONES (PRESUPUESTO UNIFICADO)
  // =========================================================================

  refreshSmartInsights() {
    const { year, month } = this.state.selectedMonth;
    const c = this.state.couple;
    const targetGoal = Number(c.monthlySavingsGoal) || 0;

    const monthTxs = (this.state.transactions || []).filter(tx => {
      if (!tx.date) return false;
      const d = new Date(tx.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const catMap = {};

    monthTxs.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'ingreso') {
        totalIncome += amt;
      } else {
        totalExpense += amt;
        catMap[t.category] = (catMap[t.category] || 0) + amt;
      }
    });

    const net = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;
    const pendingMarketCount = (this.state.shoppingList || []).filter(i => !i.isPurchased).length;

    const insights = [];

    // Si todo está en ceros al inicio
    if (totalIncome === 0 && totalExpense === 0) {
      insights.push({
        badge: 'Inicio Limpio',
        icon: 'sparkles',
        color: 'emerald',
        text: `👋 ¡Bienvenidos Gil & Ale! El presupuesto familiar está limpio e iniciado en ceros. Registren sus primeros ingresos y gastos para ver el análisis en tiempo real.`
      });
    } else {
      // 1. Meta o balance de ahorro
      if (targetGoal > 0 && net >= targetGoal) {
        insights.push({
          badge: 'Meta Superada',
          icon: 'trophy',
          color: 'emerald',
          text: `🏆 ¡Meta de ahorro superada! Han acumulado ${this.formatCurrency(net)} en el fondo unificado este mes.`
        });
      } else if (net > 0) {
        insights.push({
          badge: 'Fondo Positivo',
          icon: 'check-circle-2',
          color: 'emerald',
          text: `✨ Superávit familiar: El fondo unificado tiene un saldo a favor de ${this.formatCurrency(net)} (${savingsRate}% de ahorro).`
        });
      } else if (net < 0) {
        insights.push({
          badge: 'Alerta Déficit',
          icon: 'alert-triangle',
          color: 'rose',
          text: `⚠️ Atención: Los gastos superan los ingresos familiares en ${this.formatCurrency(Math.abs(net))}.`
        });
      }

      // 2. Concentración por categoría específica (Servicios, Moto, Gasolina, Administración, Mercado)
      let topCat = null;
      let topCatAmt = 0;
      Object.keys(catMap).forEach(cat => {
        if (catMap[cat] > topCatAmt) {
          topCatAmt = catMap[cat];
          topCat = cat;
        }
      });

      if (topCat && totalExpense > 0) {
        const pct = Math.round((topCatAmt / totalExpense) * 100);
        insights.push({
          badge: 'Gasto Principal',
          icon: 'pie-chart',
          color: 'amber',
          text: `📊 "${topCat}" representa el ${pct}% de los gastos del hogar este mes (${this.formatCurrency(topCatAmt)}).`
        });
      }
    }

    // 3. Recordatorio de Supermercado
    if (pendingMarketCount > 0) {
      insights.push({
        badge: 'Mercado del Hogar',
        icon: 'shopping-cart',
        color: 'emerald',
        text: `🛒 Tienen ${pendingMarketCount} artículo${pendingMarketCount > 1 ? 's' : ''} pendiente${pendingMarketCount > 1 ? 's' : ''} en la lista de compras del hogar.`
      });
    }

    this.insightsList = insights;
    this.displayActiveInsight();
  }

  displayActiveInsight() {
    if (this.insightsList.length === 0) return;
    if (this.currentInsightIndex >= this.insightsList.length) {
      this.currentInsightIndex = 0;
    }

    const cur = this.insightsList[this.currentInsightIndex];
    const badgeEl = document.getElementById('insightBadge');
    const msgEl = document.getElementById('insightMessage');
    const iconBox = document.getElementById('insightIconBox');

    if (badgeEl) badgeEl.textContent = cur.badge;
    if (msgEl) msgEl.textContent = cur.text;
    if (iconBox) {
      iconBox.innerHTML = `<i data-lucide="${cur.icon}" class="w-4 h-4"></i>`;
    }

    if (window.lucide) lucide.createIcons();
  }

  cycleNextInsight() {
    if (this.insightsList.length <= 1) return;
    this.currentInsightIndex = (this.currentInsightIndex + 1) % this.insightsList.length;
    this.displayActiveInsight();
  }

  // =========================================================================
  // MÓDULO 4: FONDO COMÚN & METAS DE AHORRO DEL HOGAR
  // =========================================================================

  renderUnifiedFund() {
    const { year, month } = this.state.selectedMonth;
    const c = this.state.couple;
    const targetGoal = Number(c.monthlySavingsGoal) || 0;

    const monthTxs = (this.state.transactions || []).filter(tx => {
      if (!tx.date) return false;
      const d = new Date(tx.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });

    let totalIncome = 0;
    let totalExpense = 0;
    let incPerson1 = 0;
    let incPerson2 = 0;

    monthTxs.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'ingreso') {
        totalIncome += amt;
        if (tx.paidBy === c.name1) incPerson1 += amt;
        else if (tx.paidBy === c.name2) incPerson2 += amt;
        else {
          incPerson1 += amt * 0.5;
          incPerson2 += amt * 0.5;
        }
      } else {
        totalExpense += amt;
      }
    });

    const netSaved = totalIncome - totalExpense;
    const targetPercent = targetGoal > 0 ? Math.min(100, Math.max(0, Math.round((netSaved / targetGoal) * 100))) : (netSaved > 0 ? 100 : 0);
    const remainingToTarget = Math.max(0, targetGoal - netSaved);

    // Actualiza UI
    const savedAmountEl = document.getElementById('fundMonthlySavedAmount');
    const targetAmountEl = document.getElementById('fundMonthlyTargetAmount');
    const progressBarEl = document.getElementById('fundTargetProgressBar');
    const percentTextEl = document.getElementById('fundTargetPercentText');
    const remainingTextEl = document.getElementById('fundTargetRemainingText');

    if (savedAmountEl) savedAmountEl.textContent = this.formatCurrency(netSaved);
    if (targetAmountEl) targetAmountEl.textContent = targetGoal > 0 ? this.formatCurrency(targetGoal) : 'Sin meta fijada';
    if (progressBarEl) progressBarEl.style.width = `${targetPercent}%`;
    if (percentTextEl) {
      percentTextEl.textContent = targetGoal > 0 ? `${targetPercent}% de la meta` : (netSaved > 0 ? 'Fondo con saldo positivo' : 'Inicia en ceros');
    }
    if (remainingTextEl) {
      if (targetGoal > 0) {
        if (netSaved >= targetGoal) {
          remainingTextEl.textContent = '🎉 ¡Objetivo superado!';
          remainingTextEl.className = 'text-emerald-400 font-bold';
        } else {
          remainingTextEl.textContent = `Faltan ${this.formatCurrency(remainingToTarget)}`;
          remainingTextEl.className = 'text-slate-400';
        }
      } else {
        remainingTextEl.textContent = 'Define tu meta en Ajustes';
        remainingTextEl.className = 'text-slate-500';
      }
    }

    // Aportes de Gil & Ale a ingresos (informativo)
    const name1El = document.getElementById('fundPerson1Name');
    const name2El = document.getElementById('fundPerson2Name');
    const amt1El = document.getElementById('fundPerson1Amount');
    const amt2El = document.getElementById('fundPerson2Amount');
    const pct1El = document.getElementById('fundPerson1Percent');
    const pct2El = document.getElementById('fundPerson2Percent');

    const totalIncRecorded = incPerson1 + incPerson2;
    const pct1 = totalIncRecorded > 0 ? Math.round((incPerson1 / totalIncRecorded) * 100) : 0;
    const pct2 = totalIncRecorded > 0 ? Math.round((incPerson2 / totalIncRecorded) * 100) : 0;

    if (name1El) name1El.textContent = c.name1 || 'Gil';
    if (name2El) name2El.textContent = c.name2 || 'Ale';
    if (amt1El) amt1El.textContent = this.formatCurrency(incPerson1);
    if (amt2El) amt2El.textContent = this.formatCurrency(incPerson2);
    if (pct1El) pct1El.textContent = `${pct1}% del fondo`;
    if (pct2El) pct2El.textContent = `${pct2}% del fondo`;

    this.renderHistoricalBarChart();
  }

  renderHistoricalBarChart() {
    const canvas = document.getElementById('historicalBarChart');
    if (!canvas) return;

    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const labels = [];
    const incomeData = [];
    const expenseData = [];

    const curr = new Date(this.state.selectedMonth.year, this.state.selectedMonth.month, 1);

    for (let i = 5; i >= 0; i--) {
      const d = new Date(curr.getFullYear(), curr.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      labels.push(`${monthNamesShort[m]}`);

      let inc = 0;
      let exp = 0;
      (this.state.transactions || []).forEach(t => {
        if (!t.date) return;
        const td = new Date(t.date + 'T00:00:00');
        if (td.getFullYear() === y && td.getMonth() === m) {
          if (t.type === 'ingreso') inc += Number(t.amount) || 0;
          else exp += Number(t.amount) || 0;
        }
      });

      incomeData.push(inc);
      expenseData.push(exp);
    }

    if (this.historyChartInstance) {
      this.historyChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    this.historyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ingresos',
            data: incomeData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6
          },
          {
            label: 'Gastos',
            data: expenseData,
            backgroundColor: 'rgba(244, 63, 94, 0.85)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${this.formatCurrency(item.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              callback: (val) => '$' + (val / 1000) + 'k'
            }
          }
        }
      }
    });
  }

  // =========================================================================
  // MODAL DE REGISTRO RÁPIDO EN EL FONDO COMÚN
  // =========================================================================

  openTransactionModal(type = 'gasto') {
    this.modalTxType = type;
    const modal = document.getElementById('txModal');
    if (!modal) return;

    this.setModalTxType(type);
    this.renderModalCategories();

    const amtInput = document.getElementById('txAmountInput');
    if (amtInput) {
      amtInput.value = '';
      setTimeout(() => amtInput.focus(), 150);
    }

    modal.classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(15);
  }

  closeTransactionModal() {
    const modal = document.getElementById('txModal');
    if (modal) modal.classList.add('hidden');
  }

  setModalTxType(type) {
    this.modalTxType = type;
    const expBtn = document.getElementById('txTypeExpenseBtn');
    const incBtn = document.getElementById('txTypeIncomeBtn');
    const submitBtn = document.getElementById('txSubmitBtn');
    const modalTitle = document.getElementById('txModalTitle');

    if (type === 'gasto') {
      if (expBtn) expBtn.className = 'flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-500 text-white shadow-md shadow-rose-500/25 transition-all touch-press flex items-center justify-center space-x-1.5';
      if (incBtn) incBtn.className = 'flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all touch-press flex items-center justify-center space-x-1.5';
      if (modalTitle) modalTitle.textContent = 'Registrar Gasto del Hogar';
      if (submitBtn) {
        submitBtn.className = 'w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-extrabold text-sm touch-press shadow-lg shadow-rose-500/25 flex items-center justify-center space-x-2';
        submitBtn.innerHTML = '<i data-lucide="minus-circle" class="w-4 h-4"></i><span>Guardar Gasto</span>';
      }
    } else {
      if (incBtn) incBtn.className = 'flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25 transition-all touch-press flex items-center justify-center space-x-1.5';
      if (expBtn) expBtn.className = 'flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all touch-press flex items-center justify-center space-x-1.5';
      if (modalTitle) modalTitle.textContent = 'Registrar Ingreso al Fondo';
      if (submitBtn) {
        submitBtn.className = 'w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-sm touch-press shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2';
        submitBtn.innerHTML = '<i data-lucide="plus-circle" class="w-4 h-4"></i><span>Guardar Ingreso</span>';
      }
    }

    this.renderModalCategories();
    if (window.lucide) lucide.createIcons();
  }

  renderModalCategories() {
    const grid = document.getElementById('txCategoryGrid');
    const hiddenInput = document.getElementById('txSelectedCategory');
    if (!grid) return;

    const list = CATEGORIES[this.modalTxType] || [];
    const defaultCat = list[0]?.name || '';
    if (hiddenInput) hiddenInput.value = defaultCat;

    grid.innerHTML = list.map((cat, idx) => `
      <button type="button" onclick="app.selectModalCategory('${cat.name}', this)" 
              class="tx-cat-card min-h-[64px] p-3 rounded-2xl border ${idx === 0 ? 'border-emerald-500/60 bg-emerald-500/20 text-white' : 'border-white/10 bg-slate-900/80 text-slate-300'} flex flex-col items-center justify-center text-center touch-press hover:bg-white/10 transition-all">
        <i data-lucide="${cat.icon}" class="w-6 h-6 mb-1.5" style="color: ${cat.color}"></i>
        <span class="text-xs font-bold leading-tight line-clamp-1">${cat.name}</span>
      </button>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  selectModalCategory(catName, btnElement) {
    const hiddenInput = document.getElementById('txSelectedCategory');
    if (hiddenInput) hiddenInput.value = catName;

    document.querySelectorAll('.tx-cat-card').forEach(b => {
      b.className = 'tx-cat-card min-h-[64px] p-3 rounded-2xl border border-white/10 bg-slate-900/80 text-slate-300 flex flex-col items-center justify-center text-center touch-press hover:bg-white/10 transition-all';
    });

    if (btnElement) {
      btnElement.className = 'tx-cat-card min-h-[64px] p-3 rounded-2xl border border-emerald-500/60 bg-emerald-500/20 text-white flex flex-col items-center justify-center text-center touch-press transition-all';
    }

    if (navigator.vibrate) navigator.vibrate(10);
  }

  setTxPaidBy(option) {
    const c = this.state.couple;
    const hidden = document.getElementById('txSelectedPaidBy');
    const b1 = document.getElementById('paidByBtn-member1');
    const b2 = document.getElementById('paidByBtn-member2');
    const bShared = document.getElementById('paidByBtn-shared');

    let selectedValue = c.name1 || 'Gil';
    if (option === 'member2') selectedValue = c.name2 || 'Ale';
    if (option === 'shared') selectedValue = 'Ambos';

    if (hidden) hidden.value = selectedValue;

    [b1, b2, bShared].forEach(b => {
      if (b) b.className = 'min-h-[44px] py-2.5 px-3 rounded-xl border border-white/10 bg-slate-900 text-slate-300 text-xs font-bold flex items-center justify-center touch-press';
    });

    if (option === 'member1' && b1) {
      b1.className = 'min-h-[44px] py-2.5 px-3 rounded-xl border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center justify-center touch-press';
    } else if (option === 'member2' && b2) {
      b2.className = 'min-h-[44px] py-2.5 px-3 rounded-xl border border-violet-500/50 bg-violet-500/20 text-violet-300 text-xs font-bold flex items-center justify-center touch-press';
    } else if (option === 'shared' && bShared) {
      bShared.className = 'min-h-[44px] py-2.5 px-3 rounded-xl border border-indigo-500/50 bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center touch-press';
    }

    if (navigator.vibrate) navigator.vibrate(10);
  }

  addAmount(val) {
    const input = document.getElementById('txAmountInput');
    if (!input) return;
    const current = parseFloat(input.value) || 0;
    input.value = current + val;
    if (navigator.vibrate) navigator.vibrate(10);
  }

  clearAmount() {
    const input = document.getElementById('txAmountInput');
    if (input) input.value = '';
    if (navigator.vibrate) navigator.vibrate(10);
  }

  handleSaveTransaction(event) {
    event.preventDefault();
    const amountInput = document.getElementById('txAmountInput');
    const catInput = document.getElementById('txSelectedCategory');
    const paidByInput = document.getElementById('txSelectedPaidBy');
    const dateInput = document.getElementById('txDateInput');
    const descInput = document.getElementById('txDescriptionInput');

    const amount = parseFloat(amountInput ? amountInput.value : 0);
    if (!amount || amount <= 0) {
      alert('Ingresa un monto válido para el fondo');
      return;
    }

    const newTx = {
      id: generateUUID(),
      type: this.modalTxType,
      amount: amount,
      category: catInput ? catInput.value : 'Otros',
      description: descInput ? descInput.value.trim() : '',
      date: dateInput ? dateInput.value : new Date().toISOString().split('T')[0],
      paidBy: paidByInput ? paidByInput.value : (this.state.couple.name1 || 'Gil'),
      createdAt: new Date().toISOString()
    };

    if (!this.state.transactions) this.state.transactions = [];
    this.state.transactions.unshift(newTx);
    this.saveState();
    this.closeTransactionModal();
    this.renderDashboard();
    this.renderUnifiedFund();
    this.showToast(`${this.modalTxType === 'gasto' ? 'Gasto' : 'Ingreso'} guardado en el Fondo Común`);

    if (navigator.vibrate) navigator.vibrate(25);

    if (window.fetch) {
      fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTx)
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) this.updateNeonStatus(true);
      })
      .catch(err => console.warn('Aviso al guardar en Neon:', err));
    }
  }

  // =========================================================================
  // MÓDULO 5: AJUSTES, WHITELIST & NEON CLOUD (POSTGRESQL)
  // =========================================================================

  applySettingsToUI() {
    const c = this.state.couple;
    const n1 = document.getElementById('settingsName1');
    const n2 = document.getElementById('settingsName2');
    const goal = document.getElementById('settingsSavingsGoal');
    const curr = document.getElementById('settingsCurrency');
    const em1 = document.getElementById('settingsEmail1');
    const em2 = document.getElementById('settingsEmail2');

    if (n1) n1.value = c.name1 || 'Gil';
    if (n2) n2.value = c.name2 || 'Ale';
    if (goal) goal.value = c.monthlySavingsGoal || 0;
    if (curr) curr.value = c.currency || 'COP';
    if (em1) em1.value = c.email1 || '';
    if (em2) em2.value = c.email2 || '';

    this.updateDatabaseBadge();
  }

  saveCoupleProfileSettings() {
    const n1 = document.getElementById('settingsName1')?.value.trim() || 'Gil';
    const n2 = document.getElementById('settingsName2')?.value.trim() || 'Ale';
    const goal = parseFloat(document.getElementById('settingsSavingsGoal')?.value) || 0;
    const curr = document.getElementById('settingsCurrency')?.value || 'COP';

    this.state.couple.name1 = n1;
    this.state.couple.name2 = n2;
    this.state.couple.monthlySavingsGoal = goal;
    this.state.couple.currency = curr;

    const symbols = { COP: '$', USD: '$', EUR: '€', MXN: '$', ARS: '$', CLP: '$' };
    this.state.couple.symbol = symbols[curr] || '$';

    this.saveState();
    this.updateHeaderUI();
    this.renderDashboard();
    this.renderUnifiedFund();
    this.showToast('Configuración del hogar Gil & Ale actualizada');

    if (window.fetch) {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlySavingsGoal: goal,
          currency: curr,
          symbol: this.state.couple.symbol,
          name1: n1,
          name2: n2
        })
      }).then(() => this.updateNeonStatus(true)).catch(err => console.warn('Aviso guardando ajustes en Neon:', err));
    }
  }

  saveWhitelistSettings() {
    const e1 = document.getElementById('settingsEmail1')?.value.trim();
    const e2 = document.getElementById('settingsEmail2')?.value.trim();

    if (!e1 || !e2) {
      alert('Debes ingresar los dos correos autorizados para Gil y Ale.');
      return;
    }

    this.state.couple.email1 = e1;
    this.state.couple.email2 = e2;
    this.saveState();
    this.showToast('Whitelist de Gil y Ale guardada');

    if (window.fetch) {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email1: e1, email2: e2 })
      }).then(() => this.updateNeonStatus(true)).catch(err => console.warn('Aviso guardando whitelist en Neon:', err));
    }
  }

  // Comprobar estado de conexión con Neon Serverless
  async checkNeonStatus() {
    const apiStatusText = document.getElementById('apiStatusText');
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('API no respondió');
      const data = await res.json();
      if (data.ok) {
        this.updateNeonStatus(true);
        if (apiStatusText) {
          apiStatusText.textContent = '🟢 Conectado a Neon';
          apiStatusText.className = 'font-semibold text-emerald-400';
        }
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err) {
      console.warn('Neon status check:', err);
      this.updateNeonStatus(false);
      if (apiStatusText) {
        apiStatusText.textContent = '⚪ Modo Local Seguro';
        apiStatusText.className = 'font-semibold text-slate-400';
      }
    }
  }

  // Sincronizar desde Neon Cloud
  async syncFromNeon(showUserFeedback = false) {
    if (showUserFeedback) this.showToast('Sincronizando con Neon Cloud...');
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) throw new Error('API no disponible');
      const data = await res.json();

      if (data.success) {
        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          this.state.transactions = data.transactions;
        }
        if (Array.isArray(data.shoppingList) && data.shoppingList.length > 0) {
          this.state.shoppingList = data.shoppingList;
        }
        if (data.workspace) {
          if (data.workspace.monthlySavingsGoal !== undefined) {
            this.state.couple.monthlySavingsGoal = data.workspace.monthlySavingsGoal;
          }
          if (data.workspace.currency) {
            this.state.couple.currency = data.workspace.currency;
            this.state.couple.symbol = data.workspace.symbol || '$';
          }
        }

        this.updateNeonStatus(true);
        this.saveState();
        this.updateHeaderUI();
        this.renderDashboard();
        this.renderMarket();
        this.renderUnifiedFund();
        this.refreshSmartInsights();
        this.applySettingsToUI();

        if (showUserFeedback) {
          this.showToast('¡Datos sincronizados con Neon Cloud! ⚡');
        }
      }
    } catch (err) {
      console.warn('Operando en modo local (Neon offline o no configurado):', err);
      this.updateNeonStatus(false);
      if (showUserFeedback) {
        this.showToast('Modo Local (Sin conexión con Neon)');
      }
    }
  }

  // Subir datos locales guardados en el teléfono a Neon Cloud
  async uploadLocalDataToNeon() {
    this.showToast('Subiendo datos locales a Neon Cloud...');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: this.state.transactions || [],
          shoppingList: this.state.shoppingList || [],
          couple: this.state.couple || {}
        })
      });
      if (!res.ok) throw new Error('Error en el servidor');
      const data = await res.json();
      if (data.success) {
        this.updateNeonStatus(true);
        this.showToast('¡Datos locales subidos a Neon Cloud! 🎉');
        this.syncFromNeon();
      } else {
        throw new Error(data.error || 'Fallo al sincronizar');
      }
    } catch (err) {
      alert('No se pudo subir los datos a Neon: ' + err.message + '\nVerifica que DATABASE_URL esté configurado en Vercel.');
    }
  }

  updateNeonStatus(isConnected) {
    if (!this.state.neon) this.state.neon = {};
    this.state.neon.isConnected = isConnected;
    if (isConnected) this.state.neon.lastSyncedAt = new Date().toISOString();
    this.saveState();
    this.updateDatabaseBadge();
  }

  updateDatabaseBadge() {
    const isConn = this.state.neon?.isConnected;
    const badge = document.getElementById('neonConnectionBadge') || document.getElementById('supabaseConnectionBadge');
    const headerSyncText = document.getElementById('syncStatusText');

    if (badge) {
      badge.textContent = isConn ? '🟢 Neon Cloud' : 'Local Seguro';
      badge.className = isConn 
        ? 'text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
        : 'text-[10px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-semibold';
    }

    if (headerSyncText) {
      headerSyncText.textContent = isConn ? 'Neon Cloud' : 'Local';
    }
  }

  // Backup & Restore
  exportBackupData() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `DuoControl_Gil_Ale_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.showToast('Copia de seguridad descargada');
  }

  importBackupData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.couple) {
          this.state = parsed;
          this.saveState();
          this.init();
          this.showToast('Copia de Gil & Ale restaurada exitosamente 🎉');
        } else {
          alert('El archivo JSON no tiene el formato válido de DuoControl.');
        }
      } catch (err) {
        alert('Error al leer el archivo de copia: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // PWA (Progressive Web App)
  setupPwaListeners() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const headerBtn = document.getElementById('btnPwaInstallHeader');
      if (headerBtn) headerBtn.classList.remove('hidden');
      const androidSec = document.getElementById('androidInstallSection');
      if (androidSec) androidSec.classList.remove('hidden');
      const iosSec = document.getElementById('iosInstallSection');
      if (iosSec) iosSec.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] DuoControl instalada en el dispositivo de Gil y Ale');
      this.deferredPrompt = null;
      this.showToast('¡DuoControl instalada con éxito!');
      const headerBtn = document.getElementById('btnPwaInstallHeader');
      if (headerBtn) headerBtn.classList.add('hidden');
    });
  }

  promptInstallPwa() {
    const modal = document.getElementById('pwaInstallModal');
    if (!modal) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isStandalone) {
      this.showToast('Ya estás usando la app instalada 🎉');
      return;
    }

    const iosSection = document.getElementById('iosInstallSection');
    const androidSection = document.getElementById('androidInstallSection');

    if (this.deferredPrompt) {
      if (androidSection) androidSection.classList.remove('hidden');
      if (iosSection) iosSection.classList.add('hidden');
    } else if (isIOS) {
      if (androidSection) androidSection.classList.add('hidden');
      if (iosSection) iosSection.classList.remove('hidden');
    } else {
      if (androidSection) androidSection.classList.remove('hidden');
      if (iosSection) iosSection.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  executeInstallPrompt() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('Usuario aceptó instalar PWA');
        }
        this.deferredPrompt = null;
        this.closeInstallModal();
      });
    } else {
      alert('Para instalar en tu navegador, haz clic en el icono de instalación en la barra de direcciones o en el menú de opciones (tres puntos) > "Instalar aplicación".');
      this.closeInstallModal();
    }
  }

  closeInstallModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (modal) modal.classList.add('hidden');
  }

  showToast(message) {
    const toast = document.getElementById('toastNotification');
    const text = document.getElementById('toastMessage');
    if (!toast || !text) return;

    text.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('flex');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('flex');
    }, 2800);
  }
}

// Inicializar la aplicación globalmente
window.app = new DuoControlApp();
