/**
 * NOIRDA Opulence - Atelier & Fashion Store
 * Control de Gastos, Compras de Mercancía, Nómina y Directorio de Personal
 * Diseñado exclusivamente para Liam Varelas (Cel: 3045345642)
 * Arquitectura 100% Responsiva con IndexedDB y Soporte Multi-Dispositivo
 */

// ===================================================================
// BASE DE DATOS LOCAL CON INDEXEDDB (Alta capacidad para fotos y recibos)
// ===================================================================
class NoirdaDB {
  constructor() {
    this.dbName = 'NoirdaExpensesDB';
    this.version = 3;
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
        if (!db.objectStoreNames.contains('gastosLocal')) {
          const localStore = db.createObjectStore('gastosLocal', { keyPath: 'id', autoIncrement: true });
          localStore.createIndex('fecha', 'fecha', { unique: false });
          localStore.createIndex('periodo', ['anio', 'mes'], { unique: false });
        }
        if (!db.objectStoreNames.contains('nomina')) {
          const nominaStore = db.createObjectStore('nomina', { keyPath: 'id', autoIncrement: true });
          nominaStore.createIndex('fecha', 'fecha', { unique: false });
          nominaStore.createIndex('periodo', ['anio', 'mes'], { unique: false });
        }
        if (!db.objectStoreNames.contains('empleados')) {
          const empleadosStore = db.createObjectStore('empleados', { keyPath: 'id', autoIncrement: true });
          empleadosStore.createIndex('nombre', 'nombre', { unique: false });
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
  gastosLocal: [],
  nomina: [],
  empleados: [],
  comprasFiltradasActuales: [],
  localFiltradosActuales: [],
  grupoLocalActivo: 'todos',
  config: {
    brandName: 'NOIRDA Opulence',
    ownerName: 'Liam Varelas',
    ownerPhone: '3045345642',
    currency: 'COP',
    logoData: null,
    showKpiTotal: true,
    showKpiCompras: true,
    showKpiLocal: true,
    showKpiNomina: true,
    showKpiRecibos: true,
    showCharts: true,
    darkTheme: true,
    customCategories: [],
    customLocalCategories: [],
    githubUser: 'shenao356',
    githubRepo: 'noirda',
    githubToken: '',
    githubAutoSync: true
  },
  filtroMes: 'todos',
  filtroAnio: new Date().getFullYear(),
  chartEvolucion: null,
  chartCategorias: null,
  reciboTempCompra: null,
  reciboTempLocal: null,
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
      try {
        const cleanUrl = window.location.origin + window.location.pathname;
        if (cleanUrl.startsWith('http')) {
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch (err) {
        console.warn('URL clean info:', err);
      }
      this.mostrarToast('¡Dispositivo conectado exitosamente a la nube de Noirda!', 'success');
    }

    await this.cargarDatos();

    // 2. ACTIVAR INTERFAZ Y EVENTOS DE INMEDIATO (Cero bloqueos)
    this.iniciarPeriodosSelector();
    this.aplicarConfiguracionVisual();
    this.iniciarPantallaBienvenida();
    this.configurarEventos();
    this.renderTodo();

    // 3. Sincronización en segundo plano con GitHub (sin congelar la pantalla de bienvenida)
    if (this.config.githubAutoSync && this.config.githubToken) {
      this.descargarDesdeGithub(true).catch(e => console.warn('Sync background check:', e));
    } else if (this.compras.length === 0 && this.nomina.length === 0) {
      this.sembrarDatosIniciales().then(() => {
        this.cargarDatos().then(() => this.renderTodo());
      });
    }
  },

  // Cargar configuración guardada (Persistencia dual: localStorage + IndexedDB)
  async cargarConfiguracion() {
    try {
      const localStr = localStorage.getItem('noirda_config_v2');
      if (localStr) {
        this.config = { ...this.config, ...JSON.parse(localStr) };
      }
    } catch (e) {
      console.warn('No se pudo leer de localStorage:', e);
    }

    try {
      const stored = await this.db.get('config', 'appConfig');
      if (stored && stored.value) {
        this.config = { ...this.config, ...stored.value };
      }
    } catch (e) {
      console.warn('Usando configuración por defecto');
    }

    // Regla fija e inmutable: La tienda pertenece a Liam Varelas y su marca es NOIRDA Opulence
    this.config.brandName = 'NOIRDA Opulence';
    this.config.ownerName = 'Liam Varelas';
    this.config.ownerPhone = '3045345642';
  },

  async guardarConfiguracion() {
    // Proteger identidad oficial
    this.config.brandName = 'NOIRDA Opulence';
    this.config.ownerName = 'Liam Varelas';
    this.config.ownerPhone = '3045345642';

    try {
      localStorage.setItem('noirda_config_v2', JSON.stringify(this.config));
    } catch (e) {
      console.warn('Error al guardar en localStorage:', e);
    }
    await this.db.put('config', { key: 'appConfig', value: this.config });
    this.aplicarConfiguracionVisual();
  },

  // Cargar registros de compras, gastos del local, nómina y empleados
  async cargarDatos() {
    this.compras = (await this.db.getAll('compras')).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    this.gastosLocal = (await this.db.getAll('gastosLocal')).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    this.nomina = (await this.db.getAll('nomina')).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    this.empleados = (await this.db.getAll('empleados')) || [];

    // Sembrar directorio oficial de empleados si está vacío
    if (this.empleados.length === 0) {
      const empleadosBase = [
        { id: 1, nombre: 'Liam Varelas', cargo: 'Director Creativo & Propietario', documento: '1037648921', telefono: '3045345642', email: 'liamvarelas@gmail.com', tipoPago: 'mensual', tarifa: 10000000, notas: 'Gestión y dirección general' },
        { id: 2, nombre: 'Kim Zuluaga', cargo: 'Costurero / Modista', documento: '1028394857', telefono: '3124567890', email: 'kimzuluaga@gmail.com', tipoPago: 'quincenal', tarifa: 500000, notas: 'Confección y costura' },
        { id: 3, nombre: 'Luna Gil', cargo: 'Vendedor / Atención Almacén', documento: '1019283746', telefono: '3156789012', email: 'lunagil@gmail.com', tipoPago: 'horas', tarifa: 15000, notas: 'Ventas y styling' },
        { id: 4, nombre: 'Carlos Gómez', cargo: 'Logística & Bodega de Ropa', documento: '1048291039', telefono: '3001234567', email: 'carlos@noirda.com', tipoPago: 'dias', tarifa: 55000, notas: 'Recepción y percheros' }
      ];
      for (const emp of empleadosBase) {
        await this.db.put('empleados', emp);
      }
      this.empleados = empleadosBase;
    }
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
      <text x="300" y="195" font-family="sans-serif" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="4">NOIRDA OPULENCE</text>
      <text x="300" y="225" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">Liam Varelas | Propietario (3045345642)</text>
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
    // 1. Nombres (Desktop y Móvil)
    const dispBrand = document.getElementById('displayBrandName');
    const dispOwner = document.getElementById('displayOwnerName');
    const dispMobBrand = document.getElementById('displayMobileBrandName');
    const dispMobOwner = document.getElementById('displayMobileOwnerName');
    const inputBrand = document.getElementById('inputBrandName');
    const inputOwner = document.getElementById('inputOwnerName');
    const inputMoneda = document.getElementById('inputMoneda');

    if (dispBrand) dispBrand.textContent = this.config.brandName;
    if (dispOwner) dispOwner.textContent = this.config.ownerName;
    if (dispMobBrand) dispMobBrand.textContent = this.config.brandName;
    if (dispMobOwner) dispMobOwner.textContent = this.config.ownerName;
    if (inputBrand) inputBrand.value = this.config.brandName;
    if (inputOwner) inputOwner.value = this.config.ownerName;
    if (inputMoneda) inputMoneda.value = this.config.currency;

    // 2. Logo (Desktop, Móvil, Comprobantes y Vista Previa en Ajustes)
    const sidebarCircle = document.getElementById('sidebarLogoCircle');
    const sidebarImg = document.getElementById('sidebarLogoImg');
    const mobileCircle = document.getElementById('mobileLogoCircle');
    const mobileImg = document.getElementById('mobileLogoImg');
    const settingsPreview = document.getElementById('settingsLogoPreview');
    const voucherLogoImg = document.getElementById('voucherLogoImg');

    const logoSrc = this.config.logoData || 'logo.jpg';

    if (logoSrc) {
      if (sidebarImg) {
        sidebarImg.src = logoSrc;
        sidebarImg.classList.remove('hidden');
      }
      if (sidebarCircle) sidebarCircle.classList.add('hidden');

      if (mobileImg) {
        mobileImg.src = logoSrc;
        mobileImg.classList.remove('hidden');
      }
      if (mobileCircle) mobileCircle.classList.add('hidden');

      if (voucherLogoImg) {
        voucherLogoImg.src = logoSrc;
      }

      if (settingsPreview) {
        settingsPreview.innerHTML = `<img src="${logoSrc}" class="brand-logo-img" style="width:100%; height:100%; object-fit:contain;" alt="Logo Noirda">`;
      }
    } else {
      if (sidebarImg) sidebarImg.classList.add('hidden');
      if (sidebarCircle) sidebarCircle.classList.remove('hidden');

      if (mobileImg) mobileImg.classList.add('hidden');
      if (mobileCircle) mobileCircle.classList.remove('hidden');

      if (settingsPreview) {
        settingsPreview.innerHTML = `<div class="brand-logo-circle large"><span>N</span></div>`;
      }
    }

    // 3. Toggles de Interfaz
    const kpiTotal = document.getElementById('kpiCardTotal');
    const kpiCompras = document.getElementById('kpiCardCompras');
    const kpiLocal = document.getElementById('kpiCardLocal');
    const kpiNomina = document.getElementById('kpiCardNomina');
    const kpiRecibos = document.getElementById('kpiCardRecibos');
    const graficosContainer = document.querySelector('.dashboard-analytics-grid');

    if (kpiTotal) kpiTotal.style.display = this.config.showKpiTotal ? 'flex' : 'none';
    if (kpiCompras) kpiCompras.style.display = this.config.showKpiCompras ? 'flex' : 'none';
    if (kpiLocal) kpiLocal.style.display = (this.config.showKpiLocal !== false) ? 'flex' : 'none';
    if (kpiNomina) kpiNomina.style.display = this.config.showKpiNomina ? 'flex' : 'none';
    if (kpiRecibos) kpiRecibos.style.display = this.config.showKpiRecibos ? 'flex' : 'none';
    if (graficosContainer) graficosContainer.style.display = this.config.showCharts ? 'grid' : 'none';

    // Sincronizar checkboxes de ajustes
    const tTotal = document.getElementById('toggleKpiTotal'); if (tTotal) tTotal.checked = this.config.showKpiTotal;
    const tComp = document.getElementById('toggleKpiCompras'); if (tComp) tComp.checked = this.config.showKpiCompras;
    const tLoc = document.getElementById('toggleKpiLocal'); if (tLoc) tLoc.checked = (this.config.showKpiLocal !== false);
    const tNom = document.getElementById('toggleKpiNomina'); if (tNom) tNom.checked = this.config.showKpiNomina;
    const tRec = document.getElementById('toggleKpiRecibos'); if (tRec) tRec.checked = this.config.showKpiRecibos;
    const tGraf = document.getElementById('toggleGraficos'); if (tGraf) tGraf.checked = this.config.showCharts;
    const tTema = document.getElementById('toggleTemaOscuro'); if (tTema) tTema.checked = this.config.darkTheme;

    // 4. Modo Oscuro vs Modo Claro
    const esOscuro = this.config.darkTheme !== false;
    if (esOscuro) {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-noir');
    } else {
      document.body.classList.remove('theme-noir');
      document.body.classList.add('theme-light');
    }

    const iconModo = document.getElementById('iconQuickModo');
    const textModo = document.getElementById('textQuickModo');
    if (iconModo) iconModo.className = esOscuro ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    if (textModo) textModo.textContent = esOscuro ? 'Modo Claro' : 'Modo Oscuro';

    const btnModoOscuro = document.getElementById('btnModoOscuroCard');
    const btnModoClaro = document.getElementById('btnModoClaroCard');
    if (btnModoOscuro) btnModoOscuro.classList.toggle('active', esOscuro);
    if (btnModoClaro) btnModoClaro.classList.toggle('active', !esOscuro);

    // 5. Aplicar Tema de Color (Oro, Esmeralda, Rosa, Zafiro, Amatista, Ámbar, Rubí, Personalizado)
    this.aplicarTemaColor(this.config.themeColor || 'gold', this.config.customThemeHex);

    // 6. Categorías personalizadas en selectores de compras y gastos del local
    this.actualizarOpcionesCategorias();
    this.actualizarOpcionesCategoriasLocal();

    // 7. Campos de Sincronización GitHub
    const inGitUser = document.getElementById('inputGithubUser');
    const inGitRepo = document.getElementById('inputGithubRepo');
    const inGitToken = document.getElementById('inputGithubToken');
    const togGitAuto = document.getElementById('toggleGithubAutoSync');

    const welcomeImg = document.getElementById('welcomeLogoImg');
    if (welcomeImg && logoSrc) welcomeImg.src = logoSrc;

    if (inGitUser) inGitUser.value = this.config.githubUser || '';
    if (inGitRepo) inGitRepo.value = this.config.githubRepo || 'NOIRDA';
    if (inGitToken) inGitToken.value = this.config.githubToken || '';
    if (togGitAuto) togGitAuto.checked = !!this.config.githubAutoSync;
  },

  // ===================================================================
  // GESTIÓN DE TEMAS VISUALES Y MODO CLARO / OSCURO
  // ===================================================================
  alternarModoClaroOscuro() {
    this.establecerModoOscuro(!this.config.darkTheme);
  },

  establecerModoOscuro(esOscuro) {
    this.config.darkTheme = esOscuro;
    this.guardarConfiguracion();
    this.aplicarConfiguracionVisual();
    this.mostrarToast(esOscuro ? 'Modo Oscuro "Noir Luxury" activado' : 'Modo Claro "Marfil Ejecutivo" activado', 'info');
  },

  cambiarTemaColor(tema, customHex = null) {
    this.config.themeColor = tema;
    if (customHex) this.config.customThemeHex = customHex;
    this.guardarConfiguracion();
    this.aplicarTemaColor(tema, customHex || this.config.customThemeHex);
    this.mostrarToast('Tema de color de la página actualizado', 'success');
  },

  aplicarTemaColor(tema = 'gold', customHex = null) {
    const root = document.documentElement;
    const palettes = {
      gold: { primary: '#d4af37', light: '#f5e6b3', dark: '#9e7d23', glow: 'rgba(212, 175, 55, 0.25)', border: 'rgba(212, 175, 55, 0.35)' },
      emerald: { primary: '#10b981', light: '#a7f3d0', dark: '#047857', glow: 'rgba(16, 185, 129, 0.25)', border: 'rgba(16, 185, 129, 0.35)' },
      rose: { primary: '#ec4899', light: '#fbcfe8', dark: '#be185d', glow: 'rgba(236, 72, 153, 0.25)', border: 'rgba(236, 72, 153, 0.35)' },
      sapphire: { primary: '#3b82f6', light: '#bfdbfe', dark: '#1d4ed8', glow: 'rgba(59, 130, 246, 0.25)', border: 'rgba(59, 130, 246, 0.35)' },
      amethyst: { primary: '#a855f7', light: '#e9d5ff', dark: '#7e22ce', glow: 'rgba(168, 85, 247, 0.25)', border: 'rgba(168, 85, 247, 0.35)' },
      amber: { primary: '#f59e0b', light: '#fef3c7', dark: '#b45309', glow: 'rgba(245, 158, 11, 0.25)', border: 'rgba(245, 158, 11, 0.35)' },
      crimson: { primary: '#ef4444', light: '#fecaca', dark: '#b91c1c', glow: 'rgba(239, 68, 68, 0.25)', border: 'rgba(239, 68, 68, 0.35)' }
    };

    let pal;
    if (tema === 'custom' && customHex) {
      pal = {
        primary: customHex,
        light: customHex,
        dark: customHex,
        glow: customHex + '40',
        border: customHex + '66'
      };
    } else {
      pal = palettes[tema] || palettes.gold;
    }

    root.style.setProperty('--gold-primary', pal.primary);
    root.style.setProperty('--gold-light', pal.light);
    root.style.setProperty('--gold-dark', pal.dark);
    root.style.setProperty('--gold-glow', pal.glow);
    root.style.setProperty('--border-light', pal.border);
    root.style.setProperty('--shadow-gold', `0 0 20px ${pal.glow}`);

    // Actualizar gradiente de marca
    root.style.setProperty('--brand-gradient', `linear-gradient(135deg, var(--emerald-primary) 0%, ${pal.primary} 100%)`);
    root.style.setProperty('--brand-gradient-hover', `linear-gradient(135deg, var(--emerald-light) 0%, ${pal.light} 100%)`);

    // Sincronizar botones de paleta en Topbar
    document.querySelectorAll('.theme-dot-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme-color') === tema);
    });

