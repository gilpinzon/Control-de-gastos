/**
 * DUOCONTROL | LÓGICA PRINCIPAL DE LA APLICACIÓN (PWA & CLOUD SYNC)
 * Presupuesto Unificado / Fondo Común del Hogar & Lista de Mercado en Tiempo Real.
 * Despliegue en GitHub Pages + Persistencia en Supabase Cloud / Local Seguro.
 */

// Estado global inicial predeterminado con presupuesto unificado
const DEFAULT_INITIAL_STATE = {
  activeTab: 'dashboard',
  selectedMonth: {
    year: 2026,
    month: 10 // 0-indexed: 10 = Noviembre
  },
  txFilter: 'todos',
  couple: {
    name1: 'Diego',
    name2: 'Valentina',
    email1: 'diego@ejemplo.com',
    email2: 'valentina@ejemplo.com',
    currency: 'COP',
    symbol: '$',
    monthlySavingsGoal: 1000000 // Meta mensual de ahorro conjunto
  },
  supabase: {
    url: '',
    anonKey: '',
    isConnected: false
  },
  transactions: [
    {
      id: 'tx-1',
      type: 'ingreso',
      amount: 3200000,
      category: 'Salario / Sueldo',
      description: 'Salario Quincena (Diego)',
      date: '2026-11-01',
      paidBy: 'Diego',
      createdAt: '2026-11-01T10:00:00Z'
    },
    {
      id: 'tx-2',
      type: 'ingreso',
      amount: 3100000,
      category: 'Salario / Sueldo',
      description: 'Salario Quincena (Valentina)',
      date: '2026-11-01',
      paidBy: 'Valentina',
      createdAt: '2026-11-01T10:05:00Z'
    },
    {
      id: 'tx-3',
      type: 'gasto',
      amount: 1450000,
      category: 'Vivienda & Renta',
      description: 'Arriendo Apartamento',
      date: '2026-11-02',
      paidBy: 'Diego',
      createdAt: '2026-11-02T14:30:00Z'
    },
    {
      id: 'tx-4',
      type: 'gasto',
      amount: 480000,
      category: 'Supermercado',
      description: 'Mercado del mes',
      date: '2026-11-03',
      paidBy: 'Valentina',
      createdAt: '2026-11-03T18:45:00Z'
    },
    {
      id: 'tx-5',
      type: 'gasto',
      amount: 280000,
      category: 'Servicios Públicos',
      description: 'Luz, Agua e Internet fibra',
      date: '2026-11-04',
      paidBy: 'Diego',
      createdAt: '2026-11-04T09:20:00Z'
    },
    {
      id: 'tx-6',
      type: 'gasto',
      amount: 195000,
      category: 'Comida & Salidas',
      description: 'Cena familiar en restaurante',
      date: '2026-11-05',
      paidBy: 'Ambos',
      createdAt: '2026-11-05T21:15:00Z'
    },
    {
      id: 'tx-7',
      type: 'gasto',
      amount: 120000,
      category: 'Transporte & Gasolina',
      description: 'Combustible del auto',
      date: '2026-11-06',
      paidBy: 'Valentina',
      createdAt: '2026-11-06T11:00:00Z'
    }
  ],
  shoppingList: [
    { id: 'shop-1', name: 'Leche deslactosada x 6', category: 'Lácteos y Huevos', quantity: '6 bolsas', isPurchased: true, addedBy: 'Valentina' },
    { id: 'shop-2', name: 'Huevos AA x 30', category: 'Lácteos y Huevos', quantity: '1 panal', isPurchased: true, addedBy: 'Diego' },
    { id: 'shop-3', name: 'Aguacates Hass', category: 'Frutas y Verduras', quantity: '4 und', isPurchased: false, addedBy: 'Valentina' },
    { id: 'shop-4', name: 'Pechuga de pollo', category: 'Carnes y Pollo', quantity: '1.5 kg', isPurchased: false, addedBy: 'Diego' },
    { id: 'shop-5', name: 'Detergente líquido', category: 'Aseo y Hogar', quantity: '3 Litros', isPurchased: false, addedBy: 'Valentina' },
    { id: 'shop-6', name: 'Café tostado especial', category: 'Despensa y Granos', quantity: '500g', isPurchased: false, addedBy: 'Diego' },
    { id: 'shop-7', name: 'Aceite de Oliva Extra Virgen', category: 'Despensa y Granos', quantity: '1 botella', isPurchased: false, addedBy: 'Valentina' }
  ]
};

