/**
 * NOIRDA - Control de Gastos, Compras de Mercancía y Nómina
 * Diseñado para Santiago Varelas | NOIRDA Fashion Store
 * Arquitectura 100% Responsiva con IndexedDB y Soporte Multi-Dispositivo
 */

// ===================================================================
// BASE DE DATOS LOCAL CON INDEXEDDB (Alta capacidad para fotos y recibos)
// ===================================================================
class NoirdaDB {
  constructor() {
    this.dbName = 'NoirdaExpensesDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('compras')) {
          const comprasStore = db.createObjectStore('compras', { keyPath: 'id', autoIncrement: true });
          comprasStore.createIndex('fecha', 'fecha', { unique: false });
          comprasStore.createIndex('periodo', ['anio', 'mes'], { unique: false });
        }
        if (!db.objectStoreNames.contains('nomina')) {
          const nominaStore = db.createObjectStore('nomina', { keyPath: 'id', autoIncrement: true });
          nominaStore.createIndex('fecha', 'fecha', { unique: false });
          nominaStore.createIndex('periodo', ['anio', 'mes'], { unique: false });
        }
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('Error al abrir IndexedDB:', e);
        reject(e);
      };
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

// ===================================================================
// ESTADO Y CONTROLADOR PRINCIPAL DE LA APLICACIÓN
// ===================================================================
const App = {
  db: new NoirdaDB(),
  compras: [],
  nomina: [],
  config: {
    brandName: 'NOIRDA',
    ownerName: 'Santiago Varelas',
    currency: 'COP',
    logoData: null,
    showKpiTotal: true,
    showKpiCompras: true,
    showKpiNomina: true,
    showKpiRecibos: true,
    showCharts: true,
    darkTheme: true,
    customCategories: [],
    githubUser: 'shenao356',
    githubRepo: 'noirda',
    githubToken: '',
    githubAutoSync: false
  },
  filtroMes: 'todos',
  filtroAnio: new Date().getFullYear(),
  chartEvolucion: null,
  chartCategorias: null,
  reciboTempCompra: null,
  reciboTempNomina: null,

  async init() {
    await this.db.init();
    await this.cargarConfiguracion();

    // 1. Detección automática de Token por URL para vincular dispositivos con 1 solo clic
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    let tokenDetectado = urlParams.get('token') || urlParams.get('key') || urlParams.get('sync');

    if (!tokenDetectado && hash.includes('token=')) {
      tokenDetectado = hash.split('token=')[1].split('&')[0];
    } else if (!tokenDetectado && hash.includes('sync=')) {
      tokenDetectado = hash.split('sync=')[1].split('&')[0];
    }

    if (tokenDetectado) {
      this.config.githubUser = 'shenao356';
      this.config.githubRepo = 'noirda';
      this.config.githubToken = tokenDetectado.trim();
      this.config.githubAutoSync = true;
      await this.guardarConfiguracion();

      // Limpiar URL para que no quede expuesto el token en la barra de direcciones
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      this.mostrarToast('¡Dispositivo conectado exitosamente a la nube de Noirda!', 'success');
    }

    await this.cargarDatos();

    // Si tiene sincronización activa con GitHub, descargar datos más recientes en segundo plano
    if (this.config.githubAutoSync && this.config.githubToken) {
      await this.descargarDesdeGithub(true);
    } else if (this.compras.length === 0 && this.nomina.length === 0) {
      // Si está totalmente vacío y no hay sync, sembrar datos de ejemplo de alta moda
      await this.sembrarDatosIniciales();
      await this.cargarDatos();
    }

    this.iniciarPeriodosSelector();
    this.aplicarConfiguracionVisual();
    this.configurarEventos();
    this.renderTodo();
  },

  // Cargar configuración guardada
  async cargarConfiguracion() {
    try {
      const stored = await this.db.get('config', 'appConfig');
      if (stored && stored.value) {
        this.config = { ...this.config, ...stored.value };
      }
    } catch (e) {
      console.warn('Usando configuración por defecto');
    }
  },

  async guardarConfiguracion() {
    await this.db.put('config', { key: 'appConfig', value: this.config });
    this.aplicarConfiguracionVisual();
  },

  // Cargar registros de compras y nómina
  async cargarDatos() {
    this.compras = (await this.db.getAll('compras')).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    this.nomina = (await this.db.getAll('nomina')).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },

  // Generar datos iniciales demostrativos para Noirda
  async sembrarDatosIniciales() {
    const mesActual = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const anioActual = new Date().getFullYear();
    const hoyStr = `${anioActual}-${mesActual}-12`;
    const ayerStr = `${anioActual}-${mesActual}-05`;

    const comprasEjemplo = [
      {
        fecha: hoyStr,
        anio: anioActual,
        mes: mesActual,
        numeroFactura: 'FAC-7821',
        proveedor: 'Textiles del Valle S.A.S',
        categoria: 'Camisetas y Polos',
        descripcion: 'Lote 120 Camisetas Heavyweight Oversize Noirda Colección Otoño',
        monto: 3450000,
        metodoPago: 'Transferencia / Bancolombia',
        reciboData: this.generarSvgRecibo('Textiles del Valle', '3,450,000', 'FAC-7821', 'Camisetas Oversize'),
        reciboNombre: 'recibo_fac7821.png',
        reciboTipo: 'image/png',
        notas: 'Entrega en bodega central. 100% algodón peinado.'
      },
      {
        fecha: ayerStr,
        anio: anioActual,
        mes: mesActual,
        numeroFactura: 'INV-409',
        proveedor: 'Denim & Confección Medellín',
        categoria: 'Jeans y Pantalones',
        descripcion: '60 Pantalones Cargo y Jeans Wide Leg Negro Mate',
        monto: 2890000,
        metodoPago: 'Transferencia / Bancolombia',
        reciboData: this.generarSvgRecibo('Denim & Confección', '2,890,000', 'INV-409', 'Jeans Wide Leg'),
        reciboNombre: 'factura_jeans.png',
        reciboTipo: 'image/png',
        notas: 'Prendas con marquillas Noirda listas para percheros.'
      },
      {
        fecha: `${anioActual}-${mesActual}-02`,
        anio: anioActual,
        mes: mesActual,
        numeroFactura: 'EMP-982',
        proveedor: 'Bolsas & Etiquetas Premium',
        categoria: 'Empaques y Marquillas',
        descripcion: '500 Bolsas kraft negras con estampado dorado Noirda',
        monto: 650000,
        metodoPago: 'Nequi / Daviplata',
        reciboData: null,
        reciboNombre: '',
        reciboTipo: '',
        notas: 'Empaque para ventas en tienda y envíos.'
      }
    ];

    const nominaEjemplo = [
      {
        fecha: `${anioActual}-${mesActual}-15`,
        anio: anioActual,
        mes: mesActual,
        periodo: `1ra Quincena ${this.obtenerNombreMes(mesActual)} ${anioActual}`,
        trabajador: 'Camila Morales',
        cargo: 'Vendedor / Atención Almacén',
        sueldoBase: 800000,
        bonos: 150000,
        deducciones: 0,
        neto: 950000,
        metodoPago: 'Transferencia Bancaria',
        referencia: 'TR-99410',
        reciboData: this.generarSvgRecibo('Comprobante Nómina', '950,000', 'TR-99410', 'Camila Morales - Ventas'),
        reciboNombre: 'pago_camila.png',
        reciboTipo: 'image/png',
        notas: 'Incluye comisión meta mensual de ventas cumplida.'
      },
      {
        fecha: `${anioActual}-${mesActual}-15`,
        anio: anioActual,
        mes: mesActual,
        periodo: `1ra Quincena ${this.obtenerNombreMes(mesActual)} ${anioActual}`,
        trabajador: 'Andrés Felipe Gómez',
        cargo: 'Administrador Tienda',
        sueldoBase: 1200000,
        bonos: 100000,
        deducciones: 50000,
        neto: 1250000,
        metodoPago: 'Transferencia Bancaria',
        referencia: 'TR-99411',
        reciboData: this.generarSvgRecibo('Comprobante Nómina', '1,250,000', 'TR-99411', 'Andrés Gómez - Admin'),
        reciboNombre: 'pago_andres.png',
        reciboTipo: 'image/png',
        notas: 'Descuento anticipo pactado de 50.000.'
      }
    ];

    for (const c of comprasEjemplo) await this.db.put('compras', c);
    for (const n of nominaEjemplo) await this.db.put('nomina', n);
  },

  // Generador de SVG para simular comprobantes elegantes de muestra
  generarSvgRecibo(entidad, valor, ref, detalle) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
      <rect width="100%" height="100%" fill="#12151c" rx="16"/>
      <rect x="20" y="20" width="560" height="760" fill="none" stroke="#d4af37" stroke-width="2" stroke-dasharray="8 4" rx="12"/>
      <circle cx="300" cy="110" r="45" fill="#1c222e" stroke="#d4af37" stroke-width="2"/>
      <text x="300" y="125" font-family="sans-serif" font-size="44" font-weight="bold" fill="#d4af37" text-anchor="middle">N</text>
      <text x="300" y="195" font-family="sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="4">NOIRDA</text>
      <text x="300" y="225" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">Santiago Varelas | Soporte Contable</text>
      <line x1="60" y1="260" x2="540" y2="260" stroke="#2a3242" stroke-width="2"/>
      <text x="60" y="310" font-family="sans-serif" font-size="14" fill="#94a3b8">COMPROBANTE / FACTURA:</text>
      <text x="60" y="340" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff">${ref}</text>
      <text x="60" y="400" font-family="sans-serif" font-size="14" fill="#94a3b8">CONCEPTO / BENEFICIARIO:</text>
      <text x="60" y="430" font-family="sans-serif" font-size="20" font-weight="600" fill="#f8fafc">${entidad}</text>
      <text x="60" y="490" font-family="sans-serif" font-size="14" fill="#94a3b8">DETALLE DE LA OPERACIÓN:</text>
      <text x="60" y="520" font-family="sans-serif" font-size="16" fill="#cbd5e1">${detalle}</text>
      <rect x="60" y="570" width="480" height="90" fill="#1c222e" rx="10" stroke="#d4af37" stroke-width="1"/>
      <text x="90" y="605" font-family="sans-serif" font-size="13" fill="#94a3b8">VALOR TOTAL PAGADO:</text>
      <text x="90" y="640" font-family="sans-serif" font-size="30" font-weight="bold" fill="#f3e5ab">$ ${valor} COP</text>
      <text x="300" y="730" font-family="sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Documento verificado y archivado digitalmente en Noirda OS</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  // Inicializar selectores de Año y Mes
  iniciarPeriodosSelector() {
    const selMes = document.getElementById('filtroMesGlobal');
    const selAnio = document.getElementById('filtroAnioGlobal');

    const meses = [
      { id: 'todos', nombre: 'Todos los meses' },
      { id: '01', nombre: 'Enero' },
      { id: '02', nombre: 'Febrero' },
      { id: '03', nombre: 'Marzo' },
      { id: '04', nombre: 'Abril' },
      { id: '05', nombre: 'Mayo' },
      { id: '06', nombre: 'Junio' },
      { id: '07', nombre: 'Julio' },
      { id: '08', nombre: 'Agosto' },
      { id: '09', nombre: 'Septiembre' },
      { id: '10', nombre: 'Octubre' },
      { id: '11', nombre: 'Noviembre' },
      { id: '12', nombre: 'Diciembre' }
    ];

    selMes.innerHTML = meses.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');
    
    // Seleccionar mes actual por defecto
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    selMes.value = currentMonth;
    this.filtroMes = currentMonth;

    // Selector de Años
    const currentYear = new Date().getFullYear();
    const anios = [currentYear - 1, currentYear, currentYear + 1];
    selAnio.innerHTML = anios.map(a => `<option value="${a}" ${a === currentYear ? 'selected' : ''}>${a}</option>`).join('');
    this.filtroAnio = currentYear;
  },

  // Aplicar configuraciones visuales (Logo, Toggles, Nombre, Modo Oscuro/Claro)
  aplicarConfiguracionVisual() {
    // 1. Nombres
    const dispBrand = document.getElementById('displayBrandName');
    const dispOwner = document.getElementById('displayOwnerName');
    const inputBrand = document.getElementById('inputBrandName');
    const inputOwner = document.getElementById('inputOwnerName');
    const inputMoneda = document.getElementById('inputMoneda');

    if (dispBrand) dispBrand.textContent = this.config.brandName;
    if (dispOwner) dispOwner.textContent = this.config.ownerName;
    if (inputBrand) inputBrand.value = this.config.brandName;
    if (inputOwner) inputOwner.value = this.config.ownerName;
    if (inputMoneda) inputMoneda.value = this.config.currency;

    // 2. Logo
    const sidebarCircle = document.getElementById('sidebarLogoCircle');
    const sidebarImg = document.getElementById('sidebarLogoImg');
    const settingsPreview = document.getElementById('settingsLogoPreview');

    if (this.config.logoData) {
      sidebarImg.src = this.config.logoData;
      sidebarImg.classList.remove('hidden');
      sidebarCircle.classList.add('hidden');

      settingsPreview.innerHTML = `<img src="${this.config.logoData}" class="brand-logo-img" style="width:72px; height:72px;" alt="Logo Noirda">`;
    } else {
      sidebarImg.classList.add('hidden');
      sidebarCircle.classList.remove('hidden');
      settingsPreview.innerHTML = `<div class="brand-logo-circle large"><span>N</span></div>`;
    }

    // 3. Toggles de Interfaz
    const kpiTotal = document.getElementById('kpiCardTotal');
    const kpiCompras = document.getElementById('kpiCardCompras');
    const kpiNomina = document.getElementById('kpiCardNomina');
    const kpiRecibos = document.getElementById('kpiCardRecibos');
    const graficosContainer = document.querySelector('.dashboard-analytics-grid');

    if (kpiTotal) kpiTotal.style.display = this.config.showKpiTotal ? 'flex' : 'none';
    if (kpiCompras) kpiCompras.style.display = this.config.showKpiCompras ? 'flex' : 'none';
    if (kpiNomina) kpiNomina.style.display = this.config.showKpiNomina ? 'flex' : 'none';
    if (kpiRecibos) kpiRecibos.style.display = this.config.showKpiRecibos ? 'flex' : 'none';
    if (graficosContainer) graficosContainer.style.display = this.config.showCharts ? 'grid' : 'none';

    // Sincronizar checkboxes de ajustes
    document.getElementById('toggleKpiTotal').checked = this.config.showKpiTotal;
    document.getElementById('toggleKpiCompras').checked = this.config.showKpiCompras;
    document.getElementById('toggleKpiNomina').checked = this.config.showKpiNomina;
    document.getElementById('toggleKpiRecibos').checked = this.config.showKpiRecibos;
    document.getElementById('toggleGraficos').checked = this.config.showCharts;
    document.getElementById('toggleTemaOscuro').checked = this.config.darkTheme;

    // 4. Tema Oscuro vs Claro
    if (this.config.darkTheme) {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-noir');
    } else {
      document.body.classList.remove('theme-noir');
      document.body.classList.add('theme-light');
    }

    // 5. Categorías personalizadas en el selector de compras
    this.actualizarOpcionesCategorias();

    // 6. Campos de Sincronización GitHub
    const inGitUser = document.getElementById('inputGithubUser');
    const inGitRepo = document.getElementById('inputGithubRepo');
    const inGitToken = document.getElementById('inputGithubToken');
    const togGitAuto = document.getElementById('toggleGithubAutoSync');

    if (inGitUser) inGitUser.value = this.config.githubUser || '';
    if (inGitRepo) inGitRepo.value = this.config.githubRepo || 'NOIRDA';
    if (inGitToken) inGitToken.value = this.config.githubToken || '';
    if (togGitAuto) togGitAuto.checked = !!this.config.githubAutoSync;
  },

  actualizarOpcionesCategorias() {
    const selCat = document.getElementById('compraCategoria');
    if (!selCat) return;

    const baseCategorias = [
      'Camisetas y Polos',
      'Jeans y Pantalones',
      'Chaquetas y Buzos',
      'Vestidos y Conjuntos',
      'Ropa Interior / Pijamas',
      'Calzado',
      'Accesorios / Gorras',
      'Telas y Confección',
      'Empaques y Marquillas',
      'Otros Suministros'
    ];

    const customs = this.config.customCategories || [];
    const setCombinado = new Set([...baseCategorias, ...customs]);

    const opcionesHtml = Array.from(setCombinado)
      .map(c => `<option value="${c}">${c}</option>`)
      .join('');

    selCat.innerHTML = opcionesHtml + `<option value="__custom__">➕ Otra categoría (Escribir personalizada)...</option>`;
  },

  // ===================================================================
  // RENDERIZADO GLOBAL Y CONSOLIDADO MENSUAL
  // ===================================================================
  renderTodo() {
    this.renderConsolidadoMensual();
    this.renderTablaCompras();
    this.renderTablaNomina();
    this.renderGaleriaRecibos();
    this.renderBadges();
  },

  renderBadges() {
    document.getElementById('badgeCompras').textContent = this.compras.length;
    document.getElementById('badgeNomina').textContent = this.nomina.length;
  },

  // Filtrado de elementos por Mes y Año
  filtrarPorPeriodo(elementos) {
    return elementos.filter(item => {
      const matchAnio = parseInt(item.anio) === parseInt(this.filtroAnio);
      if (!matchAnio) return false;
      if (this.filtroMes === 'todos') return true;
      return item.mes === this.filtroMes;
    });
  },

  renderConsolidadoMensual() {
    const comprasFiltradas = this.filtrarPorPeriodo(this.compras);
    const nominaFiltrada = this.filtrarPorPeriodo(this.nomina);

    const totalCompras = comprasFiltradas.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const totalNomina = nominaFiltrada.reduce((sum, item) => sum + Number(item.neto || 0), 0);
    const totalConsolidado = totalCompras + totalNomina;

    const recibosCompras = comprasFiltradas.filter(c => c.reciboData).length;
    const recibosNomina = nominaFiltrada.filter(n => n.reciboData).length;
    const totalRecibos = recibosCompras + recibosNomina;

    // Formatear cantidades
    document.getElementById('kpiTotalConsolidado').textContent = this.formatearDinero(totalConsolidado);
    document.getElementById('kpiTotalCompras').textContent = this.formatearDinero(totalCompras);
    document.getElementById('kpiTotalNomina').textContent = this.formatearDinero(totalNomina);
    document.getElementById('kpiTotalRecibos').textContent = totalRecibos;

    // Conteos y porcentajes
    const totalRegistros = comprasFiltradas.length + nominaFiltrada.length;
    document.getElementById('kpiCountTotal').textContent = `${totalRegistros} movimientos`;
    document.getElementById('kpiCountCompras').textContent = `${comprasFiltradas.length} compras`;
    document.getElementById('kpiCountNomina').textContent = `${nominaFiltrada.length} pagos`;

    const pctCompras = totalConsolidado > 0 ? Math.round((totalCompras / totalConsolidado) * 100) : 0;
    const pctNomina = totalConsolidado > 0 ? Math.round((totalNomina / totalConsolidado) * 100) : 0;
    document.getElementById('kpiPercentCompras').textContent = `${pctCompras}% del gasto mensual`;
    document.getElementById('kpiPercentNomina').textContent = `${pctNomina}% del gasto mensual`;

    // Texto descriptivo del periodo
    const mesNombre = this.filtroMes === 'todos' ? 'Año Completo' : this.obtenerNombreMes(this.filtroMes);
    document.getElementById('kpiPeriodoTexto').textContent = `${mesNombre} ${this.filtroAnio}`;

    // Render de últimos registros combinados
    this.renderUltimosRegistros(comprasFiltradas, nominaFiltrada);

    // Gráficos de Chart.js
    this.renderGraficos(comprasFiltradas, nominaFiltrada, totalCompras, totalNomina);
  },

  renderUltimosRegistros(compras, nomina) {
    const tbody = document.getElementById('tbodyUltimosRegistros');
    if (!tbody) return;

    // Normalizar movimientos para la tabla unificada
    const movimientos = [
      ...compras.map(c => ({
        id: c.id,
        tipo: 'compra',
        tipoLabel: 'Mercancía',
        tipoBadge: 'blue',
        fecha: c.fecha,
        concepto: c.proveedor + ' - ' + c.descripcion,
        categoria: c.categoria,
        metodo: c.metodoPago,
        monto: c.monto,
        reciboData: c.reciboData,
        reciboNombre: c.reciboNombre,
        reciboTipo: c.reciboTipo,
        notas: c.notas
      })),
      ...nomina.map(n => ({
        id: n.id,
        tipo: 'nomina',
        tipoLabel: 'Nómina',
        tipoBadge: 'purple',
        fecha: n.fecha,
        concepto: n.trabajador + ' (' + n.cargo + ')',
        categoria: n.periodo,
        metodo: n.metodoPago,
        monto: n.neto,
        reciboData: n.reciboData,
        reciboNombre: n.reciboNombre,
        reciboTipo: n.reciboTipo,
        notas: n.notas
      }))
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (movimientos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">No hay registros en el periodo seleccionado. Haz clic en "Nuevo Registro" para comenzar.</td></tr>`;
      return;
    }

    tbody.innerHTML = movimientos.slice(0, 10).map(m => `
      <tr>
        <td style="white-space:nowrap; font-weight:600;">${m.fecha}</td>
        <td><span class="badge-tag ${m.tipoBadge}">${m.tipoLabel}</span></td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${m.concepto}">${m.concepto}</td>
        <td><span class="badge-tag neutral">${m.categoria}</span></td>
        <td>${m.metodo || 'Efectivo'}</td>
        <td style="font-weight:700; color:var(--gold-light);">${this.formatearDinero(m.monto)}</td>
        <td>
          ${m.reciboData ? `
            <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('${m.tipo}', ${m.id})">
              <i class="fa-solid fa-file-invoice"></i> Ver Recibo
            </button>
          ` : `<span class="receipt-none">Sin recibo</span>`}
        </td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-table-action" onclick="App.editarRegistro('${m.tipo}', ${m.id})" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table-action delete" onclick="App.eliminarRegistro('${m.tipo}', ${m.id})" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  // ===================================================================
  // CHARTS & ANALÍTICA CON CHART.JS
  // ===================================================================
  renderGraficos(comprasPeriodo, nominaPeriodo, totalCompras, totalNomina) {
    if (!this.config.showCharts) return;

    // 1. Gráfico Histórico Mensual (Últimos 6 meses)
    const ctxHist = document.getElementById('chartEvolucionMensual');
    if (ctxHist) {
      const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const ultimosMeses = [];
      const mesActualIndex = new Date().getMonth();
      const anio = this.filtroAnio;

      for (let i = 5; i >= 0; i--) {
        const mIdx = (mesActualIndex - i + 12) % 12;
        const mCod = (mIdx + 1).toString().padStart(2, '0');
        ultimosMeses.push({ cod: mCod, label: nombresMeses[mIdx] });
      }

      const dataCompras = ultimosMeses.map(m => {
        return this.compras
          .filter(c => parseInt(c.anio) === parseInt(anio) && c.mes === m.cod)
          .reduce((acc, cur) => acc + Number(cur.monto || 0), 0);
      });

      const dataNomina = ultimosMeses.map(m => {
        return this.nomina
          .filter(n => parseInt(n.anio) === parseInt(anio) && n.mes === m.cod)
          .reduce((acc, cur) => acc + Number(cur.neto || 0), 0);
      });

      if (this.chartEvolucion) {
        this.chartEvolucion.destroy();
      }

      this.chartEvolucion = new Chart(ctxHist, {
        type: 'bar',
        data: {
          labels: ultimosMeses.map(m => m.label),
          datasets: [
            {
              label: 'Compras Mercancía',
              data: dataCompras,
              backgroundColor: '#3b82f6',
              borderRadius: 6
            },
            {
              label: 'Nómina Personal',
              data: dataNomina,
              backgroundColor: '#a855f7',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: this.config.darkTheme ? '#cbd5e1' : '#475569', font: { family: 'Plus Jakarta Sans', size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${this.formatearDinero(ctx.raw)}`
              }
            }
          },
          scales: {
            x: {
              grid: { color: this.config.darkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ticks: { color: this.config.darkTheme ? '#94a3b8' : '#64748b' }
            },
            y: {
              grid: { color: this.config.darkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ticks: {
                color: this.config.darkTheme ? '#94a3b8' : '#64748b',
                callback: (val) => '$' + (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val)
              }
            }
          }
        }
      });
    }

    // 2. Gráfico de Dona: Distribución de Categorías
    const ctxCat = document.getElementById('chartCategorias');
    if (ctxCat) {
      const categoriasMap = {};

      comprasPeriodo.forEach(c => {
        const cat = c.categoria || 'Otras Compras';
        categoriasMap[cat] = (categoriasMap[cat] || 0) + Number(c.monto || 0);
      });

      if (totalNomina > 0) {
        categoriasMap['Nómina y Salarios'] = totalNomina;
      }

      const labels = Object.keys(categoriasMap);
      const values = Object.values(categoriasMap);

      if (this.chartCategorias) {
        this.chartCategorias.destroy();
      }

      const colors = ['#d4af37', '#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

      this.chartCategorias = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: labels.length > 0 ? labels : ['Sin datos'],
          datasets: [{
            data: values.length > 0 ? values : [1],
            backgroundColor: values.length > 0 ? colors.slice(0, labels.length) : ['#2a3242'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: this.config.darkTheme ? '#cbd5e1' : '#475569',
                boxWidth: 12,
                font: { family: 'Plus Jakarta Sans', size: 11 }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => values.length > 0 ? `${ctx.label}: ${this.formatearDinero(ctx.raw)}` : 'Sin datos'
              }
            }
          }
        }
      });
    }
  },

  // ===================================================================
  // TABLA DE COMPRAS DE MERCANCÍA
  // ===================================================================
  renderTablaCompras() {
    const tbody = document.getElementById('tbodyCompras');
    if (!tbody) return;

    let items = this.filtrarPorPeriodo(this.compras);
    const searchVal = document.getElementById('searchCompras')?.value.toLowerCase().trim();

    if (searchVal) {
      items = items.filter(c =>
        (c.proveedor && c.proveedor.toLowerCase().includes(searchVal)) ||
        (c.numeroFactura && c.numeroFactura.toLowerCase().includes(searchVal)) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(searchVal)) ||
        (c.categoria && c.categoria.toLowerCase().includes(searchVal))
      );
    }

    const total = items.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    document.getElementById('sumatoriaComprasFiltradas').textContent = this.formatearDinero(total);
    document.getElementById('conteoComprasFiltradas').textContent = `${items.length} facturas registradas`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);">No se encontraron compras en este periodo o búsqueda.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(c => `
      <tr>
        <td style="font-weight:600; white-space:nowrap;">${c.fecha}</td>
        <td><strong>${c.numeroFactura || 'S/N'}</strong></td>
        <td style="font-weight:600; color:var(--text-main);">${c.proveedor}</td>
        <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.descripcion}">${c.descripcion}</td>
        <td><span class="badge-tag blue">${c.categoria}</span></td>
        <td>${c.metodoPago || 'Efectivo'}</td>
        <td style="font-weight:700; color:var(--gold-light);">${this.formatearDinero(c.monto)}</td>
        <td>
          ${c.reciboData ? `
            <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('compra', ${c.id})">
              <i class="fa-solid fa-paperclip"></i> Ver Soporte
            </button>
          ` : `<span class="receipt-none">Sin soporte</span>`}
        </td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-table-action" onclick="App.editarRegistro('compra', ${c.id})" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table-action delete" onclick="App.eliminarRegistro('compra', ${c.id})" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  // ===================================================================
  // TABLA DE NÓMINA DE TRABAJADORES
  // ===================================================================
  renderTablaNomina() {
    const tbody = document.getElementById('tbodyNomina');
    if (!tbody) return;

    let items = this.filtrarPorPeriodo(this.nomina);
    const searchVal = document.getElementById('searchNomina')?.value.toLowerCase().trim();

    if (searchVal) {
      items = items.filter(n =>
        (n.trabajador && n.trabajador.toLowerCase().includes(searchVal)) ||
        (n.cargo && n.cargo.toLowerCase().includes(searchVal)) ||
        (n.periodo && n.periodo.toLowerCase().includes(searchVal))
      );
    }

    const total = items.reduce((sum, n) => sum + Number(n.neto || 0), 0);
    document.getElementById('sumatoriaNominaFiltrada').textContent = this.formatearDinero(total);
    document.getElementById('conteoNominaFiltrada').textContent = `${items.length} pagos de nómina`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-dim);">No se encontraron pagos de nómina en este periodo o búsqueda.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(n => `
      <tr>
        <td style="font-weight:600; white-space:nowrap;">${n.fecha}</td>
        <td style="font-weight:700;">${n.trabajador}</td>
        <td><span class="badge-tag purple">${n.cargo}</span></td>
        <td style="font-size:12px; color:var(--text-muted);">${n.periodo}</td>
        <td>${this.formatearDinero(n.sueldoBase)}</td>
        <td style="color:var(--emerald-primary);">+${this.formatearDinero(n.bonos || 0)}</td>
        <td style="color:var(--danger-primary);">${n.deducciones > 0 ? '-' + this.formatearDinero(n.deducciones) : '$0'}</td>
        <td style="font-weight:800; color:var(--gold-light);">${this.formatearDinero(n.neto)}</td>
        <td>
          ${n.reciboData ? `
            <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('nomina', ${n.id})">
              <i class="fa-solid fa-file-invoice-dollar"></i> Recibo Pago
            </button>
          ` : `<span class="receipt-none">Sin comprobante</span>`}
        </td>
        <td>
          <div class="action-buttons-cell">
            <button class="btn-table-action" onclick="App.editarRegistro('nomina', ${n.id})" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table-action delete" onclick="App.eliminarRegistro('nomina', ${n.id})" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  // ===================================================================
  // ARCHIVO DIGITAL DE RECIBOS Y COMPROBANTES
  // ===================================================================
  renderGaleriaRecibos(tipoFiltro = 'all') {
    const grid = document.getElementById('recibosGrid');
    if (!grid) return;

    let items = [];

    if (tipoFiltro === 'all' || tipoFiltro === 'compra') {
      const comprasConRecibo = this.filtrarPorPeriodo(this.compras).filter(c => c.reciboData);
      items.push(...comprasConRecibo.map(c => ({
        id: c.id,
        tipo: 'compra',
        badge: 'blue',
        tag: 'Compra Mercancía',
        titulo: c.proveedor,
        detalle: c.descripcion,
        fecha: c.fecha,
        monto: c.monto,
        reciboData: c.reciboData,
        reciboTipo: c.reciboTipo
      })));
    }

    if (tipoFiltro === 'all' || tipoFiltro === 'nomina') {
      const nominaConRecibo = this.filtrarPorPeriodo(this.nomina).filter(n => n.reciboData);
      items.push(...nominaConRecibo.map(n => ({
        id: n.id,
        tipo: 'nomina',
        badge: 'purple',
        tag: 'Pago de Nómina',
        titulo: n.trabajador,
        detalle: `${n.cargo} - ${n.periodo}`,
        fecha: n.fecha,
        monto: n.neto,
        reciboData: n.reciboData,
        reciboTipo: n.reciboTipo
      })));
    }

    // Ordenar por fecha reciente
    items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <i class="fa-solid fa-receipt" style="font-size: 40px; color: var(--gold-primary); margin-bottom: 14px;"></i>
          <h3>No hay recibos adjuntados en este periodo</h3>
          <p style="color: var(--text-muted); font-size: 13px; max-width: 400px; margin: 8px auto 0;">
            Cuando registres compras o pagos a trabajadores, adjunta fotos de las facturas o recibos con tu celular o PC para verlos archivados aquí.
          </p>
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map(item => `
      <div class="receipt-card">
        <div class="receipt-card-preview" onclick="App.abrirVisorRecibo('${item.tipo}', ${item.id})">
          ${item.reciboTipo && item.reciboTipo.includes('pdf') ? `
            <div class="receipt-pdf-placeholder">
              <i class="fa-solid fa-file-pdf" style="font-size: 44px;"></i>
              <span style="font-size:12px; font-weight:600;">Ver Archivo PDF</span>
            </div>
          ` : `
            <img src="${item.reciboData}" alt="Comprobante" loading="lazy">
          `}
        </div>
        <div class="receipt-card-body">
          <div class="receipt-badge-row">
            <span class="badge-tag ${item.badge}">${item.tag}</span>
            <span style="font-size: 11px; color: var(--text-dim);">${item.fecha}</span>
          </div>
          <h4 class="receipt-title">${item.titulo}</h4>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.detalle}</p>
          <div class="receipt-amount">${this.formatearDinero(item.monto)}</div>
          <div class="receipt-meta">
            <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('${item.tipo}', ${item.id})">
              <i class="fa-solid fa-eye"></i> Inspeccionar
            </button>
            <button class="btn-table-action" onclick="App.descargarReciboItem('${item.tipo}', ${item.id})" title="Descargar comprobante">
              <i class="fa-solid fa-download"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  // ===================================================================
  // VISOR DE RECIBOS (ZOOM, DESCARGA E IMPRESIÓN)
  // ===================================================================
  async abrirVisorRecibo(tipo, id) {
    let item;
    if (tipo === 'compra') {
      item = this.compras.find(c => c.id === id);
    } else {
      item = this.nomina.find(n => n.id === id);
    }

    if (!item || !item.reciboData) {
      this.mostrarToast('El registro no contiene un archivo adjunto.', 'error');
      return;
    }

    const modal = document.getElementById('modalVisorRecibo');
    const titulo = document.getElementById('visorTitulo');
    const meta = document.getElementById('visorMeta');
    const img = document.getElementById('visorImagen');
    const pdfBox = document.getElementById('visorPdfFallback');
    const pdfLink = document.getElementById('visorPdfLink');
    const btnDescargar = document.getElementById('btnDescargarRecibo');

    if (tipo === 'compra') {
      titulo.textContent = `Factura de Mercancía: ${item.proveedor}`;
      meta.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <strong>Proveedor: ${item.proveedor}</strong>
          <span style="color:var(--gold-primary); font-weight:700;">Total: ${this.formatearDinero(item.monto)}</span>
        </div>
        <div>N° Factura: <strong>${item.numeroFactura || 'S/N'}</strong> | Fecha: <strong>${item.fecha}</strong> | Pago: <strong>${item.metodoPago}</strong></div>
        <div style="color:var(--text-muted); margin-top:4px;">${item.descripcion}</div>
      `;
    } else {
      titulo.textContent = `Comprobante de Nómina: ${item.trabajador}`;
      meta.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <strong>Colaborador: ${item.trabajador} (${item.cargo})</strong>
          <span style="color:var(--gold-primary); font-weight:700;">Neto Pagado: ${this.formatearDinero(item.neto)}</span>
        </div>
        <div>Periodo: <strong>${item.periodo}</strong> | Fecha: <strong>${item.fecha}</strong> | Referencia: <strong>${item.referencia || 'N/A'}</strong></div>
        <div style="color:var(--text-muted); margin-top:4px;">Básico: ${this.formatearDinero(item.sueldoBase)} | Bonos: ${this.formatearDinero(item.bonos)} | Deducciones: ${this.formatearDinero(item.deducciones)}</div>
      `;
    }

    btnDescargar.href = item.reciboData;
    btnDescargar.download = item.reciboNombre || `recibo-noirda-${item.fecha}.png`;

    if (item.reciboTipo && item.reciboTipo.includes('pdf')) {
      img.classList.add('hidden');
      pdfBox.classList.remove('hidden');
      pdfLink.href = item.reciboData;
    } else {
      pdfBox.classList.add('hidden');
      img.src = item.reciboData;
      img.classList.remove('hidden');
    }

    modal.classList.add('active');
  },

  descargarReciboItem(tipo, id) {
    const item = tipo === 'compra' ? this.compras.find(c => c.id === id) : this.nomina.find(n => n.id === id);
    if (!item || !item.reciboData) return;
    const a = document.createElement('a');
    a.href = item.reciboData;
    a.download = item.reciboNombre || `comprobante-noirda-${id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  // ===================================================================
  // GESTIÓN DE FORMULARIOS: COMPRA Y NÓMINA
  // ===================================================================
  abrirModalCompra(id = null) {
    const modal = document.getElementById('modalCompra');
    const form = document.getElementById('formCompra');
    form.reset();

    document.getElementById('compraId').value = '';
    document.getElementById('compraFecha').value = new Date().toISOString().split('T')[0];
    
    // Resetear campo personalizado
    const grupoPers = document.getElementById('grupoCategoriaPersonalizada');
    if (grupoPers) grupoPers.classList.add('hidden');
    const inputPers = document.getElementById('compraCategoriaPersonalizada');
    if (inputPers) inputPers.value = '';

    this.reciboTempCompra = null;
    this.actualizarPreviewRecibo('compra', null);

    if (id) {
      const item = this.compras.find(c => c.id === id);
      if (item) {
        document.getElementById('modalCompraTitulo').textContent = 'Editar Compra de Mercancía';
        document.getElementById('compraId').value = item.id;
        document.getElementById('compraFecha').value = item.fecha;
        document.getElementById('compraNumeroFactura').value = item.numeroFactura || '';
        document.getElementById('compraProveedor').value = item.proveedor;

        // Comprobar si la categoría existe en el selector
        const selCat = document.getElementById('compraCategoria');
        let optionExists = false;
        for (let i = 0; i < selCat.options.length; i++) {
          if (selCat.options[i].value === item.categoria) {
            optionExists = true;
            break;
          }
        }
        if (!optionExists) {
          const opt = document.createElement('option');
          opt.value = item.categoria;
          opt.textContent = item.categoria;
          selCat.insertBefore(opt, selCat.lastElementChild);
        }
        selCat.value = item.categoria;

        document.getElementById('compraDescripcion').value = item.descripcion;
        document.getElementById('compraMonto').value = item.monto;
        document.getElementById('compraMetodoPago').value = item.metodoPago;
        document.getElementById('compraNotas').value = item.notas || '';

        if (item.reciboData) {
          this.reciboTempCompra = {
            data: item.reciboData,
            nombre: item.reciboNombre,
            tipo: item.reciboTipo
          };
          this.actualizarPreviewRecibo('compra', this.reciboTempCompra);
        }
      }
    } else {
      document.getElementById('modalCompraTitulo').textContent = 'Registrar Compra de Mercancía';
    }

    modal.classList.add('active');
  },

  abrirModalNomina(id = null) {
    const modal = document.getElementById('modalNomina');
    const form = document.getElementById('formNomina');
    form.reset();

    document.getElementById('nominaId').value = '';
    document.getElementById('nominaFecha').value = new Date().toISOString().split('T')[0];
    const mesActualNombre = this.obtenerNombreMes((new Date().getMonth() + 1).toString().padStart(2, '0'));
    document.getElementById('nominaPeriodo').value = `Mes ${mesActualNombre} ${new Date().getFullYear()}`;
    document.getElementById('nominaBonos').value = 0;
    document.getElementById('nominaDeducciones').value = 0;
    document.getElementById('displayNetoCalculado').textContent = '$0';
    this.reciboTempNomina = null;
    this.actualizarPreviewRecibo('nomina', null);

    if (id) {
      const item = this.nomina.find(n => n.id === id);
      if (item) {
        document.getElementById('modalNominaTitulo').textContent = 'Editar Pago de Nómina';
        document.getElementById('nominaId').value = item.id;
        document.getElementById('nominaFecha').value = item.fecha;
        document.getElementById('nominaPeriodo').value = item.periodo;
        document.getElementById('nominaTrabajador').value = item.trabajador;
        document.getElementById('nominaCargo').value = item.cargo;
        document.getElementById('nominaSueldoBase').value = item.sueldoBase;
        document.getElementById('nominaBonos').value = item.bonos || 0;
        document.getElementById('nominaDeducciones').value = item.deducciones || 0;
        document.getElementById('nominaMetodoPago').value = item.metodoPago;
        document.getElementById('nominaReferencia').value = item.referencia || '';
        document.getElementById('nominaNotas').value = item.notas || '';

        this.calcularNetoNomina();

        if (item.reciboData) {
          this.reciboTempNomina = {
            data: item.reciboData,
            nombre: item.reciboNombre,
            tipo: item.reciboTipo
          };
          this.actualizarPreviewRecibo('nomina', this.reciboTempNomina);
        }
      }
    } else {
      document.getElementById('modalNominaTitulo').textContent = 'Registrar Pago de Nómina';
    }

    modal.classList.add('active');
  },

  calcularNetoNomina() {
    const base = parseFloat(document.getElementById('nominaSueldoBase').value) || 0;
    const bonos = parseFloat(document.getElementById('nominaBonos').value) || 0;
    const deducciones = parseFloat(document.getElementById('nominaDeducciones').value) || 0;
    const neto = Math.max(0, base + bonos - deducciones);
    document.getElementById('displayNetoCalculado').textContent = this.formatearDinero(neto);
    return neto;
  },

  async guardarCompra(e) {
    e.preventDefault();
    const idVal = document.getElementById('compraId').value;
    const fecha = document.getElementById('compraFecha').value;
    const [anio, mes] = fecha.split('-');

    // Determinar categoría (estándar o personalizada)
    let categoriaSeleccionada = document.getElementById('compraCategoria').value;
    if (categoriaSeleccionada === '__custom__') {
      const inputPers = document.getElementById('compraCategoriaPersonalizada');
      const customVal = inputPers ? inputPers.value.trim() : '';
      if (!customVal) {
        this.mostrarToast('Por favor escribe el nombre de la categoría personalizada', 'error');
        return;
      }
      categoriaSeleccionada = customVal;

      // Guardar en la lista de personalizadas para reusar
      if (!this.config.customCategories) this.config.customCategories = [];
      if (!this.config.customCategories.includes(customVal)) {
        this.config.customCategories.push(customVal);
        await this.guardarConfiguracion();
      }
    }

    const datosCompra = {
      fecha,
      anio: parseInt(anio),
      mes: mes,
      numeroFactura: document.getElementById('compraNumeroFactura').value.trim(),
      proveedor: document.getElementById('compraProveedor').value.trim(),
      categoria: categoriaSeleccionada,
      descripcion: document.getElementById('compraDescripcion').value.trim(),
      monto: parseFloat(document.getElementById('compraMonto').value) || 0,
      metodoPago: document.getElementById('compraMetodoPago').value,
      reciboData: this.reciboTempCompra ? this.reciboTempCompra.data : null,
      reciboNombre: this.reciboTempCompra ? this.reciboTempCompra.nombre : '',
      reciboTipo: this.reciboTempCompra ? this.reciboTempCompra.tipo : '',
      notas: document.getElementById('compraNotas').value.trim()
    };

    if (idVal) {
      datosCompra.id = parseInt(idVal);
    }

    await this.db.put('compras', datosCompra);
    await this.cargarDatos();
    this.renderTodo();
    this.cerrarModal('modalCompra');
    this.mostrarToast(idVal ? 'Compra actualizada correctamente' : 'Compra registrada con éxito', 'success');

    // Sincronizar automáticamente con GitHub si está activo
    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }
  },

  async guardarNomina(e) {
    e.preventDefault();
    const idVal = document.getElementById('nominaId').value;
    const fecha = document.getElementById('nominaFecha').value;
    const [anio, mes] = fecha.split('-');
    const base = parseFloat(document.getElementById('nominaSueldoBase').value) || 0;
    const bonos = parseFloat(document.getElementById('nominaBonos').value) || 0;
    const deducciones = parseFloat(document.getElementById('nominaDeducciones').value) || 0;
    const neto = this.calcularNetoNomina();

    const datosNomina = {
      fecha,
      anio: parseInt(anio),
      mes: mes,
      periodo: document.getElementById('nominaPeriodo').value.trim(),
      trabajador: document.getElementById('nominaTrabajador').value.trim(),
      cargo: document.getElementById('nominaCargo').value,
      sueldoBase: base,
      bonos: bonos,
      deducciones: deducciones,
      neto: neto,
      metodoPago: document.getElementById('nominaMetodoPago').value,
      referencia: document.getElementById('nominaReferencia').value.trim(),
      reciboData: this.reciboTempNomina ? this.reciboTempNomina.data : null,
      reciboNombre: this.reciboTempNomina ? this.reciboTempNomina.nombre : '',
      reciboTipo: this.reciboTempNomina ? this.reciboTempNomina.tipo : '',
      notas: document.getElementById('nominaNotas').value.trim()
    };

    if (idVal) {
      datosNomina.id = parseInt(idVal);
    }

    await this.db.put('nomina', datosNomina);
    await this.cargarDatos();
    this.renderTodo();
    this.cerrarModal('modalNomina');
    this.mostrarToast(idVal ? 'Pago de nómina actualizado' : 'Pago de nómina guardado con éxito', 'success');

    // Sincronizar automáticamente con GitHub si está activo
    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }
  },

  editarRegistro(tipo, id) {
    if (tipo === 'compra') {
      this.abrirModalCompra(id);
    } else {
      this.abrirModalNomina(id);
    }
  },

  async eliminarRegistro(tipo, id) {
    const nombre = tipo === 'compra' ? 'esta compra de mercancía' : 'este pago de nómina';
    if (!confirm(`¿Estás seguro de eliminar ${nombre}? Esta acción no se puede deshacer.`)) return;

    if (tipo === 'compra') {
      await this.db.delete('compras', id);
    } else {
      await this.db.delete('nomina', id);
    }

    await this.cargarDatos();
    this.renderTodo();
    this.mostrarToast('Registro eliminado correctamente', 'info');
  },

  // ===================================================================
  // PROCESAMIENTO DE ARCHIVOS Y RECIBOS (FOTOS / PDFS)
  // ===================================================================
  procesarArchivoRecibo(file, tipo) {
    if (!file) return;

    // Límite de tamaño sugerido 15MB
    if (file.size > 15 * 1024 * 1024) {
      this.mostrarToast('El archivo es muy pesado. Intenta con uno menor a 15MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const objetoRecibo = {
        data: e.target.result,
        nombre: file.name,
        tipo: file.type
      };

      if (tipo === 'compra') {
        this.reciboTempCompra = objetoRecibo;
        this.actualizarPreviewRecibo('compra', objetoRecibo);
      } else {
        this.reciboTempNomina = objetoRecibo;
        this.actualizarPreviewRecibo('nomina', objetoRecibo);
      }
      this.mostrarToast('Recibo adjuntado correctamente', 'success');
    };
    reader.readAsDataURL(file);
  },

  actualizarPreviewRecibo(tipo, recibo) {
    const prompt = document.getElementById(tipo === 'compra' ? 'dropzoneCompraPrompt' : 'dropzoneNominaPrompt');
    const container = document.getElementById(tipo === 'compra' ? 'previewCompraContainer' : 'previewNominaContainer');
    const img = document.getElementById(tipo === 'compra' ? 'imgPreviewCompra' : 'imgPreviewNomina');
    const nameSpan = document.getElementById(tipo === 'compra' ? 'previewCompraNombre' : 'previewNominaNombre');

    if (recibo && recibo.data) {
      prompt.classList.add('hidden');
      container.classList.remove('hidden');
      nameSpan.textContent = recibo.nombre || 'recibo_adjunto';

      if (recibo.tipo && recibo.tipo.includes('pdf')) {
        img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23ef4444"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>';
      } else {
        img.src = recibo.data;
      }
    } else {
      prompt.classList.remove('hidden');
      container.classList.add('hidden');
    }
  },

  // ===================================================================
  // EXPORTACIÓN A EXCEL (.CSV) Y RESPALDO COMPLETO
  // ===================================================================
  exportarExcel(filtroPeriodo = true) {
    const comprasAExportar = filtroPeriodo ? this.filtrarPorPeriodo(this.compras) : this.compras;
    const nominaAExportar = filtroPeriodo ? this.filtrarPorPeriodo(this.nomina) : this.nomina;

    let csv = '\uFEFF'; // UTF-8 BOM para acentos en Microsoft Excel
    csv += 'REPORTE CONTABLE DE GASTOS - NOIRDA\r\n';
    csv += `Propietario: Santiago Varelas\r\n`;
    csv += `Generado el: ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO')}\r\n`;
    csv += `Periodo: ${filtroPeriodo ? (this.filtroMes === 'todos' ? 'Año ' + this.filtroAnio : this.obtenerNombreMes(this.filtroMes) + ' ' + this.filtroAnio) : 'Histórico Total'}\r\n\r\n`;

    // 1. Sección Compras
    csv += '--- COMPRAS DE MERCANCÍA ---\r\n';
    csv += 'Fecha;Factura N°;Proveedor;Categoría;Descripción de Prendas;Monto ($ COP);Método de Pago;Tiene Recibo;Notas\r\n';
    
    let subtotalCompras = 0;
    comprasAExportar.forEach(c => {
      subtotalCompras += Number(c.monto || 0);
      csv += `"${c.fecha}";"${c.numeroFactura || ''}";"${c.proveedor}";"${c.categoria}";"${c.descripcion.replace(/"/g, '""')}";${c.monto};"${c.metodoPago}";"${c.reciboData ? 'SÍ' : 'NO'}";"${(c.notas || '').replace(/"/g, '""')}"\r\n`;
    });
    csv += `;;;;TOTAL COMPRAS;${subtotalCompras};;;\r\n\r\n`;

    // 2. Sección Nómina
    csv += '--- NÓMINA DE TRABAJADORES ---\r\n';
    csv += 'Fecha Pago;Trabajador;Cargo;Periodo;Sueldo Base ($);Bonos/Comisiones ($);Deducciones ($);Neto Pagado ($);Medio Pago;Referencia;Tiene Recibo;Notas\r\n';
    
    let subtotalNomina = 0;
    nominaAExportar.forEach(n => {
      subtotalNomina += Number(n.neto || 0);
      csv += `"${n.fecha}";"${n.trabajador}";"${n.cargo}";"${n.periodo}";${n.sueldoBase};${n.bonos || 0};${n.deducciones || 0};${n.neto};"${n.metodoPago}";"${n.referencia || ''}";"${n.reciboData ? 'SÍ' : 'NO'}";"${(n.notas || '').replace(/"/g, '""')}"\r\n`;
    });
    csv += `;;;;;;;TOTAL NÓMINA;${subtotalNomina};;;;\r\n\r\n`;

    // 3. Gran Total
    csv += `;;;;GRAN TOTAL GASTOS CONSOLIDADOS;${subtotalCompras + subtotalNomina};;;;\r\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Noirda_Gastos_${this.filtroAnio}_${this.filtroMes}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.mostrarToast('Libro contable exportado a Excel (.csv)', 'success');
  },

  descargarCopiaCompleta() {
    const backup = {
      version: 1,
      fechaExportacion: new Date().toISOString(),
      config: this.config,
      compras: this.compras,
      nomina: this.nomina
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Respaldo_Noirda_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.mostrarToast('Copia de seguridad descargada exitosamente', 'success');
  },

  async restaurarCopiaCompleta(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.compras || !backup.nomina) {
        throw new Error('Formato de copia inválido');
      }

      if (!confirm('Esta acción reemplazará los datos actuales por los del respaldo. ¿Deseas continuar?')) return;

      await this.db.clear('compras');
      await this.db.clear('nomina');

      for (const c of backup.compras) await this.db.put('compras', c);
      for (const n of backup.nomina) await this.db.put('nomina', n);

      if (backup.config) {
        this.config = { ...this.config, ...backup.config };
        await this.guardarConfiguracion();
      }

      await this.cargarDatos();
      this.renderTodo();
      this.mostrarToast('Copia de seguridad restaurada al 100%', 'success');
    } catch (err) {
      console.error(err);
      this.mostrarToast('Error al leer el archivo de respaldo', 'error');
    }
  },

  imprimirInformeMensual() {
    window.print();
  },

  // ===================================================================
  // SINCRONIZACIÓN CON GITHUB (Para actualizar repo automáticamente)
  // ===================================================================
  async sincronizarConGithub(silencioso = false) {
    const user = (this.config.githubUser || '').trim();
    const repo = (this.config.githubRepo || '').trim();
    const token = (this.config.githubToken || '').trim();

    if (!user || !repo || !token) {
      if (!silencioso) {
        this.mostrarToast('Configura tu usuario, repositorio y token de GitHub en Ajustes', 'error');
      }
      return false;
    }

    try {
      if (!silencioso) this.mostrarToast('Conectando con GitHub...', 'info');

      const apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/data/gastos.json`;
      
      // 1. Obtener SHA actual si existe
      let sha = null;
      try {
        const getRes = await fetch(apiUrl, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          sha = getData.sha;
        }
      } catch (e) {
        console.warn('Archivo data/gastos.json no existía previamente, se creará.');
      }

      // 2. Preparar el payload
      const payload = {
        marca: this.config.brandName,
        propietario: this.config.ownerName,
        moneda: this.config.currency,
        ultimaActualizacion: new Date().toISOString(),
        compras: this.compras,
        nomina: this.nomina
      };

      // Codificar a Base64 respetando caracteres UTF-8
      const jsonStr = JSON.stringify(payload, null, 2);
      const utf8Bytes = new TextEncoder().encode(jsonStr);
      let binaryStr = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i]);
      }
      const base64Content = btoa(binaryStr);

      const putBody = {
        message: `Actualización contable Noirda - ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO')}`,
        content: base64Content
      };
      if (sha) putBody.sha = sha;

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const errJson = await putRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Error HTTP ${putRes.status}`);
      }

      this.mostrarToast('Datos sincronizados con GitHub correctamente', 'success');
      return true;
    } catch (err) {
      console.error('Error sincronizando con GitHub:', err);
      if (!silencioso) {
        this.mostrarToast('Error al conectar con GitHub: ' + err.message, 'error');
      }
      return false;
    }
  },

  async descargarDesdeGithub(silencioso = false) {
    const user = (this.config.githubUser || '').trim();
    const repo = (this.config.githubRepo || '').trim();
    const token = (this.config.githubToken || '').trim();

    if (!user || !repo) {
      if (!silencioso) this.mostrarToast('Configura tu usuario y repositorio de GitHub en Ajustes', 'error');
      return;
    }

    try {
      if (!silencioso) this.mostrarToast('Descargando datos desde GitHub...', 'info');
      const apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/data/gastos.json`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (token) headers['Authorization'] = `token ${token}`;

      const res = await fetch(apiUrl, { headers });
      if (!res.ok) {
        if (!silencioso) throw new Error(`No se encontró el archivo data/gastos.json en ${user}/${repo}`);
        return;
      }

      const fileData = await res.json();
      const binaryStr = atob(fileData.content.replace(/\s/g, ''));
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      const data = JSON.parse(jsonStr);

      if (!data.compras || !data.nomina) {
        if (!silencioso) throw new Error('Estructura de datos incompleta en el archivo de GitHub');
        return;
      }

      if (!silencioso) {
        if (!confirm(`Se descargaron ${data.compras.length} compras y ${data.nomina.length} pagos de nómina desde GitHub. ¿Deseas actualizar tu sistema local con estos datos?`)) return;
      }

      await this.db.clear('compras');
      await this.db.clear('nomina');

      for (const c of data.compras) await this.db.put('compras', c);
      for (const n of data.nomina) await this.db.put('nomina', n);

      await this.cargarDatos();
      this.renderTodo();
      if (!silencioso) {
        this.mostrarToast('Sistema actualizado con los datos de GitHub', 'success');
      }
    } catch (err) {
      console.error('Error al descargar de GitHub:', err);
      if (!silencioso) this.mostrarToast('Error al descargar: ' + err.message, 'error');
    }
  },

  // ===================================================================
  // HELPERS, NAVEGACIÓN Y EVENTOS
  // ===================================================================
  cambiarPestana(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.bnav-item').forEach(item => item.classList.remove('active'));

    const targetPanel = document.getElementById(`tab-${tabId}`);
    if (targetPanel) targetPanel.classList.add('active');

    const sidebarItem = document.querySelector(`.sidebar-nav [data-tab="${tabId}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    const bottomItem = document.querySelector(`.bottom-nav [data-tab="${tabId}"]`);
    if (bottomItem) bottomItem.classList.add('active');

    // Cerrar sidebar en pantallas táctiles
    document.getElementById('sidebar').classList.remove('mobile-open');

    // Redibujar gráficos si entra a dashboard
    if (tabId === 'dashboard') {
      setTimeout(() => this.renderConsolidadoMensual(), 50);
    }
  },

  cerrarModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
  },

  mostrarToast(mensaje, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    
    let icon = 'fa-circle-info';
    if (tipo === 'success') icon = 'fa-circle-check';
    if (tipo === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  },

  formatearDinero(monto) {
    const num = Number(monto) || 0;
    return '$ ' + num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },

  obtenerNombreMes(numMes) {
    const meses = {
      '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
      '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
      '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };
    return meses[numMes] || 'Mes ' + numMes;
  },

  configurarEventos() {
    // 1. Navegación por pestañas
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = el.getAttribute('data-tab');
        this.cambiarPestana(tab);
      });
    });

    // Menú móvil hamburguesa
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    menuToggle?.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });

    // 2. Selectores de Periodo Globales
    document.getElementById('filtroMesGlobal')?.addEventListener('change', (e) => {
      this.filtroMes = e.target.value;
      this.renderTodo();
    });

    document.getElementById('filtroAnioGlobal')?.addEventListener('change', (e) => {
      this.filtroAnio = parseInt(e.target.value);
      this.renderTodo();
    });

    // 3. Botones de acción rápida
    const abrirSelectorRapido = () => document.getElementById('modalSelectorRapido').classList.add('active');
    document.getElementById('btnNuevoGastoGlobal')?.addEventListener('click', abrirSelectorRapido);
    document.getElementById('btnMobileQuickAdd')?.addEventListener('click', abrirSelectorRapido);

    document.getElementById('btnRapidoCompra')?.addEventListener('click', () => {
      this.cerrarModal('modalSelectorRapido');
      this.abrirModalCompra();
    });

    document.getElementById('btnRapidoNomina')?.addEventListener('click', () => {
      this.cerrarModal('modalSelectorRapido');
      this.abrirModalNomina();
    });

    document.getElementById('btnAbrirModalCompra')?.addEventListener('click', () => this.abrirModalCompra());
    document.getElementById('btnAbrirModalNomina')?.addEventListener('click', () => this.abrirModalNomina());

    // 4. Búsquedas reactivas
    document.getElementById('searchCompras')?.addEventListener('input', () => this.renderTablaCompras());
    document.getElementById('searchNomina')?.addEventListener('input', () => this.renderTablaNomina());

    // 5. Filtros de Galería de Recibos
    document.querySelectorAll('#filtroTipoRecibo .pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#filtroTipoRecibo .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderGaleriaRecibos(pill.getAttribute('data-type'));
      });
    });

    // 6. Envíos de Formulario
    document.getElementById('formCompra')?.addEventListener('submit', (e) => this.guardarCompra(e));
    document.getElementById('formNomina')?.addEventListener('submit', (e) => this.guardarNomina(e));

    // Desglose salarial reactivo
    ['nominaSueldoBase', 'nominaBonos', 'nominaDeducciones'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.calcularNetoNomina());
    });

    // Selector de categoría personalizada en compras
    const selCatCompra = document.getElementById('compraCategoria');
    const grpCatPers = document.getElementById('grupoCategoriaPersonalizada');
    const inCatPers = document.getElementById('compraCategoriaPersonalizada');
    selCatCompra?.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        grpCatPers?.classList.remove('hidden');
        inCatPers?.focus();
      } else {
        grpCatPers?.classList.add('hidden');
      }
    });

    // 7. Cierre de modales
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetModal = btn.getAttribute('data-close');
        this.cerrarModal(targetModal);
      });
    });

    // Cerrar modal al hacer clic afuera
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    // 8. Uploads de comprobantes (Compras y Nómina)
    const dropzoneCompra = document.getElementById('dropzoneCompra');
    const inputReciboCompra = document.getElementById('compraArchivoRecibo');
    dropzoneCompra?.addEventListener('click', (e) => {
      if (e.target.closest('#btnQuitarReciboCompra')) return;
      inputReciboCompra.click();
    });
    inputReciboCompra?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'compra'));
    document.getElementById('btnQuitarReciboCompra')?.addEventListener('click', () => {
      this.reciboTempCompra = null;
      this.actualizarPreviewRecibo('compra', null);
    });

    const dropzoneNomina = document.getElementById('dropzoneNomina');
    const inputReciboNomina = document.getElementById('nominaArchivoRecibo');
    dropzoneNomina?.addEventListener('click', (e) => {
      if (e.target.closest('#btnQuitarReciboNomina')) return;
      inputReciboNomina.click();
    });
    inputReciboNomina?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'nomina'));
    document.getElementById('btnQuitarReciboNomina')?.addEventListener('click', () => {
      this.reciboTempNomina = null;
      this.actualizarPreviewRecibo('nomina', null);
    });

    // 9. Personalización y Logo de Noirda
    const inputLogo = document.getElementById('inputLogoUpload');
    inputLogo?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.config.logoData = ev.target.result;
          this.guardarConfiguracion();
          this.mostrarToast('Logotipo de Noirda actualizado', 'success');
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('btnRestablecerLogo')?.addEventListener('click', () => {
      this.config.logoData = null;
      this.guardarConfiguracion();
      this.mostrarToast('Logotipo restablecido al isotipo oficial', 'info');
    });

    document.getElementById('btnGuardarAjustesMarca')?.addEventListener('click', () => {
      this.config.brandName = document.getElementById('inputBrandName').value.trim() || 'NOIRDA';
      this.config.ownerName = document.getElementById('inputOwnerName').value.trim() || 'Santiago Varelas';
      this.config.currency = document.getElementById('inputMoneda').value;
      this.guardarConfiguracion();
      this.renderTodo();
      this.mostrarToast('Identidad de marca guardada', 'success');
    });

    // Toggles de interfaz
    document.getElementById('toggleKpiTotal')?.addEventListener('change', (e) => {
      this.config.showKpiTotal = e.target.checked;
      this.guardarConfiguracion();
    });
    document.getElementById('toggleKpiCompras')?.addEventListener('change', (e) => {
      this.config.showKpiCompras = e.target.checked;
      this.guardarConfiguracion();
    });
    document.getElementById('toggleKpiNomina')?.addEventListener('change', (e) => {
      this.config.showKpiNomina = e.target.checked;
      this.guardarConfiguracion();
    });
    document.getElementById('toggleKpiRecibos')?.addEventListener('change', (e) => {
      this.config.showKpiRecibos = e.target.checked;
      this.guardarConfiguracion();
    });
    document.getElementById('toggleGraficos')?.addEventListener('change', (e) => {
      this.config.showCharts = e.target.checked;
      this.guardarConfiguracion();
      if (this.config.showCharts) setTimeout(() => this.renderConsolidadoMensual(), 50);
    });
    document.getElementById('toggleTemaOscuro')?.addEventListener('change', (e) => {
      this.config.darkTheme = e.target.checked;
      this.guardarConfiguracion();
    });

    // 10. Ajustes de GitHub Sync
    document.getElementById('btnGuardarAjustesGithub')?.addEventListener('click', async () => {
      this.config.githubUser = document.getElementById('inputGithubUser').value.trim();
      this.config.githubRepo = document.getElementById('inputGithubRepo').value.trim() || 'NOIRDA';
      this.config.githubToken = document.getElementById('inputGithubToken').value.trim();
      this.config.githubAutoSync = document.getElementById('toggleGithubAutoSync').checked;
      await this.guardarConfiguracion();
      await this.sincronizarConGithub(false);
    });

    document.getElementById('toggleGithubAutoSync')?.addEventListener('change', (e) => {
      this.config.githubAutoSync = e.target.checked;
      this.guardarConfiguracion();
    });

    document.getElementById('btnDescargarDeGithub')?.addEventListener('click', () => this.descargarDesdeGithub());

    document.getElementById('btnCopiarEnlaceCompartir')?.addEventListener('click', () => {
      const token = (this.config.githubToken || '').trim();
      if (!token) {
        this.mostrarToast('Primero ingresa tu token de GitHub y guárdalo', 'error');
        return;
      }
      const enlace = `https://shenao356.github.io/noirda/#token=${token}`;
      navigator.clipboard.writeText(enlace).then(() => {
        this.mostrarToast('¡Enlace de sincronización copiado al portapapeles!', 'success');
      }).catch(() => {
        prompt('Copia este enlace para abrir en tu celular o tablet:', enlace);
      });
    });

    // 11. Respaldos y Exportación
    document.getElementById('btnExportarExcelPeriodo')?.addEventListener('click', () => this.exportarExcel(true));
    document.getElementById('btnExportarTodoExcel')?.addEventListener('click', () => this.exportarExcel(false));
    document.getElementById('btnPrintReporteMensual')?.addEventListener('click', () => this.imprimirInformeMensual());
    document.getElementById('btnImprimirRecibo')?.addEventListener('click', () => window.print());
    document.getElementById('btnQuickBackup')?.addEventListener('click', () => this.descargarCopiaCompleta());
    document.getElementById('btnDescargarCopiaCompleta')?.addEventListener('click', () => this.descargarCopiaCompleta());

    const inputRestaurar = document.getElementById('inputRestaurarCopia');
    inputRestaurar?.addEventListener('change', (e) => this.restaurarCopiaCompleta(e.target.files[0]));

    document.getElementById('btnBorrarDatosPrueba')?.addEventListener('click', async () => {
      if (confirm('¿Deseas vaciar todos los registros para iniciar con tu contabilidad desde cero?')) {
        await this.db.clear('compras');
        await this.db.clear('nomina');
        await this.cargarDatos();
        this.renderTodo();
        this.mostrarToast('Se han limpiado los datos de prueba', 'info');
      }
    });
  }
};

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