    // Sincronizar tarjetas en Ajustes
    document.querySelectorAll('.color-theme-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-theme-color') === tema);
    });

    const topPicker = document.getElementById('topbarCustomColorInput');
    const setPicker = document.getElementById('inputCustomThemeColor');
    if (topPicker && customHex) topPicker.value = customHex;
    if (setPicker && customHex) setPicker.value = customHex;
    if (tema === 'custom' && customHex) {
      const preview = document.getElementById('customThemeSwatchPreview');
      if (preview) preview.style.background = customHex;
    }
  },

  iniciarPantallaBienvenida() {
    const welcome = document.getElementById('welcomeScreen');
    if (!welcome) return;

    const omitir = localStorage.getItem('noirda_omitir_bienvenida') === 'true';
    if (omitir) {
      welcome.classList.add('fade-out');
      welcome.classList.add('hidden');
      welcome.style.display = 'none';
      welcome.style.pointerEvents = 'none';
    } else {
      welcome.classList.remove('fade-out');
      welcome.classList.remove('hidden');
      welcome.style.display = 'flex';
      welcome.style.pointerEvents = 'all';
    }
  },

  cerrarBienvenida() {
    const welcome = document.getElementById('welcomeScreen');
    const chkOmitir = document.getElementById('chkNoMostrarBienvenida');
    if (chkOmitir && chkOmitir.checked) {
      localStorage.setItem('noirda_omitir_bienvenida', 'true');
    }
    if (welcome) {
      welcome.classList.add('fade-out');
      welcome.style.opacity = '0';
      welcome.style.pointerEvents = 'none';
      setTimeout(() => {
        welcome.classList.add('hidden');
        welcome.style.display = 'none';
      }, 250);
    }
  },

  abrirBienvenida() {
    const welcome = document.getElementById('welcomeScreen');
    if (welcome) {
      welcome.classList.remove('fade-out');
      welcome.classList.remove('hidden');
      welcome.style.display = 'flex';
      welcome.style.opacity = '1';
      welcome.style.pointerEvents = 'all';
    }
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

  actualizarOpcionesCategoriasLocal() {
    const selCat = document.getElementById('localCategoria');
    const selFiltro = document.getElementById('filtroCategoriaLocal');

    const baseLocalCategorias = [
      'Servicios Públicos',
      'Arriendo',
      'Adecuaciones de Espacios',
      'Bolsas e Insumos de Aseo',
      'Papelería de Prendas',
      'Etiquetas',
      'Códigos de Barras',
      'Rollos Térmicos',
      'Cuerdas',
      'Recibos de Caja',
      'Papelería General (Lapiceros, Hojas, Blocks)',
      'Publicidad y Litografía',
      'Pago de Modelos',
      'Pautas Publicitarias',
      'Otros Gastos del Local'
    ];

    const customs = this.config.customLocalCategories || [];
    const setCombinado = new Set([...baseLocalCategorias, ...customs]);

    const opcionesHtml = Array.from(setCombinado)
      .map(c => `<option value="${c}">${c}</option>`)
      .join('');

    if (selCat) {
      selCat.innerHTML = opcionesHtml + `<option value="__custom__">➕ Otra categoría del local...</option>`;
    }
    if (selFiltro) {
      const currentVal = selFiltro.value;
      selFiltro.innerHTML = `<option value="todas">Todas las categorías del local</option>` + opcionesHtml;
      if (setCombinado.has(currentVal) || currentVal === 'todas') {
        selFiltro.value = currentVal;
      }
    }
  },

  // ===================================================================
  // RENDERIZADO GLOBAL Y CONSOLIDADO MENSUAL
  // ===================================================================
  renderTodo() {
    this.renderConsolidadoMensual();
    this.renderTablaCompras();
    this.renderTablaLocal();
    this.renderTablaNomina();
    this.renderEmpleados();
    this.renderGaleriaRecibos();
    this.renderBadges();
  },

  renderBadges() {
    const bC = document.getElementById('badgeCompras'); if (bC) bC.textContent = this.compras.length;
    const bL = document.getElementById('badgeLocal'); if (bL) bL.textContent = this.gastosLocal.length;
    const bN = document.getElementById('badgeNomina'); if (bN) bN.textContent = this.nomina.length;
    const bE = document.getElementById('badgeEmpleados'); if (bE) bE.textContent = this.empleados.length;
  },

  // Filtrado de elementos por Mes y Año
  filtrarPorPeriodo(elementos) {
    return (elementos || []).filter(item => {
      const matchAnio = parseInt(item.anio) === parseInt(this.filtroAnio);
      if (!matchAnio) return false;
      if (this.filtroMes === 'todos') return true;
      return item.mes === this.filtroMes;
    });
  },

  renderConsolidadoMensual() {
    const comprasFiltradas = this.filtrarPorPeriodo(this.compras);
    const localFiltrados = this.filtrarPorPeriodo(this.gastosLocal);
    const nominaFiltrada = this.filtrarPorPeriodo(this.nomina);

    const totalCompras = comprasFiltradas.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const totalLocal = localFiltrados.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const totalNomina = nominaFiltrada.reduce((sum, item) => sum + Number(item.neto || 0), 0);
    const totalConsolidado = totalCompras + totalLocal + totalNomina;

    const recibosCompras = comprasFiltradas.filter(c => c.reciboData).length;
    const recibosLocal = localFiltrados.filter(l => l.reciboData).length;
    const recibosNomina = nominaFiltrada.filter(n => n.reciboData).length;
    const totalRecibos = recibosCompras + recibosLocal + recibosNomina;

    // Formatear cantidades
    document.getElementById('kpiTotalConsolidado').textContent = this.formatearDinero(totalConsolidado);
    document.getElementById('kpiTotalCompras').textContent = this.formatearDinero(totalCompras);
    const kpiLocEl = document.getElementById('kpiTotalLocal');
    if (kpiLocEl) kpiLocEl.textContent = this.formatearDinero(totalLocal);
    document.getElementById('kpiTotalNomina').textContent = this.formatearDinero(totalNomina);
    document.getElementById('kpiTotalRecibos').textContent = totalRecibos;

    // Conteos y porcentajes
    const totalRegistros = comprasFiltradas.length + localFiltrados.length + nominaFiltrada.length;
    document.getElementById('kpiCountTotal').textContent = `${totalRegistros} movimientos`;
    document.getElementById('kpiCountCompras').textContent = `${comprasFiltradas.length} compras`;
    const kpiCntLoc = document.getElementById('kpiCountLocal');
    if (kpiCntLoc) kpiCntLoc.textContent = `${localFiltrados.length} gastos`;
    document.getElementById('kpiCountNomina').textContent = `${nominaFiltrada.length} pagos`;

    const pctCompras = totalConsolidado > 0 ? Math.round((totalCompras / totalConsolidado) * 100) : 0;
    const pctLocal = totalConsolidado > 0 ? Math.round((totalLocal / totalConsolidado) * 100) : 0;
    const pctNomina = totalConsolidado > 0 ? Math.round((totalNomina / totalConsolidado) * 100) : 0;
    document.getElementById('kpiPercentCompras').textContent = `${pctCompras}% del gasto mensual`;
    const kpiPctLoc = document.getElementById('kpiPercentLocal');
    if (kpiPctLoc) kpiPctLoc.textContent = `${pctLocal}% del gasto mensual`;
    document.getElementById('kpiPercentNomina').textContent = `${pctNomina}% del gasto mensual`;

    // Texto descriptivo del periodo
    const mesNombre = this.filtroMes === 'todos' ? 'Año Completo' : this.obtenerNombreMes(this.filtroMes);
    document.getElementById('kpiPeriodoTexto').textContent = `${mesNombre} ${this.filtroAnio}`;

    // Render de últimos registros combinados
    this.renderUltimosRegistros(comprasFiltradas, nominaFiltrada, localFiltrados);

    // Gráficos de Chart.js
    this.renderGraficos(comprasFiltradas, nominaFiltrada, totalCompras, totalNomina, localFiltrados, totalLocal);
  },

  renderUltimosRegistros(compras, nomina, gastosLocal = []) {
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
      ...gastosLocal.map(l => ({
        id: l.id,
        tipo: 'local',
        tipoLabel: 'Gasto Local',
        tipoBadge: 'amber',
        fecha: l.fecha,
        concepto: l.proveedor + ' - ' + l.descripcion,
        categoria: l.categoria,
        metodo: l.metodoPago,
        monto: l.monto,
        reciboData: l.reciboData,
        reciboNombre: l.reciboNombre,
        reciboTipo: l.reciboTipo,
        notas: l.notas
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
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">No hay registros en el periodo seleccionado. Usa el botón flotante (+) para agregar.</td></tr>`;
      return;
    }

    tbody.innerHTML = movimientos.slice(0, 12).map(m => {
      const isPdf = m.reciboTipo && m.reciboTipo.includes('pdf');
      return `
      <tr class="collapsible-record-row" onclick="App.toggleRecordRow(event, this)">
        <td class="primary-col col-date" data-label="Fecha"><span class="table-cell-val" style="font-weight:600;">${m.fecha}</span></td>
        <td class="primary-col col-badge" data-label="Tipo"><span class="table-cell-val"><span class="badge-tag ${m.tipoBadge}">${m.tipoLabel}</span></span></td>
        <td class="primary-col col-title" data-label="Concepto"><span class="table-cell-val" title="${m.concepto}">${m.concepto}</span></td>
        <td class="detail-col" data-label="Categoría"><span class="table-cell-val"><span class="badge-tag neutral">${m.categoria}</span></span></td>
        <td class="detail-col" data-label="Método Pago"><span class="table-cell-val">${m.metodo || 'Efectivo'}</span></td>
        <td class="primary-col col-amount" data-label="Monto Pagado"><span class="table-cell-val" style="font-weight:700; color:var(--gold-light);">${this.formatearDinero(m.monto)} <i class="fa-solid fa-chevron-down mobile-row-chevron"></i></span></td>
        <td class="detail-col" data-label="Comprobante">
          <span class="table-cell-val">
            ${m.reciboData ? `
              <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('${m.tipo}', ${m.id})">
                <i class="fa-solid ${isPdf ? 'fa-file-pdf text-emerald' : 'fa-file-invoice'}"></i> ${isPdf ? 'Ver PDF' : 'Ver Recibo'}
              </button>
            ` : `<span class="receipt-none">Sin recibo</span>`}
          </span>
        </td>
        <td class="detail-col" data-label="Acciones">
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
    `}).join('');
  },

  // ===================================================================
  // CHARTS & ANALÍTICA CON CHART.JS
  // ===================================================================
  renderGraficos(comprasPeriodo, nominaPeriodo, totalCompras, totalNomina, localPeriodo = [], totalLocal = 0) {
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

      const dataLocal = ultimosMeses.map(m => {
        return (this.gastosLocal || [])
          .filter(l => parseInt(l.anio) === parseInt(anio) && l.mes === m.cod)
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
              label: 'Gastos del Local',
              data: dataLocal,
              backgroundColor: '#f59e0b',
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

      (localPeriodo || []).forEach(l => {
        const cat = 'Local: ' + (l.categoria || 'Operación');
        categoriasMap[cat] = (categoriasMap[cat] || 0) + Number(l.monto || 0);
      });

      if (totalNomina > 0) {
        categoriasMap['Nómina y Salarios'] = totalNomina;
      }

      const labels = Object.keys(categoriasMap);
      const values = Object.values(categoriasMap);

      if (this.chartCategorias) {
        this.chartCategorias.destroy();
      }

      const colors = ['#d4af37', '#3b82f6', '#f59e0b', '#a855f7', '#10b981', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4'];

      this.chartCategorias = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: labels.length > 0 ? labels : ['Sin datos'],
          datasets: [{
            data: values.length > 0 ? values : [1],
            backgroundColor: values.length > 0 ? labels.map((_, idx) => colors[idx % colors.length]) : ['#2a3242'],
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
  // TABLA DE COMPRAS DE MERCANCÍA & FILTROS AVANZADOS
  // ===================================================================
  actualizarSelectProveedores() {
    const select = document.getElementById('filtroProveedorCompra');
    if (!select) return;

    const currentVal = select.value;
    const proveedores = Array.from(new Set(this.compras.map(c => c.proveedor).filter(Boolean))).sort();

    select.innerHTML = `<option value="todos">Todos los distribuidores</option>` +
      proveedores.map(p => `<option value="${p}">${p}</option>`).join('');

    if (proveedores.includes(currentVal)) {
      select.value = currentVal;
    }
  },

  limpiarFiltrosCompras() {
    const s = document.getElementById('searchCompras');
    const c = document.getElementById('filtroCategoriaCompra');
    const p = document.getElementById('filtroProveedorCompra');
    const d = document.getElementById('filtroFechaDesdeCompra');
    const h = document.getElementById('filtroFechaHastaCompra');
    const m = document.getElementById('filtroMetodoPagoCompra');

    if (s) s.value = '';
    if (c) c.value = 'todas';
    if (p) p.value = 'todos';
    if (d) d.value = '';
    if (h) h.value = '';
    if (m) m.value = 'todos';

    this.renderTablaCompras();
  },

  renderTablaCompras() {
    const tbody = document.getElementById('tbodyCompras');
    if (!tbody) return;

    this.actualizarSelectProveedores();

    let items = this.filtrarPorPeriodo(this.compras);
    
    // Filtros avanzados
    const searchVal = document.getElementById('searchCompras')?.value.toLowerCase().trim();
    const catVal = document.getElementById('filtroCategoriaCompra')?.value;
    const provVal = document.getElementById('filtroProveedorCompra')?.value;
    const desdeVal = document.getElementById('filtroFechaDesdeCompra')?.value;
    const hastaVal = document.getElementById('filtroFechaHastaCompra')?.value;
    const metodoVal = document.getElementById('filtroMetodoPagoCompra')?.value;

    if (searchVal) {
      items = items.filter(c =>
        (c.proveedor && c.proveedor.toLowerCase().includes(searchVal)) ||
        (c.numeroFactura && c.numeroFactura.toLowerCase().includes(searchVal)) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(searchVal)) ||
        (c.categoria && c.categoria.toLowerCase().includes(searchVal))
      );
    }

    if (catVal && catVal !== 'todas') {
      items = items.filter(c => c.categoria === catVal);
    }

    if (provVal && provVal !== 'todos') {
      items = items.filter(c => c.proveedor === provVal);
    }

    if (desdeVal) {
      items = items.filter(c => c.fecha >= desdeVal);
    }

    if (hastaVal) {
      items = items.filter(c => c.fecha <= hastaVal);
    }

    if (metodoVal && metodoVal !== 'todos') {
      items = items.filter(c => c.metodoPago === metodoVal);
    }

    this.comprasFiltradasActuales = items;

    const total = items.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    const sumEl = document.getElementById('sumatoriaComprasFiltradas');
    const cntEl = document.getElementById('conteoComprasFiltradas');
    if (sumEl) sumEl.textContent = this.formatearDinero(total);
    if (cntEl) cntEl.textContent = `(${items.length} compras)`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">No se encontraron compras con los filtros seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(c => {
      const isPdf = c.reciboTipo && c.reciboTipo.includes('pdf');
      return `
      <tr class="collapsible-record-row" onclick="App.toggleRecordRow(event, this)">
        <td class="primary-col col-date" data-label="Fecha"><span class="table-cell-val" style="font-weight:600;">${c.fecha}</span></td>
        <td class="primary-col col-title" data-label="Proveedor"><span class="table-cell-val" style="font-weight:600; color:var(--text-main);">${c.proveedor}</span></td>
        <td class="detail-col" data-label="Prendas / Lote"><span class="table-cell-val" title="${c.descripcion}">${c.descripcion}</span></td>
        <td class="primary-col col-badge" data-label="Categoría"><span class="table-cell-val"><span class="badge-tag emerald">${c.categoria}</span></span></td>
        <td class="detail-col" data-label="Método Pago"><span class="table-cell-val">${c.metodoPago || 'Efectivo'}</span></td>
        <td class="primary-col col-amount" data-label="Monto Pagado"><span class="table-cell-val" style="font-weight:700; color:var(--gold-light);">${this.formatearDinero(c.monto)} <i class="fa-solid fa-chevron-down mobile-row-chevron"></i></span></td>
        <td class="detail-col" data-label="Comprobante">
          <span class="table-cell-val">
            ${c.reciboData ? `
              <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('compra', ${c.id})">
                <i class="fa-solid ${isPdf ? 'fa-file-pdf text-emerald' : 'fa-paperclip'}"></i> ${isPdf ? 'Ver PDF' : 'Ver Soporte'}
              </button>
            ` : `<span class="receipt-none">Sin soporte</span>`}
          </span>
        </td>
        <td class="detail-col" data-label="Acciones">
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
    `}).join('');
  },

  exportarComprasPDF() {
    const items = this.comprasFiltradasActuales || this.compras;
    const printSheet = document.getElementById('comprasPrintSheet');
    if (!printSheet) return;

    const total = items.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    const fechaActual = new Date().toLocaleDateString('es-CO');

    const catMap = {};
    items.forEach(c => {
      catMap[c.categoria] = (catMap[c.categoria] || 0) + Number(c.monto || 0);
    });

    const catRows = Object.entries(catMap)
      .map(([cat, val]) => `<tr><td style="padding:4px 0;"><strong>${cat}</strong></td><td style="text-align:right; padding:4px 0;">${this.formatearDinero(val)}</td></tr>`)
      .join('');

    const tableRows = items.map((c, idx) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:6px 8px;">${idx + 1}</td>
        <td style="padding:6px 8px; font-weight:600;">${c.fecha}</td>
        <td style="padding:6px 8px;">${c.numeroFactura || 'S/N'}</td>
        <td style="padding:6px 8px; font-weight:700;">${c.proveedor}</td>
        <td style="padding:6px 8px;">${c.descripcion}</td>
        <td style="padding:6px 8px;">${c.categoria}</td>
        <td style="padding:6px 8px;">${c.metodoPago}</td>
        <td style="padding:6px 8px; text-align:right; font-weight:800;">${this.formatearDinero(c.monto)}</td>
      </tr>
    `).join('');

    const logoSrc = this.config.logoData || 'logo.jpg';

    printSheet.innerHTML = `
      <div style="font-family:'Outfit', sans-serif; padding: 20px; color:#111;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #d4af37; padding-bottom:14px; margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:142px; height:72px; background:#f8f5ee; border:1.5px solid #d4af37; border-radius:10px; padding:4px 8px; display:flex; align-items:center; justify-content:center;">
              <img src="${logoSrc}" style="width:100%; height:100%; object-fit:contain;" alt="NOIRDA Opulence">
            </div>
            <div>
              <h1 style="font-family:'Cinzel', serif; font-size:22px; margin:0; letter-spacing:2px; color:#0a0c10;">NOIRDA OPULENCE</h1>
              <p style="margin:2px 0 0 0; font-size:12px; color:#555; text-transform:uppercase;">Informe Consolidado Oficial de Compras de Mercancía</p>
              <p style="margin:2px 0 0 0; font-size:12px; color:#222;"><strong>Propietario:</strong> Liam Varelas | <strong>Contacto:</strong> 3045345642</p>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="background:#0a0c10; color:#d4af37; padding:4px 10px; border-radius:4px; font-weight:800; font-size:11px;">CONSOLIDADO DE COMPRAS</div>
            <div style="font-size:12px; color:#666; margin-top:4px;">Fecha emisión: ${fechaActual}</div>
          </div>
        </div>

        <div style="display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap;">
          <div style="flex:1; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:12px;">
            <span style="font-size:11px; text-transform:uppercase; color:#6b7280; font-weight:600;">Monto Total en Compras</span>
            <div style="font-size:24px; font-weight:800; color:#111827;">${this.formatearDinero(total)}</div>
            <span style="font-size:12px; color:#555;">${items.length} facturas registradas</span>
          </div>

          <div style="flex:1; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:12px;">
            <span style="font-size:11px; text-transform:uppercase; color:#6b7280; font-weight:600;">Inversión por Categorías</span>
            <table style="width:100%; font-size:12px; margin-top:4px;">
              ${catRows}
            </table>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:10px;">
          <thead>
            <tr style="background:#111827; color:#fff;">
              <th style="padding:8px 6px; text-align:left;">#</th>
              <th style="padding:8px 6px; text-align:left;">Fecha</th>
              <th style="padding:8px 6px; text-align:left;">Factura</th>
              <th style="padding:8px 6px; text-align:left;">Proveedor</th>
              <th style="padding:8px 6px; text-align:left;">Descripción</th>
              <th style="padding:8px 6px; text-align:left;">Categoría</th>
              <th style="padding:8px 6px; text-align:left;">Pago</th>
              <th style="padding:8px 6px; text-align:right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background:#f3f4f6; font-weight:800; border-top:2px solid #111;">
              <td colspan="7" style="padding:10px 6px; text-align:right;">TOTAL CONSOLIDADO:</td>
              <td style="padding:10px 6px; text-align:right; font-size:14px;">${this.formatearDinero(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top:40px; display:flex; justify-content:space-between;">
          <div style="text-align:center; width:220px; border-top:1px solid #111; padding-top:6px;">
            <strong>Liam Varelas</strong><br>
            <span style="font-size:11px; color:#555;">Propietario / NOIRDA Opulence</span><br>
            <span style="font-size:11px; color:#555;">Cel: 3045345642</span>
          </div>
          <div style="text-align:right; font-size:11px; color:#888;">
            Documento contable oficial de NOIRDA Opulence.<br>
            Generado automáticamente.
          </div>
        </div>
      </div>
    `;

    document.body.classList.add('printing-compras');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-compras');
    }, 1000);
  },

  enviarComprasCorreo() {
    const items = this.comprasFiltradasActuales || this.compras;
    const total = items.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    const fechaActual = new Date().toLocaleDateString('es-CO');

    let body = `CONSOLIDADO DE COMPRAS DE MERCANCÍA - NOIRDA OPULENCE\n`;
    body += `Propietario: Liam Varelas | Cel: 3045345642\n`;
    body += `Fecha de Emisión: ${fechaActual}\n`;
    body += `--------------------------------------------------\n`;
    body += `TOTAL INVERTIDO EN COMPRAS: ${this.formatearDinero(total)}\n`;
    body += `CANTIDAD DE FACTURAS: ${items.length}\n`;
    body += `--------------------------------------------------\n\n`;
    body += `DETALLE DE FACTURAS:\n`;

    items.forEach((c, idx) => {
      body += `${idx + 1}. [${c.fecha}] ${c.proveedor} - ${c.categoria}\n`;
      body += `   Factura: ${c.numeroFactura || 'S/N'} | Monto: ${this.formatearDinero(c.monto)} | Pago: ${c.metodoPago}\n`;
      body += `   Prendas: ${c.descripcion}\n\n`;
    });

    body += `--------------------------------------------------\n`;
    body += `Generado por software financiero NOIRDA Opulence.\n`;

    const subject = encodeURIComponent(`Consolidado de Compras - NOIRDA Opulence (${fechaActual})`);
    const mailtoUrl = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  },

  // ===================================================================
  // TABLA DE GASTOS DEL LOCAL / OPERACIÓN (APARTE DE MERCANCÍA Y NÓMINA)
  // ===================================================================
  obtenerGrupoCategoriaLocal(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('servicio') || c.includes('arriendo') || c.includes('adecuaci') || c.includes('bolsa') || c.includes('aseo')) {
      return 'instalaciones';
    }
    if (c.includes('prenda') || c.includes('etiqueta') || c.includes('código') || c.includes('codigo') || c.includes('rollo') || c.includes('térmico') || c.includes('termico') || c.includes('cuerda')) {
      return 'prendas';
    }
    if (c.includes('recibo') || c.includes('caja') || c.includes('papelería general') || c.includes('papeleria general') || c.includes('lapicero') || c.includes('hoja') || c.includes('block')) {
      return 'papeleria';
    }
    if (c.includes('publicidad') || c.includes('litograf') || c.includes('modelo') || c.includes('pauta')) {
      return 'marketing';
    }
    return 'otros';
  },

  filtrarPorGrupoLocal(grupo) {
    this.grupoLocalActivo = grupo || 'todos';
    document.querySelectorAll('.local-rubro-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-grupo') === this.grupoLocalActivo);
    });
    this.renderTablaLocal();
  },

  activarGastoLocalPersonalizado() {
    const modal = document.getElementById('modalLocal');
    if (modal && !modal.classList.contains('active')) {
      this.abrirModalLocal();
    }
    const selCat = document.getElementById('localCategoria');
    const grpPers = document.getElementById('grupoCategoriaLocalPersonalizada');
    const inPers = document.getElementById('localCategoriaPersonalizada');

    if (selCat) selCat.value = '__custom__';
    if (grpPers) grpPers.classList.remove('hidden');

    // Desactivar otros chips y activar el chip personalizado
    document.querySelectorAll('#quickLocalChips .local-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('chipGastoPersonalizadoLocal')?.classList.add('active');

    // Asegurar que la primera tarjeta del formulario esté abierta
    document.getElementById('cardLocalDatos')?.classList.remove('collapsed');

    setTimeout(() => {
      if (inPers) {
        inPers.focus();
        inPers.select();
      }
    }, 150);

    this.actualizarResumenTarjetasForm();
  },

  abrirModalLocalPersonalizado() {
    this.abrirModalLocal();
    this.activarGastoLocalPersonalizado();
  },

  seleccionarChipLocal(categoria, sugerenciaConcepto) {
    const selCat = document.getElementById('localCategoria');
    const grpPers = document.getElementById('grupoCategoriaLocalPersonalizada');
    const inDesc = document.getElementById('localDescripcion');
    const inProv = document.getElementById('localProveedor');

    // Quitar active de otros chips y resaltar el seleccionado
    document.querySelectorAll('#quickLocalChips .local-chip').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim().includes(categoria.split(' ')[0]));
    });

    if (selCat) {
      let existe = false;
      for (let i = 0; i < selCat.options.length; i++) {
        if (selCat.options[i].value === categoria) {
          existe = true;
          break;
        }
      }
      if (!existe) {
        const opt = document.createElement('option');
        opt.value = categoria;
        opt.textContent = categoria;
        selCat.insertBefore(opt, selCat.lastElementChild);
      }
      selCat.value = categoria;
    }

    if (grpPers) grpPers.classList.add('hidden');
    if (inDesc) inDesc.value = sugerenciaConcepto;
    if (inProv && !inProv.value.trim()) {
      inProv.focus();
    } else {
      document.getElementById('localMonto')?.focus();
    }
    this.actualizarResumenTarjetasForm();
  },

  renderTablaLocal() {
    const tbody = document.getElementById('tbodyLocal');
    if (!tbody) return;

    const itemsPeriodo = this.filtrarPorPeriodo(this.gastosLocal || []);

    // Calcular sumatorias por los bloques operativos del local
    let sumTotal = 0;
    let sumInstalaciones = 0;
    let sumPrendas = 0;
    let sumPapeleria = 0;
    let sumMarketing = 0;
    let sumOtros = 0;

    itemsPeriodo.forEach(item => {
      const m = Number(item.monto || 0);
      sumTotal += m;
      const g = this.obtenerGrupoCategoriaLocal(item.categoria);
      if (g === 'instalaciones') sumInstalaciones += m;
      else if (g === 'prendas') sumPrendas += m;
      else if (g === 'papeleria') sumPapeleria += m;
      else if (g === 'marketing') sumMarketing += m;
      else sumOtros += m;
    });

    const elTot = document.getElementById('rubroTotalLocal'); if (elTot) elTot.textContent = this.formatearDinero(sumTotal);
    const elCnt = document.getElementById('rubroCountTodos'); if (elCnt) elCnt.textContent = `${itemsPeriodo.length} gastos registrados`;
    const elIns = document.getElementById('rubroInstalaciones'); if (elIns) elIns.textContent = this.formatearDinero(sumInstalaciones);
    const elPre = document.getElementById('rubroPrendas'); if (elPre) elPre.textContent = this.formatearDinero(sumPrendas);
    const elPap = document.getElementById('rubroPapeleria'); if (elPap) elPap.textContent = this.formatearDinero(sumPapeleria);
    const elMkt = document.getElementById('rubroMarketing'); if (elMkt) elMkt.textContent = this.formatearDinero(sumMarketing);
    const elOtr = document.getElementById('rubroOtrosLocal'); if (elOtr) elOtr.textContent = this.formatearDinero(sumOtros);

    let items = [...itemsPeriodo];

    // Filtrar por bloque operativo si se seleccionó una tarjeta del semáforo
    if (this.grupoLocalActivo && this.grupoLocalActivo !== 'todos') {
      items = items.filter(l => this.obtenerGrupoCategoriaLocal(l.categoria) === this.grupoLocalActivo);
    }

    const searchVal = document.getElementById('searchLocal')?.value.toLowerCase().trim();
    const catVal = document.getElementById('filtroCategoriaLocal')?.value;
    const estVal = document.getElementById('filtroEstadoLocal')?.value;
    const metVal = document.getElementById('filtroMetodoPagoLocal')?.value;

    if (searchVal) {
      items = items.filter(l =>
        (l.proveedor && l.proveedor.toLowerCase().includes(searchVal)) ||
        (l.descripcion && l.descripcion.toLowerCase().includes(searchVal)) ||
        (l.categoria && l.categoria.toLowerCase().includes(searchVal)) ||
        (l.numeroFactura && l.numeroFactura.toLowerCase().includes(searchVal))
      );
    }

    if (catVal && catVal !== 'todas') {
      items = items.filter(l => l.categoria === catVal);
    }

    if (estVal && estVal !== 'todos') {
      items = items.filter(l => (l.estado || 'Pagado') === estVal);
    }

    if (metVal && metVal !== 'todos') {
      items = items.filter(l => l.metodoPago === metVal);
    }

    this.localFiltradosActuales = items;

    const totalFiltrado = items.reduce((sum, l) => sum + Number(l.monto || 0), 0);
    const sumEl = document.getElementById('sumatoriaLocalFiltrados');
    const cntEl = document.getElementById('conteoLocalFiltrados');
    if (sumEl) sumEl.textContent = this.formatearDinero(totalFiltrado);
    if (cntEl) cntEl.textContent = `(${items.length} registros)`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">No hay gastos del local registrados con estos filtros. Usa el botón "Registrar Gasto del Local" o el botón (+).</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(l => {
      const isPdf = l.reciboTipo && l.reciboTipo.includes('pdf');
      const estado = l.estado || 'Pagado';
      const estadoBadge = estado === 'Pendiente'
        ? `<span class="badge-tag" style="background:rgba(239,68,68,0.16); color:#f87171;">⏳ Pendiente</span>`
        : estado === 'Fijo Mensual'
          ? `<span class="badge-tag gold">🔄 Fijo Mensual</span>`
          : `<span class="badge-tag emerald">✅ Pagado</span>`;

      return `
      <tr class="collapsible-record-row" onclick="App.toggleRecordRow(event, this)">
        <td class="primary-col col-date" data-label="Fecha"><span class="table-cell-val" style="font-weight:600;">${l.fecha}</span></td>
        <td class="primary-col col-title" data-label="Beneficiario / Entidad"><span class="table-cell-val" style="font-weight:600; color:var(--text-main);">${l.proveedor}</span></td>
        <td class="detail-col" data-label="Concepto / Detalle"><span class="table-cell-val" title="${l.descripcion}">${l.descripcion}</span></td>
        <td class="primary-col col-badge" data-label="Categoría Local"><span class="table-cell-val"><span class="badge-tag amber">${l.categoria}</span></span></td>
        <td class="detail-col" data-label="Estado / Pago"><span class="table-cell-val">${estadoBadge} <small style="display:block; color:var(--text-dim); margin-top:2px;">${l.metodoPago || 'Efectivo'}</small></span></td>
        <td class="primary-col col-amount" data-label="Monto"><span class="table-cell-val" style="font-weight:700; color:var(--gold-light);">${this.formatearDinero(l.monto)} <i class="fa-solid fa-chevron-down mobile-row-chevron"></i></span></td>
        <td class="detail-col" data-label="Soporte">
          <span class="table-cell-val">
            ${l.reciboData ? `
              <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('local', ${l.id})">
                <i class="fa-solid ${isPdf ? 'fa-file-pdf text-emerald' : 'fa-paperclip'}"></i> ${isPdf ? 'Ver PDF' : 'Ver Soporte'}
              </button>
            ` : `<span class="receipt-none">Sin soporte</span>`}
          </span>
        </td>
        <td class="detail-col" data-label="Acciones">
          <div class="action-buttons-cell">
            <button class="btn-table-action" onclick="App.editarRegistro('local', ${l.id})" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table-action delete" onclick="App.eliminarRegistro('local', ${l.id})" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `}).join('');
  },

  exportarLocalPDF() {
    const items = this.localFiltradosActuales || this.gastosLocal || [];
    const printSheet = document.getElementById('localPrintSheet');
    if (!printSheet) return;

    const total = items.reduce((sum, l) => sum + Number(l.monto || 0), 0);
    const fechaActual = new Date().toLocaleDateString('es-CO');
    const logoSrc = this.config.logoData || 'logo.jpg';

    const catMap = {};
    items.forEach(l => {
      catMap[l.categoria] = (catMap[l.categoria] || 0) + Number(l.monto || 0);
    });

    const catRows = Object.entries(catMap)
      .map(([cat, val]) => `<tr><td style="padding:4px 0;"><strong>${cat}</strong></td><td style="text-align:right; padding:4px 0;">${this.formatearDinero(val)}</td></tr>`)
      .join('');

    const tableRows = items.map((l, idx) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:6px 8px;">${idx + 1}</td>
        <td style="padding:6px 8px; font-weight:600;">${l.fecha}</td>
        <td style="padding:6px 8px;">${l.numeroFactura || 'S/N'}</td>
        <td style="padding:6px 8px; font-weight:700;">${l.proveedor}</td>
        <td style="padding:6px 8px;">${l.descripcion}</td>
        <td style="padding:6px 8px;">${l.categoria}</td>
        <td style="padding:6px 8px;">${l.estado || 'Pagado'} (${l.metodoPago})</td>
        <td style="padding:6px 8px; text-align:right; font-weight:800;">${this.formatearDinero(l.monto)}</td>
      </tr>
    `).join('');

    printSheet.innerHTML = `
      <div style="font-family:'Outfit', sans-serif; padding: 20px; color:#111;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #d4af37; padding-bottom:14px; margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:142px; height:72px; background:#f8f5ee; border:1.5px solid #d4af37; border-radius:10px; padding:4px 8px; display:flex; align-items:center; justify-content:center;">
              <img src="${logoSrc}" style="width:100%; height:100%; object-fit:contain;" alt="NOIRDA Opulence">
            </div>
            <div>
              <h1 style="font-family:'Cinzel', serif; font-size:22px; margin:0; letter-spacing:2px; color:#0a0c10;">NOIRDA OPULENCE</h1>
              <p style="margin:2px 0 0 0; font-size:12px; color:#555; text-transform:uppercase;">Informe Oficial de Gastos del Local, Papelería y Publicidad</p>
              <p style="margin:2px 0 0 0; font-size:12px; color:#222;"><strong>Propietario:</strong> Liam Varelas | <strong>Contacto:</strong> 3045345642</p>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="background:#0a0c10; color:#d4af37; padding:4px 10px; border-radius:4px; font-weight:800; font-size:11px;">GASTOS DEL LOCAL</div>
            <div style="font-size:12px; color:#666; margin-top:4px;">Fecha emisión: ${fechaActual}</div>
          </div>
        </div>

        <div style="display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap;">
          <div style="flex:1; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:12px;">
            <span style="font-size:11px; text-transform:uppercase; color:#6b7280; font-weight:600;">Total Gastos del Local</span>
            <div style="font-size:24px; font-weight:800; color:#111827;">${this.formatearDinero(total)}</div>
            <span style="font-size:12px; color:#555;">${items.length} registros operativos</span>
          </div>

          <div style="flex:1; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:12px;">
            <span style="font-size:11px; text-transform:uppercase; color:#6b7280; font-weight:600;">Desglose por Categorías del Local</span>
            <table style="width:100%; font-size:12px; margin-top:4px;">
              ${catRows}
            </table>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:10px;">
          <thead>
            <tr style="background:#111827; color:#fff;">
              <th style="padding:8px 6px; text-align:left;">#</th>
              <th style="padding:8px 6px; text-align:left;">Fecha</th>
              <th style="padding:8px 6px; text-align:left;">Recibo</th>
              <th style="padding:8px 6px; text-align:left;">Beneficiario / Entidad</th>
              <th style="padding:8px 6px; text-align:left;">Concepto / Detalle</th>
              <th style="padding:8px 6px; text-align:left;">Categoría</th>
              <th style="padding:8px 6px; text-align:left;">Estado / Pago</th>
              <th style="padding:8px 6px; text-align:right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background:#f3f4f6; font-weight:800; border-top:2px solid #111;">
              <td colspan="7" style="padding:10px 6px; text-align:right;">TOTAL GASTOS DEL LOCAL:</td>
              <td style="padding:10px 6px; text-align:right; font-size:14px;">${this.formatearDinero(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top:32px; display:flex; justify-content:space-between;">
          <div style="text-align:center; width:220px; border-top:1px solid #111; padding-top:6px;">
            <strong>Liam Varelas</strong><br>
            <span style="font-size:11px; color:#555;">Propietario / NOIRDA Opulence</span><br>
            <span style="font-size:11px; color:#555;">Cel: 3045345642</span>
          </div>
          <div style="text-align:right; font-size:11px; color:#888;">
            Documento contable oficial de NOIRDA Opulence.<br>
            Generado automáticamente.
          </div>
        </div>
      </div>
    `;

    document.body.classList.add('printing-local');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-local');
    }, 1000);
  },

  enviarLocalCorreo() {
    const items = this.localFiltradosActuales || this.gastosLocal || [];
    const total = items.reduce((sum, l) => sum + Number(l.monto || 0), 0);
    const fechaActual = new Date().toLocaleDateString('es-CO');

    let body = `CONSOLIDADO DE GASTOS DEL LOCAL - NOIRDA OPULENCE\n`;
    body += `Propietario: Liam Varelas | Cel: 3045345642\n`;
    body += `Fecha de Emisión: ${fechaActual}\n`;
    body += `--------------------------------------------------\n`;
    body += `TOTAL GASTOS DEL LOCAL: ${this.formatearDinero(total)}\n`;
    body += `CANTIDAD DE REGISTROS: ${items.length}\n`;
    body += `--------------------------------------------------\n\n`;

    items.forEach((l, idx) => {
      body += `${idx + 1}. [${l.fecha}] ${l.categoria} - ${l.proveedor}\n`;
      body += `   Detalle: ${l.descripcion} | Monto: ${this.formatearDinero(l.monto)} | Pago: ${l.metodoPago}\n\n`;
    });

    const subject = encodeURIComponent(`Consolidado Gastos del Local - NOIRDA Opulence (${fechaActual})`);
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  },

  // ===================================================================
  // EXPORTACIÓN DE PDF CONSOLIDADO ANUAL COMPLETO (MERCANCÍA, LOCAL Y NÓMINA)
  // ===================================================================
  exportarConsolidadoAnualPDF(soloPeriodoActual = false) {
    const printSheet = document.getElementById('anualConsolidadoPrintSheet');
    if (!printSheet) return;

    const anio = this.filtroAnio || new Date().getFullYear();
    let comprasItems, localItems, nominaItems, tituloPeriodo;

    if (soloPeriodoActual) {
      comprasItems = this.filtrarPorPeriodo(this.compras);
      localItems = this.filtrarPorPeriodo(this.gastosLocal || []);
      nominaItems = this.filtrarPorPeriodo(this.nomina);
      const mesNombre = this.filtroMes === 'todos' ? 'Año Completo' : this.obtenerNombreMes(this.filtroMes);
      tituloPeriodo = `Periodo Seleccionado: ${mesNombre} ${anio}`;
    } else {
      // Todo el año completo
      comprasItems = this.compras.filter(c => (c.anio === anio || (c.fecha && c.fecha.startsWith(String(anio)))));
      localItems = (this.gastosLocal || []).filter(l => (l.anio === anio || (l.fecha && l.fecha.startsWith(String(anio)))));
      nominaItems = this.nomina.filter(n => (n.anio === anio || (n.fecha && n.fecha.startsWith(String(anio)))));
      tituloPeriodo = `Informe Consolidado Anual Completo — Año Fiscal ${anio}`;
    }

    const totalCompras = comprasItems.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    const totalLocal = localItems.reduce((sum, l) => sum + Number(l.monto || 0), 0);
    const totalNomina = nominaItems.reduce((sum, n) => sum + Number(n.neto || 0), 0);
    const granTotal = totalCompras + totalLocal + totalNomina;

    const pctCompras = granTotal > 0 ? ((totalCompras / granTotal) * 100).toFixed(1) : '0';
    const pctLocal = granTotal > 0 ? ((totalLocal / granTotal) * 100).toFixed(1) : '0';
    const pctNomina = granTotal > 0 ? ((totalNomina / granTotal) * 100).toFixed(1) : '0';

    const fechaActual = new Date().toLocaleDateString('es-CO', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const logoSrc = this.config.logoData || 'logo.jpg';

    // 1. Balance mes a mes (Enero a Diciembre)
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    let balanceMesesHtml = '';
    mesesNombres.forEach((nombreMes, idx) => {
      const numMes = String(idx + 1).padStart(2, '0');
      const compMes = comprasItems.filter(c => c.mes === numMes || (c.fecha && c.fecha.split('-')[1] === numMes)).reduce((s, c) => s + Number(c.monto || 0), 0);
      const locMes = localItems.filter(l => l.mes === numMes || (l.fecha && l.fecha.split('-')[1] === numMes)).reduce((s, l) => s + Number(l.monto || 0), 0);
      const nomMes = nominaItems.filter(n => n.mes === numMes || (n.fecha && n.fecha.split('-')[1] === numMes)).reduce((s, n) => s + Number(n.neto || 0), 0);
      const totalMes = compMes + locMes + nomMes;
      const pctMes = granTotal > 0 ? ((totalMes / granTotal) * 100).toFixed(1) : '0';

      if (totalMes > 0 || !soloPeriodoActual) {
        balanceMesesHtml += `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:6px 8px; font-weight:600;">${nombreMes}</td>
            <td style="padding:6px 8px; text-align:right;">${compMes > 0 ? this.formatearDinero(compMes) : '-'}</td>
            <td style="padding:6px 8px; text-align:right;">${locMes > 0 ? this.formatearDinero(locMes) : '-'}</td>
            <td style="padding:6px 8px; text-align:right;">${nomMes > 0 ? this.formatearDinero(nomMes) : '-'}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:700; color:#111827;">${this.formatearDinero(totalMes)}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:600; color:#6b7280;">${pctMes}%</td>
          </tr>
        `;
      }
    });

    // 2. Filas detalladas de Compras de Mercancía
    const comprasRowsHtml = comprasItems.length === 0
      ? `<tr><td colspan="7" style="text-align:center; padding:12px; color:#888;">No hay registros de compras de mercancía en este periodo.</td></tr>`
      : comprasItems.map((c, idx) => `
        <tr style="border-bottom:1px solid #e5e7eb; page-break-inside:avoid;">
          <td style="padding:6px 8px; color:#6b7280;">${idx + 1}</td>
          <td style="padding:6px 8px; white-space:nowrap; font-weight:600;">${c.fecha}</td>
          <td style="padding:6px 8px; font-weight:600;">${c.proveedor}</td>
          <td style="padding:6px 8px;"><span style="background:#eff6ff; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-size:10.5px;">${c.categoria}</span></td>
          <td style="padding:6px 8px;">${c.descripcion || '-'}</td>
          <td style="padding:6px 8px; font-size:11px; color:#555;">${c.metodoPago || '-'}</td>
          <td style="padding:6px 8px; text-align:right; font-weight:700; color:#111827;">${this.formatearDinero(c.monto)}</td>
        </tr>
      `).join('');

    // 3. Filas detalladas de Gastos del Local
    const localRowsHtml = localItems.length === 0
      ? `<tr><td colspan="8" style="text-align:center; padding:12px; color:#888;">No hay registros de gastos del local en este periodo.</td></tr>`
      : localItems.map((l, idx) => `
        <tr style="border-bottom:1px solid #e5e7eb; page-break-inside:avoid;">
          <td style="padding:6px 8px; color:#6b7280;">${idx + 1}</td>
          <td style="padding:6px 8px; white-space:nowrap; font-weight:600;">${l.fecha}</td>
          <td style="padding:6px 8px;"><span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-size:10.5px;">${l.categoria}</span></td>
          <td style="padding:6px 8px; font-weight:600;">${l.proveedor || '-'}</td>
          <td style="padding:6px 8px;">${l.descripcion || '-'}</td>
          <td style="padding:6px 8px; font-size:11px;">${l.estado || 'Pagado'}</td>
          <td style="padding:6px 8px; font-size:11px; color:#555;">${l.metodoPago || '-'}</td>
          <td style="padding:6px 8px; text-align:right; font-weight:700; color:#111827;">${this.formatearDinero(l.monto)}</td>
        </tr>
      `).join('');

    // 4. Filas detalladas de Nómina
    const nominaRowsHtml = nominaItems.length === 0
      ? `<tr><td colspan="9" style="text-align:center; padding:12px; color:#888;">No hay pagos de nómina registrados en este periodo.</td></tr>`
      : nominaItems.map((n, idx) => {
        let detalleT = `${this.formatearDinero(n.sueldoBase)}`;
        if (n.modoTiempo === 'horas' && n.cantidadTiempo) detalleT = `${n.cantidadTiempo}h (${this.formatearDinero(n.sueldoBase)})`;
        if (n.modoTiempo === 'dias' && n.cantidadTiempo) detalleT = `${n.cantidadTiempo}d (${this.formatearDinero(n.sueldoBase)})`;

        return `
          <tr style="border-bottom:1px solid #e5e7eb; page-break-inside:avoid;">
            <td style="padding:6px 8px; color:#6b7280;">${idx + 1}</td>
            <td style="padding:6px 8px; white-space:nowrap; font-weight:600;">${n.fecha}</td>
            <td style="padding:6px 8px; font-weight:700;">${n.trabajador} ${n.documento ? `<br><small style="color:#6b7280;">C.C. ${n.documento}</small>` : ''}</td>
            <td style="padding:6px 8px;"><span style="background:#f3e8ff; color:#7e22ce; padding:2px 6px; border-radius:4px; font-size:10.5px;">${n.cargo}</span></td>
            <td style="padding:6px 8px; font-size:11px;">${n.periodo || '-'}</td>
            <td style="padding:6px 8px; font-size:11px;">${detalleT}</td>
            <td style="padding:6px 8px; text-align:right; color:#059669; font-size:11px;">+${this.formatearDinero(n.bonos || 0)}</td>
            <td style="padding:6px 8px; text-align:right; color:#dc2626; font-size:11px;">-${this.formatearDinero(n.deducciones || 0)}</td>
            <td style="padding:6px 8px; text-align:right; font-weight:700; color:#111827;">${this.formatearDinero(n.neto)}</td>
          </tr>
        `;
      }).join('');

    printSheet.innerHTML = `
      <div style="font-family:'Plus Jakarta Sans', Arial, sans-serif; color:#111827; line-height:1.45; padding:10px;">
        <!-- ENCABEZADO OFICIAL -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #d4af37; padding-bottom:14px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="width:170px; height:75px; background:#f8f5ee; border:1.5px solid #d4af37; border-radius:10px; padding:4px 8px; display:flex; align-items:center; justify-content:center;">
              <img src="${logoSrc}" alt="NOIRDA Opulence" style="max-width:100%; max-height:100%; object-fit:contain;">
            </div>
            <div>
              <h1 style="font-size:20px; font-weight:900; margin:0; letter-spacing:1px; color:#111827;">NOIRDA OPULENCE</h1>
              <span style="font-size:11px; text-transform:uppercase; color:#b48a1e; font-weight:700; letter-spacing:1px;">Atelier & Fashion Store</span>
              <p style="margin:2px 0 0 0; font-size:12px; color:#4b5563;">Propietario: <strong>Liam Varelas</strong> | Tel: <strong>3045345642</strong></p>
            </div>
          </div>
          <div style="text-align:right;">
            <span style="background:#111827; color:#d4af37; font-size:11px; font-weight:800; padding:4px 10px; border-radius:4px; letter-spacing:1px;">INFORME CONSOLIDADO OFICIAL</span>
            <div style="font-size:15px; font-weight:800; margin-top:4px; color:#111827;">${tituloPeriodo}</div>
            <div style="font-size:11px; color:#6b7280;">Emisión: ${fechaActual}</div>
          </div>
        </div>

        <!-- TARJETAS RESUMEN EJECUTIVO (4 CUADRANTES) -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:18px;">
          <div style="background:#111827; color:#fff; border-radius:8px; padding:12px 14px; border:1.5px solid #d4af37;">
            <div style="font-size:10.5px; text-transform:uppercase; color:#d4af37; font-weight:700;">Gran Total Consolidado</div>
            <div style="font-size:21px; font-weight:900; color:#fef08a; margin:4px 0;">${this.formatearDinero(granTotal)}</div>
            <div style="font-size:11px; color:#9ca3af;">${comprasItems.length + localItems.length + nominaItems.length} registros totales</div>
          </div>

          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px;">
            <div style="font-size:10.5px; text-transform:uppercase; color:#166534; font-weight:700;">1. Consumo Mercancía</div>
            <div style="font-size:18px; font-weight:800; color:#14532d; margin:4px 0;">${this.formatearDinero(totalCompras)}</div>
            <div style="font-size:11px; color:#166534;"><strong>${pctCompras}%</strong> del total • ${comprasItems.length} facturas</div>
          </div>

          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px 14px;">
            <div style="font-size:10.5px; text-transform:uppercase; color:#92400e; font-weight:700;">2. Gastos del Local</div>
            <div style="font-size:18px; font-weight:800; color:#78350f; margin:4px 0;">${this.formatearDinero(totalLocal)}</div>
            <div style="font-size:11px; color:#92400e;"><strong>${pctLocal}%</strong> del total • ${localItems.length} gastos</div>
          </div>

          <div style="background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; padding:12px 14px;">
            <div style="font-size:10.5px; text-transform:uppercase; color:#6b21a8; font-weight:700;">3. Pagos de Nómina</div>
            <div style="font-size:18px; font-weight:800; color:#581c87; margin:4px 0;">${this.formatearDinero(totalNomina)}</div>
            <div style="font-size:11px; color:#6b21a8;"><strong>${pctNomina}%</strong> del total • ${nominaItems.length} nóminas</div>
          </div>
        </div>

        <!-- BALANCE MENSUAL COMPARATIVO -->
        <div style="margin-bottom:22px; page-break-inside:avoid;">
          <h3 style="font-size:13.5px; text-transform:uppercase; font-weight:800; color:#111827; border-left:4px solid #d4af37; padding-left:8px; margin:0 0 8px 0;">
            Balance Mensual Consolidado (Año ${anio})
          </h3>
          <table style="width:100%; border-collapse:collapse; font-size:11.5px; background:#fff;">
            <thead>
              <tr style="background:#1f2937; color:#fff;">
                <th style="padding:6px 8px; text-align:left;">Mes</th>
                <th style="padding:6px 8px; text-align:right;">Mercancía ($)</th>
                <th style="padding:6px 8px; text-align:right;">Gastos Local ($)</th>
                <th style="padding:6px 8px; text-align:right;">Nómina ($)</th>
                <th style="padding:6px 8px; text-align:right;">Total Mes ($)</th>
                <th style="padding:6px 8px; text-align:right;">% Anual</th>
              </tr>
            </thead>
            <tbody>
              ${balanceMesesHtml}
            </tbody>
            <tfoot>
              <tr style="background:#f3f4f6; font-weight:800; border-top:2px solid #111;">
                <td style="padding:8px; text-transform:uppercase;">TOTAL CONSOLIDADO:</td>
                <td style="padding:8px; text-align:right;">${this.formatearDinero(totalCompras)}</td>
                <td style="padding:8px; text-align:right;">${this.formatearDinero(totalLocal)}</td>
                <td style="padding:8px; text-align:right;">${this.formatearDinero(totalNomina)}</td>
                <td style="padding:8px; text-align:right; font-size:13px; color:#111827;">${this.formatearDinero(granTotal)}</td>
                <td style="padding:8px; text-align:right;">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- SECCIÓN 1: DETALLE DE COMPRAS DE MERCANCÍA -->
        <div style="margin-bottom:22px; page-break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-left:4px solid #3b82f6; padding-left:8px; margin-bottom:8px;">
            <h3 style="font-size:13.5px; text-transform:uppercase; font-weight:800; color:#111827; margin:0;">
              1. Detalle del Consumo de Mercancía (${comprasItems.length} facturas)
            </h3>
            <span style="font-size:12.5px; font-weight:800; color:#1d4ed8;">Subtotal: ${this.formatearDinero(totalCompras)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff;">
            <thead>
              <tr style="background:#2563eb; color:#fff;">
                <th style="padding:5px 6px; text-align:left; width:24px;">#</th>
                <th style="padding:5px 6px; text-align:left;">Fecha</th>
                <th style="padding:5px 6px; text-align:left;">Proveedor</th>
                <th style="padding:5px 6px; text-align:left;">Categoría</th>
                <th style="padding:5px 6px; text-align:left;">Descripción / Prendas</th>
                <th style="padding:5px 6px; text-align:left;">Método Pago</th>
                <th style="padding:5px 6px; text-align:right;">Monto ($)</th>
              </tr>
            </thead>
            <tbody>
              ${comprasRowsHtml}
            </tbody>
            <tfoot>
              <tr style="background:#f1f5f9; font-weight:800; border-top:1.5px solid #2563eb;">
                <td colspan="6" style="padding:6px; text-align:right;">SUBTOTAL CONSUMO MERCANCÍA:</td>
                <td style="padding:6px; text-align:right; font-size:12.5px; color:#1e3a8a;">${this.formatearDinero(totalCompras)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- SECCIÓN 2: DETALLE DE GASTOS DEL LOCAL -->
        <div style="margin-bottom:22px; page-break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-left:4px solid #f59e0b; padding-left:8px; margin-bottom:8px;">
            <h3 style="font-size:13.5px; text-transform:uppercase; font-weight:800; color:#111827; margin:0;">
              2. Detalle de Gastos del Local y Operación (${localItems.length} registros)
            </h3>
            <span style="font-size:12.5px; font-weight:800; color:#b45309;">Subtotal: ${this.formatearDinero(totalLocal)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff;">
            <thead>
              <tr style="background:#d97706; color:#fff;">
                <th style="padding:5px 6px; text-align:left; width:24px;">#</th>
                <th style="padding:5px 6px; text-align:left;">Fecha</th>
                <th style="padding:5px 6px; text-align:left;">Categoría</th>
                <th style="padding:5px 6px; text-align:left;">Beneficiario / Entidad</th>
                <th style="padding:5px 6px; text-align:left;">Detalle del Gasto</th>
                <th style="padding:5px 6px; text-align:left;">Estado</th>
                <th style="padding:5px 6px; text-align:left;">Método Pago</th>
                <th style="padding:5px 6px; text-align:right;">Monto ($)</th>
              </tr>
            </thead>
            <tbody>
              ${localRowsHtml}
            </tbody>
            <tfoot>
              <tr style="background:#fef3c7; font-weight:800; border-top:1.5px solid #d97706;">
                <td colspan="7" style="padding:6px; text-align:right;">SUBTOTAL GASTOS DEL LOCAL:</td>
                <td style="padding:6px; text-align:right; font-size:12.5px; color:#78350f;">${this.formatearDinero(totalLocal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- SECCIÓN 3: DETALLE DE NÓMINA DE TRABAJADORES -->
        <div style="margin-bottom:24px; page-break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-left:4px solid #a855f7; padding-left:8px; margin-bottom:8px;">
            <h3 style="font-size:13.5px; text-transform:uppercase; font-weight:800; color:#111827; margin:0;">
              3. Detalle de Pagos de Nómina y Personal (${nominaItems.length} comprobantes)
            </h3>
            <span style="font-size:12.5px; font-weight:800; color:#6b21a8;">Subtotal: ${this.formatearDinero(totalNomina)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff;">
            <thead>
              <tr style="background:#7e22ce; color:#fff;">
                <th style="padding:5px 6px; text-align:left; width:24px;">#</th>
                <th style="padding:5px 6px; text-align:left;">Fecha</th>
                <th style="padding:5px 6px; text-align:left;">Colaborador</th>
                <th style="padding:5px 6px; text-align:left;">Cargo</th>
                <th style="padding:5px 6px; text-align:left;">Periodo</th>
                <th style="padding:5px 6px; text-align:left;">Base / Tiempo</th>
                <th style="padding:5px 6px; text-align:right;">Bonos (+)</th>
                <th style="padding:5px 6px; text-align:right;">Deduc. (-)</th>
                <th style="padding:5px 6px; text-align:right;">Neto Pagado ($)</th>
              </tr>
            </thead>
            <tbody>
              ${nominaRowsHtml}
            </tbody>
            <tfoot>
              <tr style="background:#faf5ff; font-weight:800; border-top:1.5px solid #7e22ce;">
                <td colspan="8" style="padding:6px; text-align:right;">SUBTOTAL PAGOS DE NÓMINA:</td>
                <td style="padding:6px; text-align:right; font-size:12.5px; color:#581c87;">${this.formatearDinero(totalNomina)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- RECUADRO DE GRAN TOTAL Y AUDITORÍA OFICIAL -->
        <div style="background:#111827; color:#fff; border:2px solid #d4af37; border-radius:10px; padding:16px; margin-top:20px; page-break-inside:avoid; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; text-transform:uppercase; color:#d4af37; font-weight:800; letter-spacing:1px;">BALANCE GENERAL ANUAL AUDITADO</div>
            <div style="font-size:12.5px; color:#e2e8f0; margin-top:2px;">Consumo de Mercancía + Gastos del Local + Nómina de Trabajadores</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#9ca3af; text-transform:uppercase;">GRAN TOTAL GENERAL</div>
            <div style="font-size:26px; font-weight:900; color:#fde047;">${this.formatearDinero(granTotal)}</div>
          </div>
        </div>

        <!-- FIRMAS Y PIE LEGAL -->
        <div style="margin-top:36px; display:flex; justify-content:space-between; align-items:flex-end; page-break-inside:avoid;">
          <div style="text-align:center; width:240px; border-top:1.5px solid #111827; padding-top:6px;">
            <div style="font-family:Georgia, serif; font-style:italic; font-size:19px; color:#111827;">Liam Varelas</div>
            <strong>Liam Varelas</strong><br>
            <span style="font-size:11px; color:#555;">Propietario Legal • NOIRDA Opulence</span><br>
            <span style="font-size:11px; color:#555;">Cel: 3045345642</span>
          </div>
          <div style="text-align:right; font-size:11px; color:#6b7280;">
            Documento contable oficial generado por el Sistema Financiero NOIRDA Opulence.<br>
            Verificado por el propietario. Prohibida su alteración.
          </div>
        </div>
      </div>
    `;

    document.body.classList.add('printing-anual-report');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-anual-report');
    }, 1000);
  },

  // ===================================================================
  // TABLA DE NÓMINA DE TRABAJADORES & COMPROBANTES
  // ===================================================================
  generarTextoWhatsappNomina(item) {
    let msg = `*NOIRDA OPULENCE - COMPROBANTE DE NÓMINA*\n`;
    msg += `👔 Propietario: Liam Varelas (Cel: 3045345642)\n`;
    msg += `-------------------------------------------\n`;
    msg += `👤 Colaborador: *${item.trabajador}*\n`;
    if (item.documento) msg += `🆔 C.C.: ${item.documento}\n`;
    msg += `💼 Cargo: ${item.cargo}\n`;
    msg += `📅 Periodo: ${item.periodo} (${item.fecha})\n`;
    if (item.modoTiempo === 'horas' && item.cantidadTiempo) {
      msg += `⏱️ Horas laboradas: ${item.cantidadTiempo} hrs a ${this.formatearDinero(item.tarifaTiempo)}/hr\n`;
    } else if (item.modoTiempo === 'dias' && item.cantidadTiempo) {
      msg += `⏱️ Días laborados: ${item.cantidadTiempo} días a ${this.formatearDinero(item.tarifaTiempo)}/día\n`;
    }
    msg += `💵 Sueldo Base: ${this.formatearDinero(item.sueldoBase)}\n`;
    if (item.bonos > 0) msg += `🎁 Bonos / Comisión: +${this.formatearDinero(item.bonos)}\n`;
    if (item.deducciones > 0) msg += `🔻 Deducciones: -${this.formatearDinero(item.deducciones)}\n`;
    msg += `-------------------------------------------\n`;
    msg += `💰 *TOTAL NETO PAGADO: ${this.formatearDinero(item.neto)}*\n`;
    msg += `💳 Método: ${item.metodoPago || 'Transferencia'}${item.referencia ? ' (Ref: ' + item.referencia + ')' : ''}\n`;
    if (item.notas) msg += `📝 Notas: ${item.notas}\n`;
    msg += `-------------------------------------------\n`;
    msg += `✨ ¡Gracias por tu compromiso con NOIRDA Opulence!`;
    return msg;
  },

  renderTablaNomina() {
    const tbody = document.getElementById('tbodyNomina');
    if (!tbody) return;

    let items = this.filtrarPorPeriodo(this.nomina);
    const searchVal = document.getElementById('searchNomina')?.value.toLowerCase().trim();

    if (searchVal) {
      items = items.filter(n =>
        (n.trabajador && n.trabajador.toLowerCase().includes(searchVal)) ||
        (n.cargo && n.cargo.toLowerCase().includes(searchVal)) ||
        (n.periodo && n.periodo.toLowerCase().includes(searchVal)) ||
        (n.documento && n.documento.includes(searchVal)) ||
        (n.whatsapp && n.whatsapp.includes(searchVal))
      );
    }

    const total = items.reduce((sum, n) => sum + Number(n.neto || 0), 0);
    const sumEl = document.getElementById('sumatoriaNominaFiltrada');
    const cntEl = document.getElementById('conteoNominaFiltrada');
    if (sumEl) sumEl.textContent = this.formatearDinero(total);
    if (cntEl) cntEl.textContent = `${items.length} trabajadores pagados`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">No se encontraron pagos de nómina en este periodo o búsqueda.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(n => {
      let tiempoStr = this.formatearDinero(n.sueldoBase);
      if (n.modoTiempo === 'horas' && n.cantidadTiempo) {
        tiempoStr = `${n.cantidadTiempo} hrs (${this.formatearDinero(n.sueldoBase)})`;
      } else if (n.modoTiempo === 'dias' && n.cantidadTiempo) {
        tiempoStr = `${n.cantidadTiempo} días (${this.formatearDinero(n.sueldoBase)})`;
      }

      const tel = (n.whatsapp || '').replace(/\D/g, '');
      const numWa = tel.length === 10 ? '57' + tel : tel;

      const isPdf = n.reciboTipo && n.reciboTipo.includes('pdf');

      return `
        <tr class="collapsible-record-row" onclick="App.toggleRecordRow(event, this)">
          <td class="primary-col col-date" data-label="Fecha Pago"><span class="table-cell-val" style="font-weight:600;">${n.fecha}</span></td>
          <td class="primary-col col-title" data-label="Trabajador"><span class="table-cell-val" style="font-weight:700;">
            <div>${n.trabajador}</div>
            ${n.whatsapp ? `<small style="color:#34d399;"><i class="fa-brands fa-whatsapp"></i> ${n.whatsapp}</small>` : ''}
          </span></td>
          <td class="primary-col col-badge" data-label="Cargo / Área"><span class="table-cell-val"><span class="badge-tag gold">${n.cargo}</span></span></td>
          <td class="detail-col" data-label="Tiempo / Base"><span class="table-cell-val">${tiempoStr}</span></td>
          <td class="detail-col" data-label="Bonos / Comisión"><span class="table-cell-val" style="color:var(--emerald-primary);">+${this.formatearDinero(n.bonos || 0)}</span></td>
          <td class="primary-col col-amount" data-label="Neto Pagado"><span class="table-cell-val" style="font-weight:800; color:var(--gold-light);">${this.formatearDinero(n.neto)} <i class="fa-solid fa-chevron-down mobile-row-chevron"></i></span></td>
          <td class="detail-col" data-label="Soporte">
            <span class="table-cell-val">
              ${n.reciboData ? `
                <button class="receipt-pill-btn" onclick="App.abrirVisorRecibo('nomina', ${n.id})">
                  <i class="fa-solid ${isPdf ? 'fa-file-pdf text-emerald' : 'fa-paperclip'}"></i> ${isPdf ? 'Ver PDF' : 'Ver'}
                </button>
              ` : `<span class="receipt-none">Sin foto</span>`}
            </span>
          </td>
          <td class="detail-col" data-label="WhatsApp / Acciones">
            <div class="action-buttons-cell">
              <button class="btn-table-action" style="color:var(--gold-light); border-color:rgba(212,175,55,0.4);" onclick="App.abrirComprobanteNomina(${n.id})" title="Ver e imprimir comprobante oficial PDF">
                <i class="fa-solid fa-file-invoice-dollar"></i>
              </button>
              <button class="btn-table-action" style="color:#25D366; border-color:rgba(37,211,102,0.4);" onclick="App.enviarWhatsappVoucherPorId(${n.id})" title="Enviar comprobante en IMAGEN por WhatsApp">
                <i class="fa-brands fa-whatsapp"></i>
              </button>
              <button class="btn-table-action" onclick="App.editarRegistro('nomina', ${n.id})" title="Editar">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-table-action delete" onclick="App.eliminarRegistro('nomina', ${n.id})" title="Eliminar">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  // ===================================================================
  // DIRECTORIO DE EMPLEADOS (BASE DE DATOS DE PERSONAL)
  // ===================================================================
  renderEmpleados() {
    const grid = document.getElementById('empleadosGrid');
    if (!grid) return;

    const searchVal = document.getElementById('searchEmpleados')?.value.toLowerCase().trim() || '';
    let emps = this.empleados;

    if (searchVal) {
      emps = emps.filter(e =>
        (e.nombre && e.nombre.toLowerCase().includes(searchVal)) ||
        (e.cargo && e.cargo.toLowerCase().includes(searchVal)) ||
        (e.telefono && e.telefono.includes(searchVal)) ||
        (e.documento && e.documento.includes(searchVal))
      );
    }

    this.actualizarSelectorEmpleadosNomina();

    if (emps.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color); color: var(--text-dim);">
          <i class="fa-solid fa-users" style="font-size: 32px; margin-bottom: 10px; display: block; color: var(--gold-primary);"></i>
          <p>No se encontraron empleados registrados en la base de datos.</p>
          <button class="btn-action-primary" style="margin-top: 14px;" onclick="App.abrirModalEmpleado()">
            <i class="fa-solid fa-user-plus"></i> Registrar Primer Empleado
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = emps.map(e => {
      const iniciales = (e.nombre || 'EM')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(n => n[0].toUpperCase())
        .join('');

      const telClean = (e.telefono || '').replace(/\D/g, '');
      const numWa = telClean.length === 10 ? '57' + telClean : telClean;

      let tipoTexto = 'Mensual';
      if (e.tipoPago === 'horas') tipoTexto = 'Por Hora';
      if (e.tipoPago === 'dias') tipoTexto = 'Por Día';
      if (e.tipoPago === 'quincenal') tipoTexto = 'Quincenal';

      return `
        <div class="employee-card">
          <div>
            <div class="emp-card-header">
              <div class="emp-avatar">${iniciales}</div>
              <div class="emp-title-info">
                <h3>${e.nombre}</h3>
                <span class="emp-cargo-badge">${e.cargo}</span>
              </div>
            </div>

            <div class="emp-card-meta">
              <div class="emp-meta-item">
                <i class="fa-solid fa-id-card text-gold"></i>
                <span>C.C.: ${e.documento || 'No registrada'}</span>
              </div>
              <div class="emp-meta-item">
                <i class="fa-brands fa-whatsapp text-emerald"></i>
                <span>${e.telefono}</span>
              </div>
              ${e.email ? `
                <div class="emp-meta-item">
                  <i class="fa-regular fa-envelope text-blue"></i>
                  <span>${e.email}</span>
                </div>
              ` : ''}
              <div class="emp-meta-item">
                <i class="fa-solid fa-coins text-gold"></i>
                <span>Tarifa Base: <strong>${this.formatearDinero(e.tarifa || 0)}</strong> (${tipoTexto})</span>
              </div>
            </div>
          </div>

          <div class="emp-actions-row">
            <a href="https://wa.me/${numWa}?text=Hola%20${encodeURIComponent(e.nombre)}%2C%20te%20contacto%20de%20NOIRDA%20Opulence" target="_blank" class="btn-whatsapp-sm" title="Enviar WhatsApp directo">
              <i class="fa-brands fa-whatsapp"></i> WhatsApp
            </a>
            <button class="btn-secondary" style="font-size:12px; padding:6px 10px;" onclick="App.abrirNominaParaEmpleado(${e.id})" title="Pagar nómina a este colaborador">
              <i class="fa-solid fa-hand-holding-dollar"></i> Pagar
            </button>
            <button class="btn-table-action" onclick="App.editarEmpleado(${e.id})" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table-action delete" onclick="App.eliminarEmpleado(${e.id})" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  actualizarSelectorEmpleadosNomina() {
    const select = document.getElementById('nominaEmpleadoSelect');
    if (!select) return;

    select.innerHTML = `<option value="">-- Seleccionar Trabajador (o escribir nuevo abajo) --</option>` +
      this.empleados.map(e => `<option value="${e.id}">${e.nombre} (${e.cargo})</option>`).join('');
  },

  abrirModalEmpleado(id = null) {
    const modal = document.getElementById('modalEmpleado');
    const form = document.getElementById('formEmpleado');
    form.reset();
    document.getElementById('empleadoId').value = '';

    if (id) {
      const emp = this.empleados.find(e => e.id === id);
      if (emp) {
        document.getElementById('modalEmpleadoTitulo').textContent = 'Editar Empleado';
        document.getElementById('empleadoId').value = emp.id;
        document.getElementById('empleadoNombre').value = emp.nombre;
        document.getElementById('empleadoDocumento').value = emp.documento || '';
        document.getElementById('empleadoTelefono').value = emp.telefono;
        document.getElementById('empleadoEmail').value = emp.email || '';
        document.getElementById('empleadoCargo').value = emp.cargo;
        document.getElementById('empleadoTipoPago').value = emp.tipoPago || 'mensual';
        document.getElementById('empleadoTarifa').value = emp.tarifa || 0;
        document.getElementById('empleadoNotas').value = emp.notas || '';
      }
    } else {
      document.getElementById('modalEmpleadoTitulo').textContent = 'Registrar Nuevo Empleado';
    }

    modal.classList.add('active');
  },

  async guardarEmpleado(e) {
    e.preventDefault();
    const idVal = document.getElementById('empleadoId').value;
    const datos = {
      nombre: document.getElementById('empleadoNombre').value.trim(),
      documento: document.getElementById('empleadoDocumento').value.trim(),
      telefono: document.getElementById('empleadoTelefono').value.trim(),
      email: document.getElementById('empleadoEmail').value.trim(),
      cargo: document.getElementById('empleadoCargo').value,
      tipoPago: document.getElementById('empleadoTipoPago').value,
      tarifa: parseFloat(document.getElementById('empleadoTarifa').value) || 0,
      notas: document.getElementById('empleadoNotas').value.trim()
    };

    if (idVal) {
      datos.id = parseInt(idVal);
    } else {
      datos.id = Date.now();
    }

    await this.db.put('empleados', datos);
    
    const idx = this.empleados.findIndex(em => em.id === datos.id);
    if (idx >= 0) {
      this.empleados[idx] = datos;
    } else {
      this.empleados.push(datos);
    }
    localStorage.setItem('noirda_empleados', JSON.stringify(this.empleados));

    this.renderEmpleados();
    this.renderBadges();
    this.cerrarModal('modalEmpleado');
    this.mostrarToast(idVal ? 'Empleado actualizado correctamente' : 'Empleado registrado con éxito', 'success');

    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }
  },

  editarEmpleado(id) {
    this.abrirModalEmpleado(id);
  },

  async eliminarEmpleado(id) {
    const emp = this.empleados.find(e => e.id === id);
    if (!emp) return;
    if (!confirm(`¿Estás seguro de eliminar a "${emp.nombre}" de la base de datos de empleados?`)) return;

    await this.db.delete('empleados', id);
    this.empleados = this.empleados.filter(e => e.id !== id);
    localStorage.setItem('noirda_empleados', JSON.stringify(this.empleados));
    this.renderEmpleados();
    this.renderBadges();
    this.mostrarToast('Empleado eliminado', 'info');

    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }
  },

  abrirNominaParaEmpleado(empId) {
    this.abrirModalNomina();
    const emp = this.empleados.find(e => e.id === empId);
    if (emp) {
      this.cargarDatosEmpleadoEnNomina(emp);
    }
  },

  cargarDatosEmpleadoEnNomina(emp) {
    if (!emp) return;
    const select = document.getElementById('nominaEmpleadoSelect');
    if (select) select.value = emp.id;

    document.getElementById('nominaTrabajador').value = emp.nombre;
    document.getElementById('nominaDocumento').value = emp.documento || '';
    document.getElementById('nominaWhatsapp').value = emp.telefono || '';
    document.getElementById('nominaEmail').value = emp.email || '';
    document.getElementById('nominaCargo').value = emp.cargo || '';
    
    const modoSelect = document.getElementById('nominaModoTiempo');
    if (modoSelect) {
      if (emp.tipoPago === 'horas') {
        modoSelect.value = 'horas';
      } else if (emp.tipoPago === 'dias') {
        modoSelect.value = 'dias';
      } else {
        modoSelect.value = 'fijo';
      }
      this.actualizarModoTiempoNomina();
    }

    if (emp.tipoPago === 'horas' || emp.tipoPago === 'dias') {
      const tarifaInp = document.getElementById('nominaTarifaTiempo');
      if (tarifaInp) tarifaInp.value = emp.tarifa || 0;
      this.calcularSubtotalTiempo();
    } else {
      document.getElementById('nominaSueldoBase').value = emp.tarifa || 0;
      this.calcularNetoNomina();
    }

    // Colapsar automáticamente la tarjeta de trabajador tras seleccionarlo y abrir liquidación
    document.getElementById('cardNominaTrabajador')?.classList.add('collapsed');
    document.getElementById('cardNominaLiquidacion')?.classList.remove('collapsed');
    this.actualizarResumenTarjetasForm();
  },

  actualizarModoTiempoNomina() {
    const modo = document.getElementById('nominaModoTiempo')?.value || 'fijo';
    const box = document.getElementById('boxCalculoTiempo');
    const lblCant = document.getElementById('lblCantidadTiempo');
    const lblTar = document.getElementById('lblTarifaTiempo');
    
    if (modo === 'horas') {
      box?.classList.remove('hidden');
      if (lblCant) lblCant.textContent = 'Horas Laboradas';
      if (lblTar) lblTar.textContent = 'Tarifa por Hora ($)';
      this.calcularSubtotalTiempo();
    } else if (modo === 'dias') {
      box?.classList.remove('hidden');
      if (lblCant) lblCant.textContent = 'Días Laborados';
      if (lblTar) lblTar.textContent = 'Tarifa por Día ($)';
      this.calcularSubtotalTiempo();
    } else {
      box?.classList.add('hidden');
      this.calcularNetoNomina();
    }
  },

  calcularSubtotalTiempo() {
    const cant = parseFloat(document.getElementById('nominaCantidadTiempo')?.value) || 0;
    const tarifa = parseFloat(document.getElementById('nominaTarifaTiempo')?.value) || 0;
    const subtotal = cant * tarifa;
    
    const disp = document.getElementById('displaySubtotalTiempo');
    if (disp) disp.textContent = this.formatearDinero(subtotal);

    const baseInp = document.getElementById('nominaSueldoBase');
    if (baseInp) baseInp.value = subtotal;

    this.calcularNetoNomina();
  },

  abrirComprobanteNomina(id) {
    const n = this.nomina.find(item => item.id === id);
    if (!n) return;

    this.itemNominaActual = n;

    const logoImg = document.getElementById('voucherLogoImg');
    if (logoImg) {
      logoImg.src = this.config.logoData || 'logo.jpg';
    }

    document.getElementById('voucherNumero').textContent = `REC-NOM-${String(n.id).padStart(4, '0')}`;
    document.getElementById('voucherFechaEmision').textContent = `Fecha emisión: ${n.fecha}`;
    document.getElementById('voucherNombreTrabajador').textContent = n.trabajador;
    document.getElementById('voucherDocTrabajador').textContent = n.documento || 'No registrada';
    document.getElementById('voucherCargoTrabajador').textContent = n.cargo;
    document.getElementById('voucherPeriodoTrabajador').textContent = n.periodo;
    document.getElementById('voucherTelefonoTrabajador').textContent = n.whatsapp || 'No registrado';
    document.getElementById('voucherMedioPago').textContent = `${n.metodoPago || 'Transferencia'}${n.referencia ? ' (' + n.referencia + ')' : ''}`;

    // Actualizar aviso de WhatsApp en el modal
    const noticeNombre = document.getElementById('voucherWaNoticeNombre');
    const noticeTel = document.getElementById('voucherWaNoticeTel');
    if (noticeNombre) noticeNombre.textContent = n.trabajador;
    if (noticeTel) noticeTel.textContent = n.whatsapp ? `+57 ${n.whatsapp}` : 'Sin número';

    let detalleTiempo = 'Salario Base Asignado';
    if (n.modoTiempo === 'horas' && n.cantidadTiempo) {
      detalleTiempo = `${n.cantidadTiempo} Horas laboradas a ${this.formatearDinero(n.tarifaTiempo || 0)}/hr`;
    } else if (n.modoTiempo === 'dias' && n.cantidadTiempo) {
      detalleTiempo = `${n.cantidadTiempo} Días laborados a ${this.formatearDinero(n.tarifaTiempo || 0)}/día`;
    }

    const tbody = document.getElementById('voucherTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td><strong>Salario Base / Tiempo Laborado</strong></td>
          <td>${detalleTiempo}</td>
          <td style="text-align:right; font-weight:600;">${this.formatearDinero(n.sueldoBase)}</td>
        </tr>
        ${Number(n.bonos || 0) > 0 ? `
          <tr>
            <td><strong>Bonificaciones / Comisiones</strong></td>
            <td>Comisión por ventas y cumplimiento de metas</td>
            <td style="text-align:right; font-weight:600; color:#10b981;">+${this.formatearDinero(n.bonos)}</td>
          </tr>
        ` : ''}
        ${Number(n.deducciones || 0) > 0 ? `
          <tr>
            <td><strong>Deducciones / Anticipos</strong></td>
            <td>Descuentos pactados o seguridad social</td>
            <td style="text-align:right; font-weight:600; color:#ef4444;">-${this.formatearDinero(n.deducciones)}</td>
          </tr>
        ` : ''}
      `;
    }

    document.getElementById('voucherTotalNeto').textContent = this.formatearDinero(n.neto);
    document.getElementById('voucherNotas').textContent = n.notas || 'Sin observaciones.';
    document.getElementById('voucherFirmaNombre').textContent = n.trabajador;
    document.getElementById('voucherFirmaDoc').textContent = n.documento ? `C.C. ${n.documento}` : 'Firma de Recibido';

    document.getElementById('modalComprobanteNomina').classList.add('active');
  },

  imprimirVoucher() {
    document.body.classList.add('printing-voucher');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-voucher');
    }, 800);
  },

  async generarCanvasComprobanteNomina(n) {
    const canvas = document.createElement('canvas');
    const W = 1080;
    const tieneBonos = Number(n.bonos || 0) > 0;
    const tieneDeducciones = Number(n.deducciones || 0) > 0;
    const filasExtra = (tieneBonos ? 1 : 0) + (tieneDeducciones ? 1 : 0);
    const H = 1060 + (filasExtra * 62);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Función auxiliar para rectángulos con esquinas redondeadas
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // 1. Fondo Marfil de Lujo
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, W, H);

    // Doble marco dorado
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    roundRect(24, 24, W - 48, H - 48, 16);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 1.5;
    roundRect(34, 34, W - 68, H - 68, 12);
    ctx.stroke();

    // 2. Cargar y dibujar el logo COMPLETO sin recortar
    const logoSrc = this.config.logoData || 'logo.jpg';
    const logoImg = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoSrc;
    });

    // Caja contenedora del logo (rectangular, fondo marfil suave)
    const logoBoxX = 64;
    const logoBoxY = 60;
    const logoBoxW = 210;
    const logoBoxH = 108;

    ctx.fillStyle = '#f8f5ee';
    roundRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 12);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (logoImg && logoImg.width > 0 && logoImg.height > 0) {
      const pad = 8;
      const availW = logoBoxW - pad * 2;
      const availH = logoBoxH - pad * 2;
      const scale = Math.min(availW / logoImg.width, availH / logoImg.height);
      const drawW = logoImg.width * scale;
      const drawH = logoImg.height * scale;
      const drawX = logoBoxX + (logoBoxW - drawW) / 2;
      const drawY = logoBoxY + (logoBoxH - drawH) / 2;
      ctx.drawImage(logoImg, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = '#111622';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('NOIRDA', logoBoxX + logoBoxW / 2, logoBoxY + 62);
    }

    // Textos de marca al lado del logo
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111622';
    ctx.font = 'bold 30px Georgia, "Times New Roman", serif';
    ctx.fillText('NOIRDA OPULENCE', 294, 96);

    ctx.fillStyle = '#b48a1e';
    ctx.font = 'bold 13px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('ATELIER & LUXURY STORE', 294, 122);

    ctx.fillStyle = '#475569';
    ctx.font = '600 14px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('Dirigido por Liam Varelas • Cel: 3045345642', 294, 148);

    // Bloque derecho del encabezado
    ctx.textAlign = 'right';
    ctx.fillStyle = '#92400e';
    ctx.font = 'bold 13px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('COMPROBANTE DE PAGO DE NÓMINA', W - 64, 88);

    ctx.fillStyle = '#111622';
    ctx.font = 'bold 24px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText(`REC-NOM-${String(n.id).padStart(4, '0')}`, W - 64, 120);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText(`Fecha emisión: ${n.fecha}`, W - 64, 148);

    // Línea divisoria dorada
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(64, 192);
    ctx.lineTo(W - 64, 192);
    ctx.stroke();

    // 3. Ficha del Colaborador (Grid 2 columnas x 3 filas)
    const infoBoxY = 216;
    const infoBoxH = 195;
    ctx.fillStyle = '#f8f5ee';
    roundRect(64, infoBoxY, W - 128, infoBoxH, 12);
    ctx.fill();
    ctx.strokeStyle = '#e5dcc5';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const drawField = (label, value, x, y, maxW) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(label.toUpperCase(), x, y);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px "Plus Jakarta Sans", Arial, sans-serif';
      let valStr = String(value || 'No registrado');
      if (valStr.length > 38) valStr = valStr.slice(0, 36) + '...';
      ctx.fillText(valStr, x, y + 23, maxW);
    };

    const col1X = 92;
    const col2X = W / 2 + 20;
    const colW = (W - 128) / 2 - 44;

    drawField('Colaborador(a):', n.trabajador, col1X, infoBoxY + 34, colW);
    drawField('Documento / C.C.:', n.documento || 'No registrada', col2X, infoBoxY + 34, colW);

    drawField('Cargo / Área:', n.cargo, col1X, infoBoxY + 94, colW);
    drawField('Periodo Liquidado:', n.periodo, col2X, infoBoxY + 94, colW);

    drawField('WhatsApp / Contacto:', n.whatsapp || 'No registrado', col1X, infoBoxY + 154, colW);
    const medioTexto = `${n.metodoPago || 'Transferencia'}${n.referencia ? ' (' + n.referencia + ')' : ''}`;
    drawField('Medio de Pago:', medioTexto, col2X, infoBoxY + 154, colW);

    // 4. Tabla de Conceptos Liquidados
    let curY = infoBoxY + infoBoxH + 28;
    const tableX = 64;
    const tableW = W - 128;

    // Cabecera de tabla
    ctx.fillStyle = '#111622';
    roundRect(tableX, curY, tableW, 48, 8);
    ctx.fill();

    ctx.fillStyle = '#f3d06b';
    ctx.font = 'bold 13px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CONCEPTO', tableX + 22, curY + 30);
    ctx.fillText('DETALLE / TIEMPO', tableX + 360, curY + 30);
    ctx.textAlign = 'right';
    ctx.fillText('VALOR', tableX + tableW - 22, curY + 30);

    curY += 48;

    let detalleTiempo = 'Salario Base Asignado';
    if (n.modoTiempo === 'horas' && n.cantidadTiempo) {
      detalleTiempo = `${n.cantidadTiempo} Horas laboradas a ${this.formatearDinero(n.tarifaTiempo || 0)}/hr`;
    } else if (n.modoTiempo === 'dias' && n.cantidadTiempo) {
      detalleTiempo = `${n.cantidadTiempo} Días laborados a ${this.formatearDinero(n.tarifaTiempo || 0)}/día`;
    }

    const drawTableRow = (concepto, detalle, valorStr, colorValor = '#0f172a') => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tableX, curY, tableW, 60);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tableX, curY + 60);
      ctx.lineTo(tableX + tableW, curY + 60);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(concepto, tableX + 22, curY + 36);

      ctx.fillStyle = '#475569';
      ctx.font = '500 14px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(detalle, tableX + 360, curY + 36);

      ctx.textAlign = 'right';
      ctx.fillStyle = colorValor;
      ctx.font = 'bold 16px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(valorStr, tableX + tableW - 22, curY + 36);

      curY += 60;
    };

    drawTableRow('Salario Base / Tiempo Laborado', detalleTiempo, this.formatearDinero(n.sueldoBase), '#0f172a');
    if (tieneBonos) {
      drawTableRow('Bonificaciones / Comisiones', 'Comisión por ventas y cumplimiento de metas', `+${this.formatearDinero(n.bonos)}`, '#059669');
    }
    if (tieneDeducciones) {
      drawTableRow('Deducciones / Anticipos', 'Descuentos pactados o anticipos', `-${this.formatearDinero(n.deducciones)}`, '#dc2626');
    }

    // 5. Caja de Total Neto Pagado
    curY += 24;
    ctx.fillStyle = '#111622';
    roundRect(tableX, curY, tableW, 78, 12);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('TOTAL NETO PAGADO AL COLABORADOR', tableX + 28, curY + 46);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f3d06b';
    ctx.font = 'bold 30px Georgia, "Times New Roman", serif';
    ctx.fillText(this.formatearDinero(n.neto), tableX + tableW - 28, curY + 49);

    // 6. Notas / Observaciones
    curY += 100;
    ctx.fillStyle = '#f8f5ee';
    roundRect(tableX, curY, tableW, 68, 8);
    ctx.fill();
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(tableX, curY, 5, 68);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('Observaciones:', tableX + 20, curY + 26);

    ctx.fillStyle = '#475569';
    ctx.font = '500 13.5px "Plus Jakarta Sans", Arial, sans-serif';
    const notaTexto = (n.notas || 'Sin observaciones. Comprobante oficial de pago verificado.').slice(0, 115);
    ctx.fillText(notaTexto, tableX + 20, curY + 48);

    // 7. Firmas de Conformidad
    const sigY = H - 115;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;

    // Línea Firma 1 (Propietario)
    ctx.beginPath();
    ctx.moveTo(130, sigY);
    ctx.lineTo(440, sigY);
    ctx.stroke();

    // Línea Firma 2 (Colaborador)
    ctx.beginPath();
    ctx.moveTo(W - 440, sigY);
    ctx.lineTo(W - 130, sigY);
    ctx.stroke();

    // Firma estilizada de Liam Varelas sobre la línea
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e293b';
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('Liam Varelas', 285, sigY - 12);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('Liam Varelas', 285, sigY + 24);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('Propietario • NOIRDA Opulence', 285, sigY + 44);

    // Datos Firma Colaborador
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText(n.trabajador || 'Colaborador', W - 285, sigY + 24);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText(n.documento ? `C.C. ${n.documento}` : 'Firma de Recibido', W - 285, sigY + 44);

    return canvas;
  },

  async descargarImagenVoucher(item) {
    const n = item || this.itemNominaActual;
    if (!n) return;
    try {
      this.mostrarToast('Generando imagen de alta resolución del comprobante...', 'info');
      const canvas = await this.generarCanvasComprobanteNomina(n);
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const safeName = (n.trabajador || 'Colaborador').replace(/[^a-zA-Z0-9_-]/g, '_');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Comprobante_Nomina_${safeName}_${n.fecha}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.mostrarToast('Imagen del comprobante descargada con éxito', 'success');
    } catch (err) {
      console.error('Error generando imagen del comprobante:', err);
      this.mostrarToast('No se pudo generar la imagen del comprobante', 'error');
    }
  },

  enviarWhatsappVoucherPorId(id) {
    const n = this.nomina.find(item => item.id === id);
    if (!n) return;
    this.itemNominaActual = n;
    this.abrirComprobanteNomina(n.id);

    let tel = (n.whatsapp || '').replace(/\D/g, '');
    if (!tel && n.trabajador) {
      const emp = (this.empleados || []).find(e => e.nombre && e.nombre.toLowerCase().trim() === n.trabajador.toLowerCase().trim());
      if (emp && emp.telefono) tel = emp.telefono.replace(/\D/g, '');
    }
    if (tel.length === 10) tel = '57' + tel;
    const waUrl = tel ? `https://api.whatsapp.com/send?phone=${tel}` : `https://api.whatsapp.com/send`;
    let waVentana = null;
    try {
      waVentana = window.open(waUrl, '_blank');
    } catch (e) {}

    this.enviarWhatsappVoucher(n, waVentana);
  },

  async enviarWhatsappVoucher(item, waVentana = null) {
    const n = item || this.itemNominaActual;
    if (!n) return;

    try {
      this.mostrarToast('Generando comprobante en imagen para WhatsApp...', 'info');
      const canvas = await this.generarCanvasComprobanteNomina(n);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
      const safeName = (n.trabajador || 'Colaborador').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Comprobante_Nomina_${safeName}_${n.fecha}.png`;

      // 1. Copiar automáticamente la IMAGEN al portapapeles del sistema (Directo para Ctrl+V)
      let copiadoPortapapeles = false;
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          copiadoPortapapeles = true;
        } catch (clipErr) {
          console.warn('No se pudo copiar imagen al portapapeles automáticamente:', clipErr);
        }
      }

      // 2. Descargar también el archivo PNG como respaldo
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 3. Obtener el número directo de WhatsApp del colaborador
      let tel = (n.whatsapp || '').replace(/\D/g, '');
      if (!tel && n.trabajador) {
        const emp = (this.empleados || []).find(e => e.nombre && e.nombre.toLowerCase().trim() === n.trabajador.toLowerCase().trim());
        if (emp && emp.telefono) tel = emp.telefono.replace(/\D/g, '');
      }
      if (tel.length === 10) tel = '57' + tel;

      const waUrl = tel ? `https://api.whatsapp.com/send?phone=${tel}` : `https://api.whatsapp.com/send`;

      // 4. Si la ventana de WhatsApp no fue pre-abierta en el evento síncrono del usuario, abrirla directamente
      if (!waVentana || waVentana.closed) {
        window.open(waUrl, '_blank');
      } else {
        try {
          waVentana.focus();
        } catch (e) {}
      }

      // 5. Actualizar el aviso de WhatsApp en el modal
      const noticeNombre = document.getElementById('voucherWaNoticeNombre');
      const noticeTel = document.getElementById('voucherWaNoticeTel');
      if (noticeNombre) noticeNombre.textContent = n.trabajador;
      if (noticeTel) noticeTel.textContent = tel ? `+${tel}` : 'Sin número';

      if (copiadoPortapapeles) {
        this.mostrarToast(`✅ Chat de WhatsApp de ${n.trabajador} abierto. Solo presiona Ctrl + V para pegar la imagen del pago y enviar.`, 'success');
      } else {
        this.mostrarToast(`✅ Chat de WhatsApp de ${n.trabajador} abierto. Imagen descargada en tu equipo, adjúntala y dale enviar.`, 'success');
      }
    } catch (err) {
      console.error('Error al preparar imagen para WhatsApp:', err);
      this.mostrarToast('Error al generar la imagen del comprobante', 'error');
    }
  },

  enviarEmailVoucher(item) {
    const n = item || this.itemNominaActual;
    if (!n) return;

    const email = n.email || '';
    const subject = encodeURIComponent(`Comprobante Oficial de Nómina - NOIRDA Opulence (${n.periodo})`);

    let body = `NOIRDA OPULENCE - ATELIER & FASHION STORE\n`;
    body += `Propietario: Liam Varelas | Cel: 3045345642\n`;
    body += `COMPROBANTE OFICIAL DE PAGO DE NÓMINA\n`;
    body += `--------------------------------------------------\n`;
    body += `Colaborador: ${n.trabajador}\n`;
    if (n.documento) body += `Cédula: ${n.documento}\n`;
    body += `Cargo: ${n.cargo}\n`;
    body += `Periodo: ${n.periodo} (Fecha: ${n.fecha})\n`;
    if (n.modoTiempo === 'horas' && n.cantidadTiempo) {
      body += `Tiempo Laborado: ${n.cantidadTiempo} Horas a ${this.formatearDinero(n.tarifaTiempo)}/hr\n`;
    } else if (n.modoTiempo === 'dias' && n.cantidadTiempo) {
      body += `Tiempo Laborado: ${n.cantidadTiempo} Días a ${this.formatearDinero(n.tarifaTiempo)}/día\n`;
    }
    body += `Sueldo Base: ${this.formatearDinero(n.sueldoBase)}\n`;
    if (n.bonos > 0) body += `Bonificaciones / Comisiones: +${this.formatearDinero(n.bonos)}\n`;
    if (n.deducciones > 0) body += `Deducciones: -${this.formatearDinero(n.deducciones)}\n`;
    body += `--------------------------------------------------\n`;
    body += `TOTAL NETO PAGADO: ${this.formatearDinero(n.neto)}\n`;
    body += `Medio de Pago: ${n.metodoPago || 'Transferencia'}${n.referencia ? ' (' + n.referencia + ')' : ''}\n`;
    if (n.notas) body += `Observaciones: ${n.notas}\n`;
    body += `--------------------------------------------------\n`;
    body += `Comprobante verificado por Liam Varelas - NOIRDA Opulence.\n`;

    const mailtoUrl = email ? `mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}` : `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
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

    if (tipoFiltro === 'all' || tipoFiltro === 'local') {
      const localConRecibo = this.filtrarPorPeriodo(this.gastosLocal || []).filter(l => l.reciboData);
      items.push(...localConRecibo.map(l => ({
        id: l.id,
        tipo: 'local',
        badge: 'amber',
        tag: 'Gasto del Local',
        titulo: l.categoria,
        detalle: `${l.proveedor} - ${l.descripcion}`,
        fecha: l.fecha,
        monto: l.monto,
        reciboData: l.reciboData,
        reciboTipo: l.reciboTipo
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
    } else if (tipo === 'local') {
      item = (this.gastosLocal || []).find(l => l.id === id);
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
    const pdfContainer = document.getElementById('visorPdfContainer');
    const pdfFrame = document.getElementById('visorPdfFrame');
    const pdfNombre = document.getElementById('visorPdfNombre');
    const pdfLink = document.getElementById('visorPdfLink');
    const btnDescargar = document.getElementById('btnDescargarRecibo');

    if (tipo === 'compra') {
      titulo.textContent = `Factura de Mercancía: ${item.proveedor}`;
      meta.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
          <strong>Proveedor: ${item.proveedor}</strong>
          <span style="color:var(--gold-primary); font-weight:700;">Total: ${this.formatearDinero(item.monto)}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted);">N° Factura: <strong>${item.numeroFactura || 'S/N'}</strong> | Fecha: <strong>${item.fecha}</strong> | Pago: <strong>${item.metodoPago}</strong></div>
        <div style="color:var(--text-main); margin-top:6px; font-size:12.5px; word-break:break-word;">${item.descripcion}</div>
      `;
    } else if (tipo === 'local') {
      titulo.textContent = `Soporte Gasto del Local: ${item.categoria}`;
      meta.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
          <strong>Categoría: ${item.categoria} • ${item.proveedor}</strong>
          <span style="color:#f59e0b; font-weight:700;">Total: ${this.formatearDinero(item.monto)}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted);">Recibo N°: <strong>${item.numeroFactura || 'S/N'}</strong> | Fecha: <strong>${item.fecha}</strong> | Pago: <strong>${item.metodoPago}</strong> | Estado: <strong>${item.estado || 'Pagado'}</strong></div>
        <div style="color:var(--text-main); margin-top:6px; font-size:12.5px; word-break:break-word;">${item.descripcion}</div>
      `;
    } else {
      titulo.textContent = `Comprobante de Nómina: ${item.trabajador}`;
      meta.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
          <strong>Colaborador: ${item.trabajador} (${item.cargo})</strong>
          <span style="color:var(--gold-primary); font-weight:700;">Neto Pagado: ${this.formatearDinero(item.neto)}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted);">Periodo: <strong>${item.periodo}</strong> | Fecha: <strong>${item.fecha}</strong> | Referencia: <strong>${item.referencia || 'N/A'}</strong></div>
        <div style="color:var(--text-muted); margin-top:4px; font-size:12px;">Básico: ${this.formatearDinero(item.sueldoBase)} | Bonos: ${this.formatearDinero(item.bonos)} | Deducciones: ${this.formatearDinero(item.deducciones)}</div>
      `;
    }

    const isPdf = item.reciboTipo && item.reciboTipo.includes('pdf');
    btnDescargar.href = item.reciboData;
    btnDescargar.download = item.reciboNombre || `recibo-noirda-${item.fecha}.${isPdf ? 'pdf' : 'png'}`;

    if (isPdf) {
      if (img) img.classList.add('hidden');
      if (pdfContainer) pdfContainer.classList.remove('hidden');
      if (pdfNombre) pdfNombre.textContent = item.reciboNombre || 'comprobante_soporte.pdf';
      if (pdfFrame) pdfFrame.src = item.reciboData;
      if (pdfLink) pdfLink.href = item.reciboData;
    } else {
      if (pdfContainer) pdfContainer.classList.add('hidden');
      if (pdfFrame) pdfFrame.src = '';
      if (img) {
        img.src = item.reciboData;
        img.classList.remove('hidden');
      }
    }

    modal.classList.add('active');
  },

  descargarReciboItem(tipo, id) {
    let item;
    if (tipo === 'compra') {
      item = this.compras.find(c => c.id === id);
    } else if (tipo === 'local') {
      item = (this.gastosLocal || []).find(l => l.id === id);
    } else {
      item = this.nomina.find(n => n.id === id);
    }
    if (!item || !item.reciboData) return;
    const a = document.createElement('a');
    a.href = item.reciboData;
    a.download = item.reciboNombre || `comprobante-noirda-${id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  // ===================================================================
  // GESTIÓN DE FORMULARIOS: COMPRA, NÓMINA Y LOCAL (TARJETAS COLAPSABLES)
  // ===================================================================
  toggleFormCard(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const isCollapsed = card.classList.contains('collapsed');
    const parentBody = card.closest('.modal-body');
    if (parentBody && isCollapsed) {
      parentBody.querySelectorAll('.form-collapse-card').forEach(c => {
        if (c.id !== cardId) c.classList.add('collapsed');
      });
      card.classList.remove('collapsed');
    } else {
      card.classList.toggle('collapsed');
    }
    this.actualizarResumenTarjetasForm();
  },

  toggleRecordRow(event, trEl) {
    if (!trEl) return;
    if (event && event.target && event.target.closest('button, a')) return;
    trEl.classList.toggle('expanded');
  },

  actualizarResumenTarjetasForm() {
    // Resumen Tarjetas Compra
    const prov = document.getElementById('compraProveedor')?.value.trim() || '';
    const montoC = parseFloat(document.getElementById('compraMonto')?.value) || 0;
    const metC = (document.getElementById('compraMetodoPago')?.value || 'Transferencia').split('/')[0].trim();
    const fechaC = document.getElementById('compraFecha')?.value || '';
    const sumDatosC = document.getElementById('summaryCompraDatos');
    const sumPagoC = document.getElementById('summaryCompraPago');
    const sumReciboC = document.getElementById('summaryCompraRecibo');

    if (sumDatosC) {
      sumDatosC.textContent = prov
        ? `${prov} • ${this.formatearDinero(montoC)}`
        : (montoC > 0 ? this.formatearDinero(montoC) : 'Datos principales');
    }
    if (sumPagoC) {
      sumPagoC.textContent = `${metC} • ${fechaC || 'Hoy'}`;
    }
    if (sumReciboC) {
      sumReciboC.textContent = this.reciboTempCompra ? '✅ Adjuntado' : 'Opcional';
    }

    // Resumen Tarjetas Gastos del Local
    const catL = document.getElementById('localCategoria')?.value || '';
    const provL = document.getElementById('localProveedor')?.value.trim() || '';
    const montoL = parseFloat(document.getElementById('localMonto')?.value) || 0;
    const metL = (document.getElementById('localMetodoPago')?.value || 'Transferencia').split('/')[0].trim();
    const fechaL = document.getElementById('localFecha')?.value || '';
    const sumDatosL = document.getElementById('summaryLocalDatos');
    const sumPagoL = document.getElementById('summaryLocalPago');
    const sumReciboL = document.getElementById('summaryLocalRecibo');

    if (sumDatosL) {
      const labelCat = catL && catL !== '__custom__' && catL !== '__custom_local__' ? catL : (provL || 'Categoría y valor');
      sumDatosL.textContent = montoL > 0 ? `${labelCat} • ${this.formatearDinero(montoL)}` : labelCat;
    }
    if (sumPagoL) {
      sumPagoL.textContent = `${metL} • ${fechaL || 'Hoy'}`;
    }
    if (sumReciboL) {
      sumReciboL.textContent = this.reciboTempLocal ? '✅ Adjuntado' : 'Opcional';
    }

    // Resumen Tarjetas Nómina
    const trab = document.getElementById('nominaTrabajador')?.value.trim() || '';
    const cargo = (document.getElementById('nominaCargo')?.value || '').split('/')[0].trim();
    const baseN = parseFloat(document.getElementById('nominaSueldoBase')?.value) || 0;
    const bonosN = parseFloat(document.getElementById('nominaBonos')?.value) || 0;
    const dedN = parseFloat(document.getElementById('nominaDeducciones')?.value) || 0;
    const netoN = Math.max(0, baseN + bonosN - dedN);
    const metN = (document.getElementById('nominaMetodoPago')?.value || 'Transferencia').split(' ')[0].trim();
    const fechaN = document.getElementById('nominaFecha')?.value || '';

    const sumTrabN = document.getElementById('summaryNominaTrabajador');
    const sumMontoN = document.getElementById('summaryNominaMonto');
    const sumExtrasN = document.getElementById('summaryNominaExtras');

    if (sumTrabN) {
      sumTrabN.textContent = trab ? `✅ ${trab} (${cargo})` : 'Seleccionar del equipo';
    }
    if (sumMontoN) {
      sumMontoN.textContent = this.formatearDinero(netoN);
    }
    if (sumExtrasN) {
      const recTxt = this.reciboTempNomina ? ' • ✅ Foto' : '';
      sumExtrasN.textContent = `${metN} • ${fechaN || 'Hoy'}${recTxt}`;
    }
  },

  abrirModalCompra(id = null) {
    const modal = document.getElementById('modalCompra');
    const form = document.getElementById('formCompra');
    form.reset();

    document.getElementById('compraId').value = '';
    document.getElementById('compraFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('compraNumeroFactura').value = '';
    document.getElementById('compraNotas').value = '';

    // Estado inicial de tarjetas colapsadas: 1 abierta, 2 y 3 colapsadas
    document.getElementById('cardCompraDatos')?.classList.remove('collapsed');
    document.getElementById('cardCompraPago')?.classList.add('collapsed');
    document.getElementById('cardCompraRecibo')?.classList.add('collapsed');
    
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

    this.actualizarResumenTarjetasForm();
    modal.classList.add('active');
  },

  abrirModalLocal(id = null) {
    const modal = document.getElementById('modalLocal');
    const form = document.getElementById('formLocal');
    if (!modal || !form) return;
    form.reset();

    document.getElementById('localId').value = '';
    document.getElementById('localFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('localNumeroFactura').value = '';
    document.getElementById('localNotas').value = '';
    document.getElementById('localEstado').value = 'Pagado';

    // Estado inicial de tarjetas colapsadas: 1 abierta, 2 y 3 colapsadas
    document.getElementById('cardLocalDatos')?.classList.remove('collapsed');
    document.getElementById('cardLocalPago')?.classList.add('collapsed');
    document.getElementById('cardLocalRecibo')?.classList.add('collapsed');

    // Quitar selección de chips rápidos
    document.querySelectorAll('#quickLocalChips .local-chip').forEach(btn => btn.classList.remove('active'));

    // Resetear campo personalizado
    const grupoPers = document.getElementById('grupoCategoriaLocalPersonalizada');
    if (grupoPers) grupoPers.classList.add('hidden');
    const inputPers = document.getElementById('localCategoriaPersonalizada');
    if (inputPers) inputPers.value = '';

    this.reciboTempLocal = null;
    this.actualizarPreviewRecibo('local', null);

    if (id) {
      const item = (this.gastosLocal || []).find(l => l.id === id);
      if (item) {
        document.getElementById('modalLocalTitulo').textContent = 'Editar Gasto del Local';
        document.getElementById('localId').value = item.id;
        document.getElementById('localFecha').value = item.fecha;
        document.getElementById('localNumeroFactura').value = item.numeroFactura || '';
        document.getElementById('localProveedor').value = item.proveedor;
        document.getElementById('localEstado').value = item.estado || 'Pagado';

        const selCat = document.getElementById('localCategoria');
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

        document.getElementById('localDescripcion').value = item.descripcion;
        document.getElementById('localMonto').value = item.monto;
        document.getElementById('localMetodoPago').value = item.metodoPago;
        document.getElementById('localNotas').value = item.notas || '';

        if (item.reciboData) {
          this.reciboTempLocal = {
            data: item.reciboData,
            nombre: item.reciboNombre,
            tipo: item.reciboTipo
          };
          this.actualizarPreviewRecibo('local', this.reciboTempLocal);
        }
      }
    } else {
      document.getElementById('modalLocalTitulo').textContent = 'Registrar Gasto del Local';
    }

    this.actualizarResumenTarjetasForm();
    modal.classList.add('active');
  },

  async guardarLocal(e) {
    e.preventDefault();
    const idVal = document.getElementById('localId').value;
    const fecha = document.getElementById('localFecha').value;
    const [anio, mes] = fecha.split('-');

    let categoriaSeleccionada = document.getElementById('localCategoria').value;
    if (categoriaSeleccionada === '__custom__' || categoriaSeleccionada === '__custom_local__') {
      const inputPers = document.getElementById('localCategoriaPersonalizada');
      const customVal = inputPers ? inputPers.value.trim() : '';
      if (!customVal) {
        this.mostrarToast('Por favor escribe el nombre de la categoría del local', 'error');
        return;
      }
      categoriaSeleccionada = customVal;

      if (!this.config.customLocalCategories) this.config.customLocalCategories = [];
      if (!this.config.customLocalCategories.includes(customVal)) {
        this.config.customLocalCategories.push(customVal);
        await this.guardarConfiguracion();
        this.actualizarOpcionesCategoriasLocal();
      }
    }

    const datosLocal = {
      fecha,
      anio: parseInt(anio),
      mes: mes,
      numeroFactura: document.getElementById('localNumeroFactura').value.trim(),
      proveedor: document.getElementById('localProveedor').value.trim(),
      categoria: categoriaSeleccionada,
      estado: document.getElementById('localEstado')?.value || 'Pagado',
      descripcion: document.getElementById('localDescripcion').value.trim(),
      monto: parseFloat(document.getElementById('localMonto').value) || 0,
      metodoPago: document.getElementById('localMetodoPago').value,
      reciboData: this.reciboTempLocal ? this.reciboTempLocal.data : null,
      reciboNombre: this.reciboTempLocal ? this.reciboTempLocal.nombre : '',
      reciboTipo: this.reciboTempLocal ? this.reciboTempLocal.tipo : '',
      notas: document.getElementById('localNotas').value.trim()
    };

    if (idVal) {
      datosLocal.id = parseInt(idVal);
    }

    await this.db.put('gastosLocal', datosLocal);
    await this.cargarDatos();
    this.renderTodo();
    this.cerrarModal('modalLocal');
    this.mostrarToast(idVal ? 'Gasto del local actualizado correctamente' : 'Gasto del local registrado con éxito', 'success');

    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }
  },

  abrirModalNomina(id = null) {
    const modal = document.getElementById('modalNomina');
    const form = document.getElementById('formNomina');
    form.reset();

    this.actualizarSelectorEmpleadosNomina();

    document.getElementById('nominaId').value = '';
    document.getElementById('nominaFecha').value = new Date().toISOString().split('T')[0];
    const mesActualNombre = this.obtenerNombreMes((new Date().getMonth() + 1).toString().padStart(2, '0'));
    document.getElementById('nominaPeriodo').value = `Mes ${mesActualNombre} ${new Date().getFullYear()}`;
    document.getElementById('nominaBonos').value = 0;
    document.getElementById('nominaDeducciones').value = 0;
    document.getElementById('nominaDocumento').value = '';
    document.getElementById('nominaWhatsapp').value = '';
    document.getElementById('nominaEmail').value = '';
    document.getElementById('nominaReferencia').value = '';
    document.getElementById('nominaNotas').value = '';

    // Estado inicial de tarjetas colapsadas en Nómina: 1 abierta, 2 y 3 colapsadas
    document.getElementById('cardNominaTrabajador')?.classList.remove('collapsed');
    document.getElementById('cardNominaLiquidacion')?.classList.add('collapsed');
    document.getElementById('cardNominaExtras')?.classList.add('collapsed');
    
    const modoSel = document.getElementById('nominaModoTiempo');
    if (modoSel) modoSel.value = 'fijo';
    this.actualizarModoTiempoNomina();

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
        document.getElementById('nominaDocumento').value = item.documento || '';
        document.getElementById('nominaWhatsapp').value = item.whatsapp || '';
        document.getElementById('nominaEmail').value = item.email || '';
        document.getElementById('nominaCargo').value = item.cargo;

        // En edición colapsamos trabajador y abrimos liquidación para ir directo a valores
        document.getElementById('cardNominaTrabajador')?.classList.add('collapsed');
        document.getElementById('cardNominaLiquidacion')?.classList.remove('collapsed');

        if (modoSel) {
          modoSel.value = item.modoTiempo || 'fijo';
          this.actualizarModoTiempoNomina();
        }
        if (item.cantidadTiempo) document.getElementById('nominaCantidadTiempo').value = item.cantidadTiempo;
        if (item.tarifaTiempo) document.getElementById('nominaTarifaTiempo').value = item.tarifaTiempo;

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

    this.actualizarResumenTarjetasForm();
    modal.classList.add('active');
  },

  calcularNetoNomina() {
    const base = parseFloat(document.getElementById('nominaSueldoBase').value) || 0;
    const bonos = parseFloat(document.getElementById('nominaBonos').value) || 0;
    const deducciones = parseFloat(document.getElementById('nominaDeducciones').value) || 0;
    const neto = Math.max(0, base + bonos - deducciones);
    document.getElementById('displayNetoCalculado').textContent = this.formatearDinero(neto);
    this.actualizarResumenTarjetasForm();
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

    const nombreTrabajador = document.getElementById('nominaTrabajador').value.trim();
    const docTrabajador = document.getElementById('nominaDocumento').value.trim();
    const telTrabajador = document.getElementById('nominaWhatsapp').value.trim();
    const emailTrabajador = document.getElementById('nominaEmail').value.trim();
    const cargoTrabajador = document.getElementById('nominaCargo').value;
    const modoTiempo = document.getElementById('nominaModoTiempo')?.value || 'fijo';
    const cantTiempo = parseFloat(document.getElementById('nominaCantidadTiempo')?.value) || 0;
    const tarifaTiempo = parseFloat(document.getElementById('nominaTarifaTiempo')?.value) || 0;

    // Abrir DIRECTAMENTE el chat de WhatsApp del número del empleado durante el gesto del usuario
    let telDirecto = (telTrabajador || '').replace(/\D/g, '');
    if (telDirecto.length === 10) telDirecto = '57' + telDirecto;
    const waUrlDirecto = telDirecto ? `https://api.whatsapp.com/send?phone=${telDirecto}` : `https://api.whatsapp.com/send`;
    let waVentana = null;
    try {
      waVentana = window.open(waUrlDirecto, '_blank');
    } catch (openErr) {
      console.warn('No se pudo pre-abrir ventana de WhatsApp:', openErr);
    }

    const periodoAuto = `Mes ${this.obtenerNombreMes(mes)} ${anio}`;
    const datosNomina = {
      fecha,
      anio: parseInt(anio),
      mes: mes,
      periodo: document.getElementById('nominaPeriodo').value.trim() || periodoAuto,
      trabajador: nombreTrabajador,
      documento: docTrabajador,
      whatsapp: telTrabajador,
      email: emailTrabajador,
      cargo: cargoTrabajador,
      modoTiempo,
      cantidadTiempo: cantTiempo,
      tarifaTiempo,
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

    // Auto-actualizar o agregar empleado si tiene teléfono
    if (telTrabajador) {
      const empExistente = this.empleados.find(e => e.nombre.toLowerCase() === nombreTrabajador.toLowerCase());
      if (!empExistente) {
        const nuevoEmp = {
          id: Date.now(),
          nombre: nombreTrabajador,
          documento: docTrabajador,
          telefono: telTrabajador,
          email: emailTrabajador,
          cargo: cargoTrabajador,
          tipoPago: modoTiempo,
          tarifa: tarifaTiempo || base,
          notas: ''
        };
        await this.db.put('empleados', nuevoEmp);
        this.empleados.push(nuevoEmp);
        localStorage.setItem('noirda_empleados', JSON.stringify(this.empleados));
      }
    }

    const savedId = await this.db.put('nomina', datosNomina);
    if (!datosNomina.id && savedId) datosNomina.id = savedId;
    await this.cargarDatos();
    this.renderTodo();
    this.cerrarModal('modalNomina');
    this.mostrarToast(idVal ? 'Pago de nómina actualizado' : 'Pago de nómina guardado con éxito. Generando comprobante en imagen para WhatsApp...', 'success');

    // Sincronizar automáticamente con GitHub si está activo
    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }

    // ENVIAR AUTOMÁTICAMENTE EL COMPROBANTE EN FORMATO DE IMAGEN A WHATSAPP
    const itemGuardado = this.nomina.find(n => n.id === datosNomina.id) || datosNomina;
    this.abrirComprobanteNomina(itemGuardado.id);
    await this.enviarWhatsappVoucher(itemGuardado, waVentana);
  },

  editarRegistro(tipo, id) {
    if (tipo === 'compra') {
      this.abrirModalCompra(id);
    } else if (tipo === 'local') {
      this.abrirModalLocal(id);
    } else {
      this.abrirModalNomina(id);
    }
  },

  async eliminarRegistro(tipo, id) {
    let nombre = 'este pago de nómina';
    if (tipo === 'compra') nombre = 'esta compra de mercancía';
    if (tipo === 'local') nombre = 'este gasto del local';
    if (!confirm(`¿Estás seguro de eliminar ${nombre}? Esta acción no se puede deshacer.`)) return;

    if (tipo === 'compra') {
      await this.db.delete('compras', id);
    } else if (tipo === 'local') {
      await this.db.delete('gastosLocal', id);
    } else {
      await this.db.delete('nomina', id);
    }

    await this.cargarDatos();
    this.renderTodo();
    this.mostrarToast('Registro eliminado correctamente', 'info');

    if (this.config.githubAutoSync && this.config.githubToken) {
      this.sincronizarConGithub(true);
    }
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
      } else if (tipo === 'local') {
        this.reciboTempLocal = objetoRecibo;
        this.actualizarPreviewRecibo('local', objetoRecibo);
      } else {
        this.reciboTempNomina = objetoRecibo;
        this.actualizarPreviewRecibo('nomina', objetoRecibo);
      }
      this.mostrarToast('Recibo adjuntado correctamente', 'success');
    };
    reader.readAsDataURL(file);
  },

  actualizarPreviewRecibo(tipo, recibo) {
    const mapIds = {
      compra: ['dropzoneCompraPrompt', 'previewCompraContainer', 'imgPreviewCompra', 'previewCompraNombre'],
      local: ['dropzoneLocalPrompt', 'previewLocalContainer', 'imgPreviewLocal', 'previewLocalNombre'],
      nomina: ['dropzoneNominaPrompt', 'previewNominaContainer', 'imgPreviewNomina', 'previewNominaNombre']
    };
    const [promptId, containerId, imgId, nameId] = mapIds[tipo] || mapIds.nomina;

    const prompt = document.getElementById(promptId);
    const container = document.getElementById(containerId);
    const img = document.getElementById(imgId);
    const nameSpan = document.getElementById(nameId);

    if (!prompt || !container) return;

    if (recibo && recibo.data) {
      prompt.classList.add('hidden');
      container.classList.remove('hidden');
      if (nameSpan) nameSpan.textContent = recibo.nombre || 'recibo_adjunto';

      if (img) {
        if (recibo.tipo && recibo.tipo.includes('pdf')) {
          img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23ef4444"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>';
        } else {
          img.src = recibo.data;
        }
      }
    } else {
      prompt.classList.remove('hidden');
      container.classList.add('hidden');
    }
    this.actualizarResumenTarjetasForm();
  },

  // ===================================================================
  // EXPORTACIÓN A EXCEL (.CSV) Y RESPALDO COMPLETO
  // ===================================================================
  exportarExcel(filtroPeriodo = true) {
    const comprasAExportar = filtroPeriodo ? this.filtrarPorPeriodo(this.compras) : this.compras;
    const localAExportar = filtroPeriodo ? this.filtrarPorPeriodo(this.gastosLocal || []) : (this.gastosLocal || []);
    const nominaAExportar = filtroPeriodo ? this.filtrarPorPeriodo(this.nomina) : this.nomina;

    let csv = '\uFEFF'; // UTF-8 BOM para acentos en Microsoft Excel
    csv += 'REPORTE FINANCIERO Y CONTABLE - NOIRDA OPULENCE\r\n';
    csv += `Propietario: Liam Varelas (Cel: 3045345642)\r\n`;
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

    // 2. Sección Gastos del Local
    csv += '--- GASTOS DEL LOCAL Y OPERACIÓN ---\r\n';
    csv += 'Fecha;Recibo N°;Categoría del Local;Proveedor / Empresa;Descripción del Gasto;Estado / Frecuencia;Monto ($ COP);Método de Pago;Tiene Recibo;Notas\r\n';

    let subtotalLocal = 0;
    localAExportar.forEach(l => {
      subtotalLocal += Number(l.monto || 0);
      csv += `"${l.fecha}";"${l.numeroFactura || ''}";"${l.categoria}";"${l.proveedor}";"${(l.descripcion || '').replace(/"/g, '""')}";"${l.estado || 'Pagado'}";${l.monto};"${l.metodoPago}";"${l.reciboData ? 'SÍ' : 'NO'}";"${(l.notas || '').replace(/"/g, '""')}"\r\n`;
    });
    csv += `;;;;;TOTAL GASTOS DEL LOCAL;${subtotalLocal};;;\r\n\r\n`;

    // 3. Sección Nómina
    csv += '--- NÓMINA DE TRABAJADORES ---\r\n';
    csv += 'Fecha Pago;Trabajador;Cargo;Periodo;Sueldo Base ($);Bonos/Comisiones ($);Deducciones ($);Neto Pagado ($);Medio Pago;Referencia;Tiene Recibo;Notas\r\n';
    
    let subtotalNomina = 0;
    nominaAExportar.forEach(n => {
      subtotalNomina += Number(n.neto || 0);
      csv += `"${n.fecha}";"${n.trabajador}";"${n.cargo}";"${n.periodo}";${n.sueldoBase};${n.bonos || 0};${n.deducciones || 0};${n.neto};"${n.metodoPago}";"${n.referencia || ''}";"${n.reciboData ? 'SÍ' : 'NO'}";"${(n.notas || '').replace(/"/g, '""')}"\r\n`;
    });
    csv += `;;;;;;;TOTAL NÓMINA;${subtotalNomina};;;;\r\n\r\n`;

    // 4. Gran Total
    csv += `;;;;GRAN TOTAL GASTOS CONSOLIDADOS;${subtotalCompras + subtotalLocal + subtotalNomina};;;;\r\n`;

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
      version: 2,
      fechaExportacion: new Date().toISOString(),
      config: this.config,
      empleados: this.empleados,
      compras: this.compras,
      gastosLocal: this.gastosLocal || [],
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
      await this.db.clear('gastosLocal');

      for (const c of backup.compras) await this.db.put('compras', c);
      for (const n of backup.nomina) await this.db.put('nomina', n);
      if (Array.isArray(backup.gastosLocal)) {
        for (const l of backup.gastosLocal) await this.db.put('gastosLocal', l);
      }

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
        marca: 'NOIRDA Opulence',
        propietario: 'Liam Varelas',
        telefono: '3045345642',
        moneda: this.config.currency || 'COP',
        logoData: this.config.logoData,
        customCategories: this.config.customCategories,
        customLocalCategories: this.config.customLocalCategories,
        ultimaActualizacion: new Date().toISOString(),
        empleados: this.empleados,
        compras: this.compras,
        gastosLocal: this.gastosLocal || [],
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
        const cantLocal = Array.isArray(data.gastosLocal) ? data.gastosLocal.length : 0;
        if (!confirm(`Se descargaron ${data.compras.length} compras, ${cantLocal} gastos del local y ${data.nomina.length} pagos de nómina desde GitHub. ¿Deseas actualizar tu sistema local con estos datos?`)) return;
      }

      await this.db.clear('compras');
      await this.db.clear('nomina');
      await this.db.clear('gastosLocal');

      for (const c of data.compras) await this.db.put('compras', c);
      for (const n of data.nomina) await this.db.put('nomina', n);
      if (Array.isArray(data.gastosLocal)) {
        for (const l of data.gastosLocal) await this.db.put('gastosLocal', l);
      }

      if (data.empleados && Array.isArray(data.empleados) && data.empleados.length > 0) {
        await this.db.clear('empleados');
        for (const e of data.empleados) await this.db.put('empleados', e);
      }

      // Sincronizar marca y logo si existen en GitHub
      this.config.brandName = 'NOIRDA Opulence';
      this.config.ownerName = 'Liam Varelas';
      this.config.ownerPhone = '3045345642';
      if (data.moneda) this.config.currency = data.moneda;
      if (data.logoData !== undefined && data.logoData !== null) this.config.logoData = data.logoData;
      if (data.customCategories) this.config.customCategories = data.customCategories;
      if (data.customLocalCategories) this.config.customLocalCategories = data.customLocalCategories;
      await this.guardarConfiguracion();

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
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      if (modalId === 'modalVisorRecibo') {
        const frame = document.getElementById('visorPdfFrame');
        if (frame) frame.src = '';
        const img = document.getElementById('visorImagen');
        if (img) img.src = '';
      }
    }
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

    document.getElementById('btnRapidoLocal')?.addEventListener('click', () => {
      this.cerrarModal('modalSelectorRapido');
      this.abrirModalLocal();
    });

    document.getElementById('btnRapidoNomina')?.addEventListener('click', () => {
      this.cerrarModal('modalSelectorRapido');
      this.abrirModalNomina();
    });

    document.getElementById('btnAbrirModalCompra')?.addEventListener('click', () => this.abrirModalCompra());
    document.getElementById('btnAbrirModalLocal')?.addEventListener('click', () => this.abrirModalLocal());
    document.getElementById('btnAbrirModalNomina')?.addEventListener('click', () => this.abrirModalNomina());

    // 4. Búsquedas reactivas
    document.getElementById('searchCompras')?.addEventListener('input', () => this.renderTablaCompras());
    document.getElementById('searchLocal')?.addEventListener('input', () => this.renderTablaLocal());
    document.getElementById('searchNomina')?.addEventListener('input', () => this.renderTablaNomina());

    // 5. Filtros de Galería de Recibos
    document.querySelectorAll('#filtroTipoRecibo .pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#filtroTipoRecibo .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderGaleriaRecibos(pill.getAttribute('data-type'));
      });
    });

    // 6. Envíos de Formulario y Validación en Tarjetas Colapsadas
    const formCompraEl = document.getElementById('formCompra');
    const formLocalEl = document.getElementById('formLocal');
    const formNominaEl = document.getElementById('formNomina');
    formCompraEl?.addEventListener('submit', (e) => this.guardarCompra(e));
    formLocalEl?.addEventListener('submit', (e) => this.guardarLocal(e));
    formNominaEl?.addEventListener('submit', (e) => this.guardarNomina(e));

    // Si algún campo requerido está dentro de una tarjeta colapsada al enviar, abrirla automáticamente
    [formCompraEl, formLocalEl, formNominaEl].forEach(formEl => {
      formEl?.addEventListener('invalid', (e) => {
        const card = e.target.closest('.form-collapse-card');
        if (card && card.classList.contains('collapsed')) {
          this.toggleFormCard(card.id);
        }
      }, true);
    });

    // Actualizar resúmenes en vivo de las tarjetas colapsables
    ['compraProveedor', 'compraMonto', 'compraMetodoPago', 'compraFecha',
     'localCategoria', 'localProveedor', 'localMonto', 'localMetodoPago', 'localFecha',
     'nominaTrabajador', 'nominaCargo', 'nominaMetodoPago', 'nominaFecha'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => this.actualizarResumenTarjetasForm());
      el?.addEventListener('change', () => this.actualizarResumenTarjetasForm());
    });

    document.getElementById('btnIrADirectorioPersonal')?.addEventListener('click', () => {
      this.cambiarPestana('empleados');
    });

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

    // Selector de categoría personalizada en gastos del local
    const selCatLocal = document.getElementById('localCategoria');
    const grpCatLocalPers = document.getElementById('grupoCategoriaLocalPersonalizada');
    const inCatLocalPers = document.getElementById('localCategoriaPersonalizada');
    selCatLocal?.addEventListener('change', (e) => {
      if (e.target.value === '__custom__' || e.target.value === '__custom_local__') {
        grpCatLocalPers?.classList.remove('hidden');
        inCatLocalPers?.focus();
      } else {
        grpCatLocalPers?.classList.add('hidden');
      }
    });

    // Filtros de Compras (Categoría, Proveedor, Fechas, Método de Pago)
    ['filtroCategoriaCompra', 'filtroMetodoPagoCompra', 'filtroFechaDesdeCompra', 'filtroFechaHastaCompra'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.renderTablaCompras());
    });
    document.getElementById('filtroProveedorCompra')?.addEventListener('input', () => this.renderTablaCompras());

    document.getElementById('btnLimpiarFiltrosCompras')?.addEventListener('click', () => {
      const cat = document.getElementById('filtroCategoriaCompra'); if (cat) cat.value = 'todas';
      const prov = document.getElementById('filtroProveedorCompra'); if (prov) prov.value = '';
      const fDesde = document.getElementById('filtroFechaDesdeCompra'); if (fDesde) fDesde.value = '';
      const fHasta = document.getElementById('filtroFechaHastaCompra'); if (fHasta) fHasta.value = '';
      const met = document.getElementById('filtroMetodoPagoCompra'); if (met) met.value = 'todos';
      this.renderTablaCompras();
      this.mostrarToast('Filtros de mercancía restablecidos', 'info');
    });

    document.getElementById('btnExportarComprasPDF')?.addEventListener('click', () => this.exportarComprasPDF());
    document.getElementById('btnEnviarComprasCorreo')?.addEventListener('click', () => this.enviarComprasCorreo());

    // Filtros y Exportaciones de Gastos del Local
    ['filtroCategoriaLocal', 'filtroEstadoLocal', 'filtroMetodoPagoLocal'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.renderTablaLocal());
    });

    document.getElementById('btnLimpiarFiltrosLocal')?.addEventListener('click', () => {
      this.grupoLocalActivo = 'todos';
      const cat = document.getElementById('filtroCategoriaLocal'); if (cat) cat.value = 'todas';
      const est = document.getElementById('filtroEstadoLocal'); if (est) est.value = 'todos';
      const met = document.getElementById('filtroMetodoPagoLocal'); if (met) met.value = 'todos';
      const s = document.getElementById('searchLocal'); if (s) s.value = '';
      this.renderTablaLocal();
      this.mostrarToast('Filtros de gastos del local restablecidos', 'info');
    });

    document.getElementById('btnExportarLocalPDF')?.addEventListener('click', () => this.exportarLocalPDF());
    document.getElementById('btnEnviarLocalCorreo')?.addEventListener('click', () => this.enviarLocalCorreo());

    // Selector de empleados en Nómina y Modo de Tiempo (Horas/Días)
    document.getElementById('nominaEmpleadoSelect')?.addEventListener('change', (e) => {
      const empId = parseInt(e.target.value);
      if (empId) {
        const emp = this.empleados.find(x => x.id === empId);
        if (emp) this.cargarDatosEmpleadoEnNomina(emp);
      }
    });

    document.getElementById('nominaModoTiempo')?.addEventListener('change', () => {
      this.actualizarModoTiempoNomina();
    });

    ['nominaCantidadTiempo', 'nominaTarifaTiempo'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.calcularSubtotalTiempo());
    });

    // Directorio de Personal / Empleados
    document.getElementById('btnAbrirModalEmpleado')?.addEventListener('click', () => this.abrirModalEmpleado());
    document.getElementById('formEmpleado')?.addEventListener('submit', (e) => this.guardarEmpleado(e));
    document.getElementById('searchEmpleados')?.addEventListener('input', () => this.renderEmpleados());

    // Acciones de Comprobante Oficial de Nómina
    document.getElementById('btnPrintComprobanteNomina')?.addEventListener('click', () => this.imprimirVoucher());
    document.getElementById('btnImprimirVoucherFinal')?.addEventListener('click', () => this.imprimirVoucher());
    document.getElementById('btnEnviarWhatsappVoucher')?.addEventListener('click', () => {
      const n = this.itemNominaActual;
      let tel = (n?.whatsapp || '').replace(/\D/g, '');
      if (!tel && n?.trabajador) {
        const emp = (this.empleados || []).find(e => e.nombre && e.nombre.toLowerCase().trim() === n.trabajador.toLowerCase().trim());
        if (emp && emp.telefono) tel = emp.telefono.replace(/\D/g, '');
      }
      if (tel.length === 10) tel = '57' + tel;
      const waUrl = tel ? `https://api.whatsapp.com/send?phone=${tel}` : `https://api.whatsapp.com/send`;
      let waVentana = null;
      try {
        waVentana = window.open(waUrl, '_blank');
      } catch (e) {}
      this.enviarWhatsappVoucher(n, waVentana);
    });
    document.getElementById('btnReabrirChatWhatsapp')?.addEventListener('click', () => {
      const n = this.itemNominaActual;
      let tel = (n?.whatsapp || '').replace(/\D/g, '');
      if (!tel && n?.trabajador) {
        const emp = (this.empleados || []).find(e => e.nombre && e.nombre.toLowerCase().trim() === n.trabajador.toLowerCase().trim());
        if (emp && emp.telefono) tel = emp.telefono.replace(/\D/g, '');
      }
      if (tel.length === 10) tel = '57' + tel;
      const waUrl = tel ? `https://api.whatsapp.com/send?phone=${tel}` : `https://api.whatsapp.com/send`;
      window.open(waUrl, '_blank');
    });
    document.getElementById('btnDescargarImagenVoucher')?.addEventListener('click', () => this.descargarImagenVoucher());
    document.getElementById('btnEnviarEmailVoucher')?.addEventListener('click', () => this.enviarEmailVoucher());

    // Pantalla de Bienvenida (Ingreso y Reingreso)
    document.getElementById('btnEntrarApp')?.addEventListener('click', () => this.cerrarBienvenida());
    document.getElementById('btnReabrirBienvenida')?.addEventListener('click', () => this.abrirBienvenida());
    document.getElementById('btnMobileBrandInfo')?.addEventListener('click', () => this.abrirBienvenida());

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

    // 8. Uploads de comprobantes (Compras, Local y Nómina)
    const inputReciboCompra = document.getElementById('compraArchivoRecibo');
    const inputCamaraCompra = document.getElementById('compraCamaraRecibo');
    const inputReciboLocal = document.getElementById('localArchivoRecibo');
    const inputCamaraLocal = document.getElementById('localCamaraRecibo');
    const inputReciboNomina = document.getElementById('nominaArchivoRecibo');
    const inputCamaraNomina = document.getElementById('nominaCamaraRecibo');

    document.getElementById('btnElegirArchivoCompra')?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputReciboCompra?.click();
    });
    document.getElementById('btnTomarFotoCompra')?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputCamaraCompra?.click();
    });
    document.getElementById('dropzoneCompra')?.addEventListener('click', (e) => {
      if (e.target.closest('#btnQuitarReciboCompra') || e.target.closest('button')) return;
      inputReciboCompra?.click();
    });

    inputReciboCompra?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'compra'));
    inputCamaraCompra?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'compra'));
    
    document.getElementById('btnQuitarReciboCompra')?.addEventListener('click', () => {
      this.reciboTempCompra = null;
      this.actualizarPreviewRecibo('compra', null);
    });

    document.getElementById('btnElegirArchivoLocal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputReciboLocal?.click();
    });
    document.getElementById('btnTomarFotoLocal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputCamaraLocal?.click();
    });
    document.getElementById('dropzoneLocal')?.addEventListener('click', (e) => {
      if (e.target.closest('#btnQuitarReciboLocal') || e.target.closest('button')) return;
      inputReciboLocal?.click();
    });

    inputReciboLocal?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'local'));
    inputCamaraLocal?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'local'));

    document.getElementById('btnQuitarReciboLocal')?.addEventListener('click', () => {
      this.reciboTempLocal = null;
      this.actualizarPreviewRecibo('local', null);
    });

    document.getElementById('btnElegirArchivoNomina')?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputReciboNomina?.click();
    });
    document.getElementById('btnTomarFotoNomina')?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputCamaraNomina?.click();
    });
    document.getElementById('dropzoneNomina')?.addEventListener('click', (e) => {
      if (e.target.closest('#btnQuitarReciboNomina') || e.target.closest('button')) return;
      inputReciboNomina?.click();
    });

    inputReciboNomina?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'nomina'));
    inputCamaraNomina?.addEventListener('change', (e) => this.procesarArchivoRecibo(e.target.files[0], 'nomina'));

    document.getElementById('btnQuitarReciboNomina')?.addEventListener('click', () => {
      this.reciboTempNomina = null;
      this.actualizarPreviewRecibo('nomina', null);
    });

    // 9. Personalización y Logo de Noirda (Optimizado y Persistente)
    const inputLogo = document.getElementById('inputLogoUpload');
    inputLogo?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxDim = 600;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedLogo = canvas.toDataURL('image/png', 0.92);

            this.config.logoData = optimizedLogo;
            await this.guardarConfiguracion();
            this.aplicarConfiguracionVisual();
            this.mostrarToast('Logotipo de Noirda guardado correctamente', 'success');

            if (this.config.githubAutoSync && this.config.githubToken) {
              this.sincronizarConGithub(true);
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('btnRestablecerLogo')?.addEventListener('click', async () => {
      this.config.logoData = null;
      await this.guardarConfiguracion();
      this.aplicarConfiguracionVisual();
      this.mostrarToast('Logotipo restablecido al isotipo oficial', 'info');

      if (this.config.githubAutoSync && this.config.githubToken) {
        this.sincronizarConGithub(true);
      }
    });

    document.getElementById('btnGuardarAjustesMarca')?.addEventListener('click', async () => {
      this.config.brandName = 'NOIRDA Opulence';
      this.config.ownerName = 'Liam Varelas';
      this.config.ownerPhone = '3045345642';
      this.config.currency = document.getElementById('inputMoneda')?.value || 'COP';
      await this.guardarConfiguracion();
      this.renderTodo();
      this.mostrarToast('Identidad oficial de NOIRDA Opulence guardada', 'success');

      if (this.config.githubAutoSync && this.config.githubToken) {
        this.sincronizarConGithub(true);
      }
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
    document.getElementById('toggleKpiLocal')?.addEventListener('change', (e) => {
      this.config.showKpiLocal = e.target.checked;
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
      this.establecerModoOscuro(e.target.checked);
    });

    // Gestión visual rápida de temas y Modo Claro / Oscuro
    document.getElementById('btnQuickToggleModo')?.addEventListener('click', () => this.alternarModoClaroOscuro());
    document.getElementById('btnModoOscuroCard')?.addEventListener('click', () => this.establecerModoOscuro(true));
    document.getElementById('btnModoClaroCard')?.addEventListener('click', () => this.establecerModoOscuro(false));

    // Botones de colores de temas (Topbar y Ajustes Theme Studio)
    document.querySelectorAll('.theme-dot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-theme-color');
        if (color) this.cambiarTemaColor(color);
      });
    });

    document.querySelectorAll('.color-theme-card:not(.custom-color-card)').forEach(card => {
      card.addEventListener('click', () => {
        const color = card.getAttribute('data-theme-color');
        if (color) this.cambiarTemaColor(color);
      });
    });

    const handleCustomColorInput = (e) => {
      const hex = e.target.value;
      if (hex) this.cambiarTemaColor('custom', hex);
    };
    document.getElementById('topbarCustomColorInput')?.addEventListener('input', handleCustomColorInput);
    document.getElementById('inputCustomThemeColor')?.addEventListener('input', handleCustomColorInput);

    // Exportación de Informe PDF Consolidado Anual
    document.getElementById('btnExportarConsolidadoAnualPDF')?.addEventListener('click', () => this.exportarConsolidadoAnualPDF(false));
    document.getElementById('btnExportarConsolidadoPeriodoPDF')?.addEventListener('click', () => this.exportarConsolidadoAnualPDF(true));
    document.getElementById('btnPrintReporteMensual')?.addEventListener('click', () => this.exportarConsolidadoAnualPDF(false));

    // Acciones para Gasto del Local Personalizado / Manual
    document.getElementById('btnAbrirModalLocalPersonalizado')?.addEventListener('click', () => this.abrirModalLocalPersonalizado());
    document.getElementById('chipGastoPersonalizadoLocal')?.addEventListener('click', () => this.activarGastoLocalPersonalizado());

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
        await this.db.clear('gastosLocal');
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