// Categorías de gastos e ingresos del fondo común
const CATEGORIES = {
  gasto: [
    { name: 'Comida & Salidas', icon: 'utensils', color: '#f97316' },
    { name: 'Supermercado', icon: 'shopping-cart', color: '#10b981' },
    { name: 'Servicios Públicos', icon: 'zap', color: '#f59e0b' },
    { name: 'Vivienda & Renta', icon: 'home', color: '#6366f1' },
    { name: 'Transporte & Gasolina', icon: 'car', color: '#06b6d4' },
    { name: 'Ocio & Streaming', icon: 'film', color: '#a855f7' },
    { name: 'Salud & Farmacia', icon: 'heart-pulse', color: '#ec4899' },
    { name: 'Compras del Hogar', icon: 'shopping-bag', color: '#3b82f6' },
    { name: 'Otros Gastos', icon: 'more-horizontal', color: '#64748b' }
  ],
  ingreso: [
    { name: 'Salario / Sueldo', icon: 'briefcase', color: '#10b981' },
    { name: 'Inversiones & Rendimientos', icon: 'trending-up', color: '#06b6d4' },
    { name: 'Regalos / Bonos', icon: 'gift', color: '#a855f7' },
    { name: 'Otros Ingresos', icon: 'dollar-sign', color: '#3b82f6' }
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
    this.supabaseClient = null;

    this.init();
  }

  // Carga el estado de localStorage o inicial
  loadState() {
    try {
      const saved = localStorage.getItem('duocontrol_unified_v2');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error al cargar estado de localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE));
  }

  // Guarda el estado en localStorage
  saveState() {
    try {
      localStorage.setItem('duocontrol_unified_v2', JSON.stringify(this.state));
    } catch (e) {
      console.warn('Error al guardar estado:', e);
    }
  }

  // Inicialización de la aplicación
  init() {
    this.setupPwaListeners();
    this.setupDateDefaults();
    this.applySettingsToUI();
    this.updateHeaderUI();
    this.renderDashboard();
    this.renderMarket();
    this.renderUnifiedFund();
    this.refreshSmartInsights();

    // Supabase auto-connect si existen credenciales
    if (this.state.supabase && this.state.supabase.url && this.state.supabase.anonKey) {
      this.initSupabase(this.state.supabase.url, this.state.supabase.anonKey);
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Configura fecha actual por defecto
  setupDateDefaults() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('txDateInput');
    if (dateInput) dateInput.value = today;
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
      coupleNameEl.textContent = `${c.name1} & ${c.name2} • Fondo Común 🏡`;
    }

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const mLabel = `${monthNames[this.state.selectedMonth.month]} ${this.state.selectedMonth.year}`;
    const headerMonthLabel = document.getElementById('headerMonthLabel');
    const chartMonthBadge = document.getElementById('chartMonthBadge');
    if (headerMonthLabel) headerMonthLabel.textContent = mLabel;
    if (chartMonthBadge) chartMonthBadge.textContent = mLabel;

    // Actualiza botones en el modal
    const paidLabel1 = document.getElementById('paidByLabel1');
    const paidLabel2 = document.getElementById('paidByLabel2');
    if (paidLabel1) paidLabel1.textContent = c.name1;
    if (paidLabel2) paidLabel2.textContent = c.name2;
  }

  // Navegación entre pestañas
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
  }

  // =========================================================================
  // MÓDULO 1: FINANZAS & FONDO COMÚN
  // =========================================================================

  getFilteredTransactions() {
    const { year, month } = this.state.selectedMonth;
    return this.state.transactions.filter(tx => {
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
        btn.className = 'px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else {
        btn.className = 'px-2 py-1 rounded-md text-[11px] font-semibold bg-white/5 text-slate-400 hover:text-white';
      }
    });

    this.renderTransactionsList();
  }

  renderDashboard() {
    const { year, month } = this.state.selectedMonth;
    const monthTxs = this.state.transactions.filter(tx => {
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
    if (pLeft) pLeft.textContent = `${budgetUsedPercent}% de los ingresos gastados`;
    if (pRight) {
      pRight.textContent = netBalance >= 0 
        ? `${this.formatCurrency(netBalance)} restante en el fondo común` 
        : `Déficit: ${this.formatCurrency(Math.abs(netBalance))}`;
    }

    // Render gráfico y lista
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

    const palette = ['#10b981', '#f43f5e', '#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'];

    categories.sort((a, b) => categoryTotals[b] - categoryTotals[a]);

    categories.forEach((cat, idx) => {
      labels.push(cat);
      data.push(categoryTotals[cat]);
      colors.push(palette[idx % palette.length]);
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
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
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

    // Leyendas
    if (legendsGrid) {
      legendsGrid.innerHTML = categories.map((cat, idx) => {
        const val = categoryTotals[cat];
        const pct = Math.round((val / totalExpense) * 100);
        const col = colors[idx];
        return `
          <div class="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/5">
            <div class="flex items-center space-x-2 truncate">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${col};"></span>
              <span class="truncate font-medium text-slate-300">${cat}</span>
            </div>
            <div class="text-right shrink-0 ml-2">
              <span class="font-bold text-white tabular-nums">${pct}%</span>
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
        <div class="text-center py-8 text-slate-500 space-y-2">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-600"></i>
          <p class="text-xs">No hay movimientos en el fondo para este filtro o mes</p>
          <button onclick="app.openTransactionModal('gasto')" class="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30">
            + Añadir un gasto
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    txs.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = txs.map(tx => {
      const isExpense = tx.type === 'gasto';
      const sign = isExpense ? '-' : '+';
      const colorClass = isExpense ? 'text-rose-400' : 'text-emerald-400';
      const iconName = isExpense ? 'arrow-up-right' : 'arrow-down-left';
      const iconBg = isExpense ? 'bg-rose-500/15 text-rose-400 border-rose-500/20' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all">
          <div class="flex items-center space-x-3 truncate">
            <div class="w-10 h-10 rounded-xl ${iconBg} border flex items-center justify-center shrink-0">
              <i data-lucide="${iconName}" class="w-5 h-5"></i>
            </div>
            <div class="truncate">
              <div class="flex items-center space-x-1.5">
                <span class="text-xs sm:text-sm font-semibold text-slate-100 truncate">${tx.description || tx.category}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded-md bg-white/10 text-slate-400 shrink-0">${tx.category}</span>
              </div>
              <div class="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                <span>${tx.date}</span>
                <span>•</span>
                <span class="text-slate-400 font-medium">Por: ${tx.paidBy}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2.5 shrink-0 ml-3">
            <span class="text-xs sm:text-sm font-black tabular-nums ${colorClass}">
              ${sign}${this.formatCurrency(tx.amount)}
            </span>
            <button onclick="app.deleteTransaction('${tx.id}')" class="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors" title="Eliminar">
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
    this.state.transactions = this.state.transactions.filter(t => t.id !== id);
    this.saveState();
    this.renderDashboard();
    this.renderUnifiedFund();
    this.showToast('Movimiento eliminado del fondo');

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('transactions').delete().eq('id', id).then();
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
          <div class="text-center py-6 text-slate-500 bg-white/[0.02] rounded-2xl border border-white/5">
            <i data-lucide="check-check" class="w-8 h-8 mx-auto text-emerald-400 mb-2"></i>
            <p class="text-xs font-semibold text-slate-300">¡Todo comprado! La despensa está completa 🎉</p>
            <p class="text-[11px] text-slate-500 mt-0.5">Añade productos cuando hagan falta en el hogar</p>
          </div>
        `;
      } else {
        pendingContainer.innerHTML = pending.map(item => `
          <div class="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-emerald-500/40 transition-all">
            <div class="flex items-center space-x-3 truncate">
              <button onclick="app.toggleGroceryItem('${item.id}', true)" class="w-6 h-6 rounded-lg border-2 border-slate-500 hover:border-emerald-400 flex items-center justify-center shrink-0 touch-press transition-colors">
              </button>
              <div class="truncate">
                <span class="text-sm font-semibold text-white block truncate">${item.name}</span>
                <div class="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                  <span class="text-emerald-400 font-medium">${item.category}</span>
                  <span>•</span>
                  <span>Cant: <strong class="text-slate-300">${item.quantity || '1'}</strong></span>
                  <span>•</span>
                  <span>Por ${item.addedBy || 'Hogar'}</span>
                </div>
              </div>
            </div>
            <button onclick="app.deleteGroceryItem('${item.id}')" class="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg">
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
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 opacity-65 hover:opacity-100 transition-opacity">
            <div class="flex items-center space-x-3 truncate">
              <button onclick="app.toggleGroceryItem('${item.id}', false)" class="w-5 h-5 rounded-md bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 touch-press">
                <i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>
              </button>
              <span class="text-xs font-medium text-slate-400 line-through truncate">${item.name} (${item.quantity || '1'})</span>
            </div>
            <button onclick="app.deleteGroceryItem('${item.id}')" class="text-slate-600 hover:text-rose-400 p-1">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
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
        btn.className = 'grocery-cat-chip px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0';
      } else {
        btn.className = 'grocery-cat-chip px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 text-slate-400 hover:text-white shrink-0';
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
    const category = catInput ? catInput.value : 'General';

    if (!name) return;

    const newItem = {
      id: 'shop-' + Date.now(),
      name: name,
      category: category,
      quantity: quantity,
      isPurchased: false,
      addedBy: this.state.couple.name1,
      createdAt: new Date().toISOString()
    };

    this.state.shoppingList.unshift(newItem);
    this.saveState();

    if (nameInput) nameInput.value = '';
    this.renderMarket();
    this.refreshSmartInsights();
    this.showToast(`"${name}" añadido a la lista`);

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('shopping_items').insert([{
        name: newItem.name,
        category: newItem.category,
        quantity: newItem.quantity,
        is_purchased: false,
        added_by: newItem.addedBy
      }]).then();
    }
  }

  toggleGroceryItem(id, isPurchased) {
    const item = this.state.shoppingList.find(i => i.id === id);
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
      this.showToast('¡Mercado del hogar completado al 100%! 🛒✨');
    }

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('shopping_items').update({
        is_purchased: isPurchased
      }).eq('id', id).then();
    }
  }

  deleteGroceryItem(id) {
    this.state.shoppingList = this.state.shoppingList.filter(i => i.id !== id);
    this.saveState();
    this.renderMarket();
    this.refreshSmartInsights();

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('shopping_items').delete().eq('id', id).then();
    }
  }

  clearCompletedItems() {
    const count = this.state.shoppingList.filter(i => i.isPurchased).length;
    if (count === 0) return;
    if (!confirm(`¿Eliminar los ${count} productos ya comprados?`)) return;

    this.state.shoppingList = this.state.shoppingList.filter(i => !i.isPurchased);
    this.saveState();
    this.renderMarket();
    this.refreshSmartInsights();
    this.showToast('Productos comprados limpiados');

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('shopping_items').delete().eq('is_purchased', true).then();
    }
  }

  uncheckAllItems() {
    this.state.shoppingList.forEach(i => i.isPurchased = false);
    this.saveState();
    this.renderMarket();
    this.showToast('Todos los productos marcados como pendientes');

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('shopping_items').update({ is_purchased: false }).then();
    }
  }

  // =========================================================================
  // MÓDULO 3: SMART INSIGHTS & RECOMENDACIONES (PRESUPUESTO UNIFICADO)
  // =========================================================================

  refreshSmartInsights() {
    const { year, month } = this.state.selectedMonth;
    const c = this.state.couple;
    const targetGoal = Number(c.monthlySavingsGoal) || 1000000;

    const monthTxs = this.state.transactions.filter(tx => {
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
    const pendingMarketCount = this.state.shoppingList.filter(i => !i.isPurchased).length;

    const insights = [];

    // 1. Meta de Ahorro del Fondo Común
    if (net >= targetGoal) {
      insights.push({
        badge: 'Meta Superada',
        icon: 'trophy',
        color: 'emerald',
        text: `🏆 ¡Meta superada! Han acumulado ${this.formatCurrency(net)} en el fondo unificado este mes (superando la meta de ${this.formatCurrency(targetGoal)}).`
      });
    } else if (net > 0) {
      const pctTarget = Math.round((net / targetGoal) * 100);
      insights.push({
        badge: 'Ahorro Conjunto',
        icon: 'sparkles',
        color: 'emerald',
        text: `🎯 Van al ${pctTarget}% de la meta mensual: Llevan acumulado ${this.formatCurrency(net)} en el fondo común.`
      });
    } else if (net < 0) {
      insights.push({
        badge: 'Alerta Déficit',
        icon: 'alert-triangle',
        color: 'rose',
        text: `⚠️ Alerta de Fondo Común: Los gastos del hogar superan los ingresos en ${this.formatCurrency(Math.abs(net))}. Conviene moderar salidas no prioritarias.`
      });
    }

    // 2. Tasa de Ahorro General
    if (savingsRate >= 20) {
      insights.push({
        badge: 'Salud Financiera',
        icon: 'check-circle-2',
        color: 'emerald',
        text: `✨ El fondo común conserva una tasa de ahorro del ${savingsRate}% de los ingresos familiares este mes.`
      });
    }

    // 3. Categoría con mayor consumo del fondo común
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
      if (pct >= 30) {
        insights.push({
          badge: 'Gasto Principal',
          icon: 'pie-chart',
          color: 'amber',
          text: `📊 "${topCat}" absorbe el ${pct}% de los gastos del hogar este mes (${this.formatCurrency(topCatAmt)}).`
        });
      }
    }

    // 4. Recordatorio de Supermercado
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
    const targetGoal = Number(c.monthlySavingsGoal) || 1000000;

    const monthTxs = this.state.transactions.filter(tx => {
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
    const targetPercent = targetGoal > 0 ? Math.min(100, Math.max(0, Math.round((netSaved / targetGoal) * 100))) : 0;
    const remainingToTarget = Math.max(0, targetGoal - netSaved);

    // Actualiza UI de meta de ahorro
    const savedAmountEl = document.getElementById('fundMonthlySavedAmount');
    const targetAmountEl = document.getElementById('fundMonthlyTargetAmount');
    const progressBarEl = document.getElementById('fundTargetProgressBar');
    const percentTextEl = document.getElementById('fundTargetPercentText');
    const remainingTextEl = document.getElementById('fundTargetRemainingText');

    if (savedAmountEl) savedAmountEl.textContent = this.formatCurrency(netSaved);
    if (targetAmountEl) targetAmountEl.textContent = this.formatCurrency(targetGoal);
    if (progressBarEl) progressBarEl.style.width = `${targetPercent}%`;
    if (percentTextEl) percentTextEl.textContent = `${targetPercent}% de la meta mensual`;
    if (remainingTextEl) {
      if (netSaved >= targetGoal) {
        remainingTextEl.textContent = '🎉 ¡Objetivo de ahorro completado!';
        remainingTextEl.className = 'text-emerald-400 font-bold';
      } else {
        remainingTextEl.textContent = `Faltan ${this.formatCurrency(remainingToTarget)}`;
        remainingTextEl.className = 'text-slate-400';
      }
    }

    // Aportes a ingresos familiares (informativo)
    const name1El = document.getElementById('fundPerson1Name');
    const name2El = document.getElementById('fundPerson2Name');
    const amt1El = document.getElementById('fundPerson1Amount');
    const amt2El = document.getElementById('fundPerson2Amount');
    const pct1El = document.getElementById('fundPerson1Percent');
    const pct2El = document.getElementById('fundPerson2Percent');

    const totalIncRecorded = incPerson1 + incPerson2;
    const pct1 = totalIncRecorded > 0 ? Math.round((incPerson1 / totalIncRecorded) * 100) : 50;
    const pct2 = totalIncRecorded > 0 ? Math.round((incPerson2 / totalIncRecorded) * 100) : 50;

    if (name1El) name1El.textContent = c.name1;
    if (name2El) name2El.textContent = c.name2;
    if (amt1El) amt1El.textContent = this.formatCurrency(incPerson1);
    if (amt2El) amt2El.textContent = this.formatCurrency(incPerson2);
    if (pct1El) pct1El.textContent = `${pct1}% del fondo conjunto`;
    if (pct2El) pct2El.textContent = `${pct2}% del fondo conjunto`;

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
      this.state.transactions.forEach(t => {
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
            label: 'Ingresos Familiares',
            data: incomeData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6
          },
          {
            label: 'Gastos del Hogar',
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

    if (type === 'gasto') {
      if (expBtn) expBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white shadow-sm';
      if (incBtn) incBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
      if (submitBtn) {
        submitBtn.className = 'w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-extrabold text-sm touch-press shadow-lg shadow-rose-500/25 flex items-center justify-center space-x-2';
        submitBtn.innerHTML = '<i data-lucide="minus-circle" class="w-4 h-4"></i><span>Guardar Gasto del Hogar</span>';
      }
    } else {
      if (incBtn) incBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 shadow-sm';
      if (expBtn) expBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
      if (submitBtn) {
        submitBtn.className = 'w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-sm touch-press shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2';
        submitBtn.innerHTML = '<i data-lucide="plus-circle" class="w-4 h-4"></i><span>Guardar Ingreso al Fondo</span>';
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
              class="tx-cat-card p-2.5 rounded-xl border ${idx === 0 ? 'border-emerald-500/60 bg-emerald-500/20 text-white' : 'border-white/10 bg-slate-900/80 text-slate-300'} flex flex-col items-center justify-center text-center touch-press hover:bg-white/10">
        <i data-lucide="${cat.icon}" class="w-5 h-5 mb-1" style="color: ${cat.color}"></i>
        <span class="text-[11px] font-semibold leading-tight line-clamp-1">${cat.name}</span>
      </button>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  selectModalCategory(catName, btnElement) {
    const hiddenInput = document.getElementById('txSelectedCategory');
    if (hiddenInput) hiddenInput.value = catName;

    document.querySelectorAll('.tx-cat-card').forEach(b => {
      b.className = 'tx-cat-card p-2.5 rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 flex flex-col items-center justify-center text-center touch-press hover:bg-white/10';
    });

    if (btnElement) {
      btnElement.className = 'tx-cat-card p-2.5 rounded-xl border border-emerald-500/60 bg-emerald-500/20 text-white flex flex-col items-center justify-center text-center touch-press';
    }
  }

  setTxPaidBy(option) {
    const c = this.state.couple;
    const hidden = document.getElementById('txSelectedPaidBy');
    const b1 = document.getElementById('paidByBtn-member1');
    const b2 = document.getElementById('paidByBtn-member2');
    const bShared = document.getElementById('paidByBtn-shared');

    let selectedValue = c.name1;
    if (option === 'member2') selectedValue = c.name2;
    if (option === 'shared') selectedValue = 'Ambos';

    if (hidden) hidden.value = selectedValue;

    [b1, b2, bShared].forEach(b => {
      if (b) b.className = 'py-2.5 px-2 rounded-xl border border-white/10 bg-slate-900 text-slate-300 text-xs font-bold flex flex-col items-center';
    });

    if (option === 'member1' && b1) {
      b1.className = 'py-2.5 px-2 rounded-xl border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 text-xs font-bold flex flex-col items-center';
    } else if (option === 'member2' && b2) {
      b2.className = 'py-2.5 px-2 rounded-xl border border-violet-500/50 bg-violet-500/20 text-violet-300 text-xs font-bold flex flex-col items-center';
    } else if (option === 'shared' && bShared) {
      bShared.className = 'py-2.5 px-2 rounded-xl border border-indigo-500/50 bg-indigo-500/20 text-indigo-300 text-xs font-bold flex flex-col items-center';
    }
  }

  addAmount(val) {
    const input = document.getElementById('txAmountInput');
    if (!input) return;
    const current = parseFloat(input.value) || 0;
    input.value = current + val;
  }

  clearAmount() {
    const input = document.getElementById('txAmountInput');
    if (input) input.value = '';
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
      id: 'tx-' + Date.now(),
      type: this.modalTxType,
      amount: amount,
      category: catInput ? catInput.value : 'General',
      description: descInput ? descInput.value.trim() : '',
      date: dateInput ? dateInput.value : new Date().toISOString().split('T')[0],
      paidBy: paidByInput ? paidByInput.value : this.state.couple.name1,
      createdAt: new Date().toISOString()
    };

    this.state.transactions.unshift(newTx);
    this.saveState();
    this.closeTransactionModal();
    this.renderDashboard();
    this.renderUnifiedFund();
    this.showToast(`${this.modalTxType === 'gasto' ? 'Gasto' : 'Ingreso'} guardado en el Fondo Común`);

    if (this.supabaseClient && this.state.supabase.isConnected) {
      this.supabaseClient.from('transactions').insert([{
        type: newTx.type,
        amount: newTx.amount,
        category: newTx.category,
        description: newTx.description,
        date: newTx.date,
        recorded_by: newTx.paidBy
      }]).then();
    }
  }

  // =========================================================================
  // MÓDULO 5: AJUSTES, WHITELIST & SUPABASE CLOUD
  // =========================================================================

  applySettingsToUI() {
    const c = this.state.couple;
    const n1 = document.getElementById('settingsName1');
    const n2 = document.getElementById('settingsName2');
    const goal = document.getElementById('settingsSavingsGoal');
    const curr = document.getElementById('settingsCurrency');
    const em1 = document.getElementById('settingsEmail1');
    const em2 = document.getElementById('settingsEmail2');
    const sUrl = document.getElementById('settingsSupabaseUrl');
    const sKey = document.getElementById('settingsSupabaseKey');

    if (n1) n1.value = c.name1 || 'Diego';
    if (n2) n2.value = c.name2 || 'Valentina';
    if (goal) goal.value = c.monthlySavingsGoal || 1000000;
    if (curr) curr.value = c.currency || 'COP';
    if (em1) em1.value = c.email1 || '';
    if (em2) em2.value = c.email2 || '';

    if (sUrl) sUrl.value = this.state.supabase?.url || '';
    if (sKey) sKey.value = this.state.supabase?.anonKey || '';

    this.updateSupabaseBadge();
  }

  saveCoupleProfileSettings() {
    const n1 = document.getElementById('settingsName1')?.value.trim();
    const n2 = document.getElementById('settingsName2')?.value.trim();
    const goal = parseFloat(document.getElementById('settingsSavingsGoal')?.value) || 1000000;
    const curr = document.getElementById('settingsCurrency')?.value;

    if (!n1 || !n2) {
      alert('Por favor ingresa ambos nombres de la pareja.');
      return;
    }

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
    this.showToast('Configuración del fondo común y meta de ahorro actualizados');
  }

  saveWhitelistSettings() {
    const e1 = document.getElementById('settingsEmail1')?.value.trim();
    const e2 = document.getElementById('settingsEmail2')?.value.trim();

    if (!e1 || !e2) {
      alert('Debes ingresar los dos correos autorizados para la seguridad RLS.');
      return;
    }

    this.state.couple.email1 = e1;
    this.state.couple.email2 = e2;
    this.saveState();
    this.showToast('Whitelist de 2 correos guardada exitosamente');
  }

  // Conexión Supabase Cloud
  async testAndSaveSupabaseConnection() {
    const url = document.getElementById('settingsSupabaseUrl')?.value.trim();
    const key = document.getElementById('settingsSupabaseKey')?.value.trim();

    if (!url || !key) {
      alert('Por favor introduce la URL y el Anon Key de Supabase.');
      return;
    }

    try {
      this.showToast('Conectando a Supabase Cloud...');
      if (!window.supabase) {
        throw new Error('Supabase SDK no disponible');
      }

      const client = window.supabase.createClient(url, key);
      const { data, error } = await client.from('shopping_items').select('count', { count: 'exact', head: true });
      if (error && error.code !== 'PGRST116') {
        console.warn('Supabase notice:', error);
      }

      this.supabaseClient = client;
      this.state.supabase = {
        url: url,
        anonKey: key,
        isConnected: true
      };
      this.saveState();
      this.updateSupabaseBadge();
      this.setupSupabaseRealtime();
      this.showToast('¡Conectado exitosamente a Supabase Cloud!');
    } catch (err) {
      alert('No se pudo conectar a Supabase: ' + err.message + '\nVerifica que la URL y Clave sean correctas y que hayas ejecutado supabase-schema.sql.');
    }
  }

  initSupabase(url, anonKey) {
    try {
      if (!window.supabase) return;
      this.supabaseClient = window.supabase.createClient(url, anonKey);
      this.state.supabase.isConnected = true;
      this.updateSupabaseBadge();
      this.setupSupabaseRealtime();
    } catch (e) {
      console.warn('Error al inicializar Supabase:', e);
    }
  }

  setupSupabaseRealtime() {
    if (!this.supabaseClient) return;

    try {
      this.supabaseClient
        .channel('public:shopping_items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, (payload) => {
          this.syncRemoteShoppingItem(payload);
        })
        .subscribe();
    } catch (e) {
      console.warn('Error al activar Supabase Realtime:', e);
    }
  }

  syncRemoteShoppingItem(payload) {
    if (payload.eventType === 'INSERT') {
      const exists = this.state.shoppingList.some(i => i.id === payload.new.id);
      if (!exists) {
        this.state.shoppingList.unshift({
          id: payload.new.id,
          name: payload.new.name,
          category: payload.new.category,
          quantity: payload.new.quantity,
          isPurchased: payload.new.is_purchased,
          addedBy: payload.new.added_by
        });
        this.saveState();
        this.renderMarket();
      }
    } else if (payload.eventType === 'UPDATE') {
      const item = this.state.shoppingList.find(i => i.id === payload.new.id);
      if (item) {
        item.isPurchased = payload.new.is_purchased;
        item.name = payload.new.name;
        this.saveState();
        this.renderMarket();
      }
    } else if (payload.eventType === 'DELETE') {
      this.state.shoppingList = this.state.shoppingList.filter(i => i.id !== payload.old.id);
      this.saveState();
      this.renderMarket();
    }
  }

  disconnectSupabase() {
    this.supabaseClient = null;
    this.state.supabase.isConnected = false;
    this.state.supabase.url = '';
    this.state.supabase.anonKey = '';
    this.saveState();
    this.applySettingsToUI();
    this.updateSupabaseBadge();
    this.showToast('Desconectado de Supabase. Operando en modo Local Seguro.');
  }

  updateSupabaseBadge() {
    const isConn = this.state.supabase?.isConnected;
    const badge = document.getElementById('supabaseConnectionBadge');
    const headerSyncText = document.getElementById('syncStatusText');

    if (badge) {
      badge.textContent = isConn ? '🟢 Supabase Cloud' : 'Local Seguro';
      badge.className = isConn 
        ? 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
        : 'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold';
    }

    if (headerSyncText) {
      headerSyncText.textContent = isConn ? 'Supabase' : 'GitHub Pages';
    }
  }

  // Backup & Restore
  exportBackupData() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `DuoControl_FondoComun_${new Date().toISOString().split('T')[0]}.json`);
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
        if (parsed.transactions && parsed.couple) {
          this.state = parsed;
          this.saveState();
          this.init();
          this.showToast('Copia del fondo restaurada exitosamente 🎉');
        } else {
          alert('El archivo JSON no tiene el formato válido de DuoControl.');
        }
      } catch (err) {
        alert('Error al leer el archivo de copia: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // =========================================================================
  // PWA (PROGRESSIVE WEB APP) & NATIVE INSTALL
  // =========================================================================

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
      console.log('[PWA] DuoControl instalada en el dispositivo');
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

  // Toast Notification
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

  // Month Picker Modal
  openMonthPickerModal() {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const m = this.state.selectedMonth.month;
    const y = this.state.selectedMonth.year;

    const choice = prompt(`Navegar de mes:\nEscribe 'ant' para mes anterior, 'sig' para mes siguiente, o 'hoy' para el mes actual.\n(Actualmente en ${monthNames[m]} ${y})`);
    
    if (choice === 'ant') {
      if (m === 0) {
        this.state.selectedMonth.month = 11;
        this.state.selectedMonth.year--;
      } else {
        this.state.selectedMonth.month--;
      }
    } else if (choice === 'sig') {
      if (m === 11) {
        this.state.selectedMonth.month = 0;
        this.state.selectedMonth.year++;
      } else {
        this.state.selectedMonth.month++;
      }
    } else if (choice === 'hoy') {
      const now = new Date();
      this.state.selectedMonth.month = now.getMonth();
      this.state.selectedMonth.year = now.getFullYear();
    }

    this.saveState();
    this.updateHeaderUI();
    this.renderDashboard();
    this.renderUnifiedFund();
  }
}

// Inicializar la aplicación globalmente
window.app = new DuoControlApp();
