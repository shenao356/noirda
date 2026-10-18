# NOIRDA - Control de Gastos y Contabilidad
**Propietario:** Santiago Varelas  
**Marca:** NOIRDA  

Sistema integral diseñado para la gestión organizada de compras de mercancía (ropa, telas, confección, insumos), pagos de nómina de colaboradores y archivo digital de recibos con soporte fotográfico.

---

## 🚀 Cómo Iniciar el Sistema

### 1. Forma Rápida (En tu Computador)
Simplemente haz **doble clic** en el archivo:
👉 `iniciar_servidor.bat`

Se abrirá automáticamente en tu navegador web predeterminado (`http://localhost:8000`).

---

## 📱 Cómo Usarlo Desde tu Celular o Tablet (En la Misma Red Wi-Fi)

1. Deja ejecutando `iniciar_servidor.bat` en tu computador.
2. En la ventana negra verás una dirección como:
   `http://192.168.1.XX:8000`
3. Abre esa dirección en el navegador de tu celular (Google Chrome en Android o Safari en iPhone/iPad).
4. **Instalar como App en tu celular:**
   - **En Android (Chrome):** Toca los 3 puntos de la esquina superior derecha y selecciona **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
   - **En iPhone (Safari):** Toca el botón de Compartir (el ícono del cuadrado con la flecha hacia arriba) y selecciona **"Agregar al inicio"**.
5. ¡Listo! Se abrirá como una aplicación nativa con su icono de **NOIRDA**, sin barras de navegador, adaptada a pantalla completa táctil.

---

## ✨ Funcionalidades Principales

### 1. 📦 Compras de Mercancía
- **Fecha de compra** y **N° de Factura**.
- **Proveedor / Distribuidor** (ej: Confecciones, Proveedores de Telas, Calzado, etc.).
- **Categorías especializadas:** Camisetas y Polos, Jeans y Pantalones, Chaquetas, Ropa Interior, Empaques, Telas, etc.
- **➕ Categoría Personalizada:** Selecciona *"➕ Otra categoría (Escribir personalizada)..."* y podrás escribir cualquier concepto (ej: *Bordados a mano*, *Herrajes y Cierres*, *Etiquetas doradas*). El sistema la recordará automáticamente para futuras compras.
- **Detalle de prendas** y **Monto pagado**.
- **Método de pago** (Bancolombia, Nequi, Daviplata, Efectivo en Caja, Crédito a proveedor).
- **Recibo / Factura Adjunta:** Toma la foto del recibo directamente con la cámara del celular o sube una imagen/PDF desde el PC.

### 2. 👥 Nómina y Pagos a Trabajadores
- **Nombre del colaborador** y **Cargo** (Vendedor, Administrador, Costurero/Modista, Cajero, etc.).
- **Periodo correspondiente** (ej: 1ra Quincena Octubre 2026).
- **Desglose salarial automático:**
  - Sueldo Básico
  - (+) Bonos o Comisiones por venta lograda
  - (-) Deducciones o anticipos
  - (=) **Neto Calculado Automáticamente**
- **Comprobante de pago o soporte firmado:** Adjunta la captura de la transferencia bancaria o soporte de entrega.

### 3. 📊 Consolidado Mensual y Analítica
- Filtro global por **Mes** y **Año**.
- Tarjetas de resumen en tiempo real:
  - **Gasto Total Consolidado**
  - **Total Compras de Mercancía** (% del mes)
  - **Total Nómina de Trabajadores** (% del mes)
  - **Total de Comprobantes Respaldados**
- **Gráficos interactivos:**
  - Histórico de barras comparativo (Mercancía vs Nómina en los últimos 6 meses).
  - Gráfico de dona con distribución de gastos por categoría.

### 4. 📂 Archivo Digital de Recibos
- Galería visual organizada con todos los recibos y facturas adjuntadas.
- Filtro por tipo: Compras o Nómina.
- Visor con **zoom**, botón para **descargar** e **imprimir soporte contable individual**.

### 5. 🎨 Personalización de Interfaz y Marca
En la pestaña **"Personalizar"** puedes:
- **Subir el Logotipo de NOIRDA:** Adjunta tu logo (PNG/JPG) y se actualizará automáticamente en el menú lateral, encabezados e impresiones.
- **Editar qué elementos deseas visualizar:** Activa o desactiva qué tarjetas de KPI y qué gráficos deseas ver en pantalla.
- **Alternar Tema:** Modo oscuro elegante *"Noir Luxury"* o tema claro.
- **Modificar Moneda y Nombres:** Personaliza si deseas ver COP ($), USD ($), EUR (€), etc.

### 6. 📑 Seguridad Contable y Reportes
- **Exportar a Excel (.CSV):** Genera el libro contable mensual listo para abrir en Microsoft Excel o Google Sheets con fórmulas y acentos limpios.
- **Imprimir Informe Mensual:** Genera un balance en formato PDF listo para archivar o entregar a tu contador.
- **Copia de Seguridad Completa (JSON):** Descarga una copia de todos tus registros con sus fotos incluidas con un solo clic. Puedes restaurarla en cualquier momento.

---

## 🌐 Cómo Subir este Proyecto a GitHub y Publicar la URL Web

### Paso 1: Crear el repositorio en GitHub
1. Entra a [github.com/new](https://github.com/new).
2. En **Repository name** escribe: `NOIRDA` (o el nombre que prefieras).
3. Selecciona **Public** (o Private si tienes GitHub Pro).
4. **No** marques "Add a README" (ya tenemos los archivos listos).
5. Haz clic en **Create repository**.

### Paso 2: Subir el código desde tu PC
Abre una terminal PowerShell en esta carpeta y ejecuta:
```bash
git remote add origin https://github.com/TU_USUARIO/NOIRDA.git
git push -u origin main
```
*(Reemplaza `TU_USUARIO` por tu usuario de GitHub).*

### Paso 3: Activar la URL Web Pública (GitHub Pages)
1. En tu repositorio en GitHub, ve a **Settings** (pestaña arriba a la derecha).
2. En el menú de la izquierda, entra a **Pages**.
3. En **Branch**, selecciona `main` y la carpeta `/(root)`.
4. Haz clic en **Save**.
5. En 1 minuto tendrás tu enlace mundial:
   👉 `https://TU_USUARIO.github.io/NOIRDA/`
   *(¡Puedes abrir este enlace desde tu celular o tablet en cualquier parte del mundo!)*

---

## ⚡ Cómo Funciona la Sincronización Automática con GitHub
Para que cada vez que registres un gasto desde la URL en tu celular o PC la información se actualice automáticamente en GitHub:
1. En GitHub ve a: **Settings > Developer Settings > Personal Access Tokens > Tokens (classic)** o entra directamente a: [github.com/settings/tokens](https://github.com/settings/tokens).
2. Genera un nuevo token con permiso marcado en **repo** y cópialo.
3. En tu app de Noirda, ve a la pestaña **"Personalizar"** y baja a la tarjeta **"Sincronización con GitHub"**:
   - Ingresa tu usuario de GitHub.
   - Ingresa el nombre del repositorio (`NOIRDA`).
   - Pega tu token.
   - Activa el interruptor: **"Auto-sincronizar en la nube"**.
4. Haz clic en **"Conectar y Subir Datos a GitHub"**.
5. ¡Listo! A partir de ese momento, cada compra o nómina que guardes creará automáticamente una actualización directa en el archivo `data/gastos.json` de tu repositorio en GitHub.

---
*NOIRDA © 2026 - Diseñado exclusivamente para Santiago Varelas.*
