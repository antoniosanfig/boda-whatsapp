// ==========================================
// SISTEMA INTEGRAL DE BODA (AUTOMÁTICO + PLAN B + RECEPCIÓN QR)
// Funciona conectado al servidor Node.js (local o nube) y también en modo autónomo en GitHub Pages
// ==========================================

const STORAGE_KEY = 'boda_sistema_integral_v2';
const API_URL_KEY = 'boda_backend_api_url';

// Determinar URL base del servidor Backend para Envío Automático
function resolveInitialApiBase() {
  const saved = localStorage.getItem(API_URL_KEY);
  if (saved) return saved.replace(/\/+$/, '');
  if (window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io')) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

let API_BASE = resolveInitialApiBase();
let backendOnline = false;
let allGuests = [];
let isSending = false;
let pollingInterval = null;
let teamAssignments = [];
let currentTeamMemberIndex = 0;
let customQrDataUrl = null;
let html5QrScanner = null;
let currentModalGuest = null;

// Elementos del DOM - Encabezado y Servidor
const waIndicator = document.getElementById('wa-indicator');
const waHeaderText = document.getElementById('wa-header-text');
const btnToggleServerConfig = document.getElementById('btn-toggle-server-config');
const serverConfigBar = document.getElementById('server-config-bar');
const inputApiUrl = document.getElementById('input-api-url');
const btnSaveApiUrl = document.getElementById('btn-save-api-url');
const navBtnMain = document.getElementById('nav-btn-main');
const navBtnRecepcion = document.getElementById('nav-btn-recepcion');
const viewMain = document.getElementById('view-main');
const viewRecepcion = document.getElementById('view-recepcion');

// Elementos - 1. WhatsApp QR
const waOfflineBanner = document.getElementById('wa-offline-banner');
const waConnectedBox = document.getElementById('wa-connected-box');
const waConnectedPhone = document.getElementById('wa-connected-phone');
const waQrBox = document.getElementById('wa-qr-box');
const waQrContainer = document.getElementById('wa-qr-container');
const btnWaRefresh = document.getElementById('btn-wa-refresh');
const btnWaLogout = document.getElementById('btn-wa-logout');

// Elementos - 2. QR Jardín
const qrModeRadios = document.querySelectorAll('input[name="qrMode"]');
const customQrUploadBox = document.getElementById('custom-qr-upload-box');
const inputQrImage = document.getElementById('input-qr-image');
const previewCustomQr = document.getElementById('preview-custom-qr');
const imgCustomQr = document.getElementById('img-custom-qr');
const btnRemoveQrImage = document.getElementById('btn-remove-qr-image');

// Elementos - 3. Excel y Lote de Prueba
const inputExcelFile = document.getElementById('input-excel-file');
const dropZoneExcel = document.getElementById('drop-zone-excel');
const btnDownloadTemplate = document.getElementById('btn-download-template');
const btnDownloadCurrentList = document.getElementById('btn-download-current-list');
const btnClearAllData = document.getElementById('btn-clear-all-data');
const inputTestBatchPhone = document.getElementById('input-test-batch-phone');
const selectTestBatchCount = document.getElementById('select-test-batch-count');
const btnLoadTestBatch = document.getElementById('btn-load-test-batch');
const testBatchFeedback = document.getElementById('test-batch-feedback');
const excelSummaryBox = document.getElementById('excel-summary-box');
const sumTotal = document.getElementById('sum-total');
const sumConNombre = document.getElementById('sum-con-nombre');
const sumSinNombre = document.getElementById('sum-sin-nombre');
const sumConTelefono = document.getElementById('sum-con-telefono');
const guestsTableBody = document.getElementById('guests-table-body');
const searchGuest = document.getElementById('search-guest');

// Elementos - 4. Plantillas y Prueba
const tabBtnPersonalizado = document.getElementById('tab-btn-personalizado');
const tabBtnGenerico = document.getElementById('tab-btn-generico');
const tabContentPersonalizado = document.getElementById('tab-content-personalizado');
const tabContentGenerico = document.getElementById('tab-content-generico');
const tplPersonalizado = document.getElementById('tpl-personalizado');
const tplGenerico = document.getElementById('tpl-generico');
const btnTogglePreview = document.getElementById('btn-toggle-preview');
const whatsappPreviewCard = document.getElementById('whatsapp-preview-card');
const previewWaQrImg = document.getElementById('preview-wa-qr-img');
const previewWaText = document.getElementById('preview-wa-text');
const testPhoneInput = document.getElementById('test-phone-input');
const testNameInput = document.getElementById('test-name-input');
const btnSendTest = document.getElementById('btn-send-test');
const testFeedback = document.getElementById('test-feedback');

// Elementos - 5. Envíos Automáticos y Supervisión
const selectSendTargetGroup = document.getElementById('select-send-target-group');
const selectDelay = document.getElementById('select-delay');
const inputCountry = document.getElementById('input-country');
const checkNotifySupervisor = document.getElementById('check-notify-supervisor');
const inputSupervisorPhone = document.getElementById('input-supervisor-phone');
const selectNotifyMode = document.getElementById('select-notify-mode');
const btnUseConnectedPhone = document.getElementById('btn-use-connected-phone');
const btnStartSending = document.getElementById('btn-start-sending');
const btnPauseSending = document.getElementById('btn-pause-sending');
const btnResumeSending = document.getElementById('btn-resume-sending');
const btnStopSending = document.getElementById('btn-stop-sending');
const btnRetryFailed = document.getElementById('btn-retry-failed');
const retryFailedCount = document.getElementById('retry-failed-count');
const btnResetSending = document.getElementById('btn-reset-sending');
const btnDownloadReport = document.getElementById('btn-download-report');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const progressCounts = document.getElementById('progress-counts');
const statSent = document.getElementById('stat-sent');
const statErrors = document.getElementById('stat-errors');
const statPending = document.getElementById('stat-pending');
const liveLogBox = document.getElementById('live-log-box');
const resultsTableBody = document.getElementById('results-table-body');

// Elementos - 6. Plan B
const btnExportPlanB = document.getElementById('btn-export-plan-b');
const selectTeamFilter = document.getElementById('select-team-filter');
const inputTeamMembers = document.getElementById('input-team-members');
const btnGenerateTeam = document.getElementById('btn-generate-team');
const btnTogglePlanbTemplates = document.getElementById('btn-toggle-planb-templates');
const planbTemplatesBox = document.getElementById('planb-templates-box');
const tabBtnPlanbPersonalizado = document.getElementById('tab-btn-planb-personalizado');
const tabBtnPlanbGenerico = document.getElementById('tab-btn-planb-generico');
const tabContentPlanbPersonalizado = document.getElementById('tab-content-planb-personalizado');
const tabContentPlanbGenerico = document.getElementById('tab-content-planb-generico');
const planbTplPersonalizado = document.getElementById('planb-tpl-personalizado');
const planbTplGenerico = document.getElementById('planb-tpl-generico');
const btnCopyMainTemplatesToPlanb = document.getElementById('btn-copy-main-templates-to-planb');
const teamTabsContainer = document.getElementById('team-tabs-container');
const teamTabsNav = document.getElementById('team-tabs-nav');
const teamCurrentMember = document.getElementById('team-current-member');
const teamMemberProgress = document.getElementById('team-member-progress');
const teamGuestsTableBody = document.getElementById('team-guests-table-body');
const teamEmptyState = document.getElementById('team-empty-state');

// Elementos - 7. Recepción QR y Modal
const btnStartScanner = document.getElementById('btn-start-scanner');
const btnStopScanner = document.getElementById('btn-stop-scanner');
const scanResultCard = document.getElementById('scan-result-card');
const statCheckedIn = document.getElementById('stat-checked-in');
const statPendingIn = document.getElementById('stat-pending-in');
const statPasesIn = document.getElementById('stat-pases-in');
const inputSearchDoor = document.getElementById('input-search-door');
const doorGuestsTbody = document.getElementById('door-guests-tbody');
const btnExportCheckin = document.getElementById('btn-export-checkin');

const qrModal = document.getElementById('qr-modal');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
const btnCloseQrModal2 = document.getElementById('btn-close-qr-modal-2');
const modalGuestName = document.getElementById('modal-guest-name');
const modalQrCanvas = document.getElementById('modal-qr-canvas');
const modalQrCustomImg = document.getElementById('modal-qr-custom-img');
const modalGuestPases = document.getElementById('modal-guest-pases');
const modalGuestMesa = document.getElementById('modal-guest-mesa');
const modalGuestCode = document.getElementById('modal-guest-code');
const btnDownloadQrImg = document.getElementById('btn-download-qr-img');

// ==========================================
// CONFIGURACIÓN DE SERVIDOR Y NAVEGACIÓN
// ==========================================
if (inputApiUrl) inputApiUrl.value = API_BASE;

btnToggleServerConfig.addEventListener('click', () => {
  serverConfigBar.classList.toggle('hidden');
});

btnSaveApiUrl.addEventListener('click', () => {
  const val = inputApiUrl.value.trim().replace(/\/+$/, '');
  if (val) {
    API_BASE = val;
    localStorage.setItem(API_URL_KEY, API_BASE);
    mostrarNotificacionToast(`Conectando con servidor: ${API_BASE}`);
    checkWhatsAppStatus();
    if (allGuests.length > 0) sincronizarInvitadosAlServidor();
  }
});

navBtnMain.addEventListener('click', () => {
  navBtnMain.className = 'px-3.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white shadow-xs transition-all';
  navBtnRecepcion.className = 'px-3.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
  viewMain.classList.remove('hidden');
  viewRecepcion.classList.add('hidden');
  detenerCamaraQR();
});

navBtnRecepcion.addEventListener('click', () => {
  navBtnRecepcion.className = 'px-3.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white shadow-xs transition-all';
  navBtnMain.className = 'px-3.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
  viewRecepcion.classList.remove('hidden');
  viewMain.classList.add('hidden');
  renderDoorTable();
});

// ==========================================
// 1. GESTIÓN DE ESTADO DE WHATSAPP (SERVIDOR)
// ==========================================
async function checkWhatsAppStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/wa-status`);
    const data = await res.json();
    backendOnline = true;
    waOfflineBanner.classList.add('hidden');

    if (data.status === 'connected') {
      waIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
      waHeaderText.textContent = `Conectado: ${data.userPhone || 'OK'}`;
      waConnectedPhone.textContent = `+${data.userPhone || 'Desconocido'}`;
      waConnectedBox.classList.remove('hidden');
      waQrBox.classList.add('hidden');

      if (inputSupervisorPhone && !inputSupervisorPhone.value && data.userPhone) {
        inputSupervisorPhone.value = String(data.userPhone).replace(/\D/g, '');
      }
    } else if (data.status === 'qr_ready' && data.qrDataUrl) {
      waIndicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
      waHeaderText.textContent = 'Esperando escaneo de QR';
      waConnectedBox.classList.add('hidden');
      waQrBox.classList.remove('hidden');
      waQrContainer.innerHTML = `<img src="${data.qrDataUrl}" alt="QR WhatsApp" class="w-full h-full object-contain p-1">`;
    } else if (data.status === 'connecting') {
      waIndicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
      waHeaderText.textContent = 'Conectando con WhatsApp...';
    } else {
      waIndicator.className = 'w-2.5 h-2.5 rounded-full bg-red-400';
      waHeaderText.textContent = 'WhatsApp Desconectado';
    }
  } catch (err) {
    backendOnline = false;
    waIndicator.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
    waHeaderText.textContent = 'Modo Web Autónomo (Sin servidor)';
    waOfflineBanner.classList.remove('hidden');
    waQrContainer.innerHTML = `<div class="text-xs text-slate-400 px-3">Inicia <b>iniciar.bat</b> o configura la URL del servidor en <b>⚙️ Servidor</b> para activar el código QR de envío automático.</div>`;
  }
}

setInterval(checkWhatsAppStatus, 3500);
checkWhatsAppStatus();

btnWaRefresh.addEventListener('click', checkWhatsAppStatus);

btnWaLogout.addEventListener('click', async () => {
  if (!confirm('¿Deseas desvincular este celular para conectar otro teléfono?')) return;
  try {
    waConnectedBox.classList.add('hidden');
    waQrBox.classList.remove('hidden');
    waQrContainer.innerHTML = '<div class="text-xs text-slate-400 animate-pulse">Generando nuevo QR...</div>';
    await fetch(`${API_BASE}/api/wa-logout`, { method: 'POST' });
    setTimeout(checkWhatsAppStatus, 1500);
  } catch (err) {
    alert('Error al desvincular: ' + err.message);
  }
});

if (btnUseConnectedPhone) {
  btnUseConnectedPhone.addEventListener('click', () => {
    const raw = waConnectedPhone.textContent.replace(/\D/g, '');
    if (raw) {
      inputSupervisorPhone.value = raw;
    } else {
      alert('Aún no hay un celular vinculado a WhatsApp.');
    }
  });
}

// ==========================================
// 2. CARGA Y PROCESAMIENTO DE EXCEL (SERVIDOR + NAVEGADOR)
// ==========================================
dropZoneExcel.addEventListener('click', () => inputExcelFile.click());

dropZoneExcel.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZoneExcel.classList.add('border-rose-400', 'bg-rose-50/30');
});

dropZoneExcel.addEventListener('dragleave', () => {
  dropZoneExcel.classList.remove('border-rose-400', 'bg-rose-50/30');
});

dropZoneExcel.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZoneExcel.classList.remove('border-rose-400', 'bg-rose-50/30');
  if (e.dataTransfer.files.length > 0) {
    procesarExcelHibrido(e.dataTransfer.files[0]);
  }
});

inputExcelFile.addEventListener('change', () => {
  if (inputExcelFile.files.length > 0) {
    procesarExcelHibrido(inputExcelFile.files[0]);
  }
});

// Limpiar símbolos (+, (, ), -, espacios, decimales .0, prefijos 001/0052) de cualquier teléfono
function limpiarTelefonoCliente(rawPhone) {
  if (rawPhone === null || rawPhone === undefined) return '';
  let str = String(rawPhone).trim();
  if (/^\d+\.0+$/.test(str)) {
    str = str.split('.')[0];
  }
  let digits = str.replace(/\D/g, '');
  if (digits.startsWith('001') && digits.length === 13) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0052') && (digits.length === 14 || digits.length === 15)) {
    digits = digits.slice(2);
  }
  return digits;
}

// Detectar si un teléfono es de México ('MX') o Estados Unidos ('US')
function detectarPaisCliente(rawPhone, defaultCountry = '52') {
  const digits = limpiarTelefonoCliente(rawPhone);
  if (!digits || digits.length < 10) return 'INVALID';
  if (digits.length === 11 && digits.startsWith('1')) return 'US';
  if ((digits.length === 12 && digits.startsWith('52')) || (digits.length === 13 && digits.startsWith('521'))) return 'MX';
  if (digits.length === 10) {
    return String(defaultCountry).replace(/\D/g, '') === '1' ? 'US' : 'MX';
  }
  return digits.startsWith('1') ? 'US' : 'MX';
}

async function procesarExcelHibrido(file) {
  // 1. Si el servidor está en línea, subirlo también al servidor para envíos automáticos
  if (backendOnline) {
    try {
      const formData = new FormData();
      formData.append('excelFile', file);
      const res = await fetch(`${API_BASE}/api/upload-excel`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.guests) {
        allGuests = data.guests;
        finalizarCargaInvitados(file.name);
        return;
      }
    } catch (e) {
      console.warn('Subida a servidor no disponible, procesando localmente en navegador...');
    }
  }

  // 2. Procesamiento directo en el navegador (funciona 100% en GitHub Pages)
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const bytes = new Uint8Array(e.target.result);
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rawData || rawData.length === 0) {
        alert('El archivo Excel está vacío.');
        return;
      }

      allGuests = rawData.map((row, index) => {
        const keys = Object.keys(row);
        const nombreKey = keys.find(k => /nombre|invitado|name|persona|contacto/i.test(k.trim()));
        const telefonoKey = keys.find(k => /telefono|teléfono|celular|cel|whatsapp|phone|movil|móvil|numero|número/i.test(k.trim()));
        const pasesKey = keys.find(k => /pases|pase|boletos|personas|cupo|lugares/i.test(k.trim()));
        const mesaKey = keys.find(k => /mesa|lugar|asiento|zona/i.test(k.trim()));
        const codigoKey = keys.find(k => /codigo|código|qr|id|folio|clave/i.test(k.trim()));

        const rawNombre = nombreKey ? String(row[nombreKey]).trim() : '';
        const rawTelefono = telefonoKey ? limpiarTelefonoCliente(row[telefonoKey]) : '';
        const pases = pasesKey && String(row[pasesKey]).trim() ? String(row[pasesKey]).trim().replace(/\.0+$/, '') : '1';
        const mesa = mesaKey && String(row[mesaKey]).trim() ? String(row[mesaKey]).trim() : '';
        const codigo = codigoKey && String(row[codigoKey]).trim()
          ? String(row[codigoKey]).trim()
          : `JARDIN-INV-${String(index + 1).padStart(3, '0')}`;

        const tieneNombre = rawNombre.length > 0 &&
          !['sin nombre', 'n/a', 'na', 'ninguno', 'invitado', 'generico'].includes(rawNombre.toLowerCase());

        return {
          id: index + 1,
          nombre: tieneNombre ? rawNombre : '',
          telefono: rawTelefono,
          pases,
          mesa,
          codigo,
          tipoMensaje: tieneNombre ? 'Personalizado' : 'Formal Genérico',
          estado: 'Pendiente',
          resultado: '',
          horaEnvio: ''
        };
      });

      finalizarCargaInvitados(file.name);
    } catch (err) {
      alert('Error al leer Excel: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Si se cargó localmente y luego se conecta el servidor, sincronizar directamente al servidor
async function sincronizarInvitadosAlServidor() {
  if (!backendOnline || allGuests.length === 0) return;
  try {
    await fetch(`${API_BASE}/api/sync-guests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guests: allGuests })
    });
  } catch (e) {}
}

function finalizarCargaInvitados(fileName) {
  const conNombre = allGuests.filter(g => g.nombre && g.nombre.trim().length > 0).length;
  const sinNombre = allGuests.length - conNombre;
  const conTelefono = allGuests.filter(g => g.telefono && String(g.telefono).replace(/\D/g, '').length >= 8).length;

  renderSummary({
    total: allGuests.length,
    conNombre,
    sinNombre,
    conTelefono
  });
  renderGuestsTable(allGuests);
  renderInitialResultsTable(allGuests);
  // Restaurar estados previos en la tabla de resultados si los hubiera
  const existingResults = allGuests
    .filter(g => g.estado === 'Enviado' || g.estado === 'Error')
    .map(g => ({
      id: g.id,
      nombre: g.nombre,
      telefono: g.telefono,
      pases: g.pases,
      estado: g.estado === 'Enviado' ? 'EXITOSO' : 'ERROR',
      motivo: g.motivo || (g.estado === 'Enviado' ? 'Entregado con QR' : 'Fallo'),
      hora: g.horaEnvio || '-'
    }));
  if (existingResults.length > 0) {
    updateResultsTable(existingResults);
    const enviados = allGuests.filter(g => g.estado === 'Enviado').length;
    const errores = allGuests.filter(g => g.estado === 'Error').length;
    statSent.textContent = enviados;
    statErrors.textContent = errores;
    statPending.textContent = Math.max(0, allGuests.length - enviados - errores);
  } else {
    statSent.textContent = '0';
    statErrors.textContent = '0';
    statPending.textContent = allGuests.length;
  }

  if (btnDownloadCurrentList) btnDownloadCurrentList.classList.remove('hidden');
  if (btnClearAllData) btnClearAllData.classList.remove('hidden');

  updatePreviewWhatsApp();
  renderDoorTable();
  guardarEstadoLocal();
  sincronizarInvitadosAlServidor();

  dropZoneExcel.innerHTML = `
    <div class="text-emerald-700 font-semibold text-xs flex items-center justify-center space-x-1.5">
      <span>✓ Archivo cargado exitosamente:</span>
      <b class="underline">${escapeHtml(fileName)}</b> (${allGuests.length} invitados)
    </div>
    <p class="text-[11px] text-slate-400 mt-1">Haz clic para cambiar de archivo</p>
  `;
}

function renderSummary(data) {
  excelSummaryBox.classList.remove('hidden');
  sumTotal.textContent = data.total || 0;
  sumConNombre.textContent = data.conNombre || 0;
  sumSinNombre.textContent = data.sinNombre || 0;
  sumConTelefono.textContent = data.conTelefono || 0;
  statPending.textContent = data.total || 0;
}

function renderGuestsTable(guests) {
  guestsTableBody.innerHTML = '';
  const defCountry = inputCountry ? inputCountry.value.trim() : '52';
  guests.forEach((g) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors cursor-pointer';
    const badgeClass = g.nombre
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : 'bg-amber-100 text-amber-800 border-amber-200';

    const cleanTel = limpiarTelefonoCliente(g.telefono);
    const pais = detectarPaisCliente(cleanTel, defCountry);
    let telHtml = '<span class="text-red-500">Sin teléfono</span>';
    if (cleanTel) {
      const flagBadge = pais === 'US'
        ? '<span class="inline-block mr-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-sans font-bold">🇺🇸 +1</span>'
        : (pais === 'MX'
          ? '<span class="inline-block mr-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-sans font-bold">🇲🇽 +52</span>'
          : '');
      telHtml = `${flagBadge}<span>${escapeHtml(cleanTel)}</span>`;
    }

    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-400 font-mono">${g.id}</td>
      <td class="px-3 py-2 font-medium text-slate-800">
        ${escapeHtml(g.nombre) || '<span class="italic text-slate-400">Sin nombre (Saludo formal)</span>'}
      </td>
      <td class="px-3 py-2 font-mono text-slate-600">${telHtml}</td>
      <td class="px-3 py-2 text-center font-semibold text-slate-700">${escapeHtml(g.pases || '1')}</td>
      <td class="px-3 py-2">
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}">
          ${g.nombre ? 'Personalizado' : 'Formal Genérico'}
        </span>
      </td>
    `;
    guestsTableBody.appendChild(tr);
  });
}

searchGuest.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allGuests.filter(g =>
    (g.nombre && g.nombre.toLowerCase().includes(q)) ||
    (g.telefono && g.telefono.includes(q))
  );
  renderGuestsTable(filtered);
});

// Descargar plantilla de Excel (ejemplo vacío de 3 filas)
btnDownloadTemplate.addEventListener('click', () => {
  const sample = [
    { Nombre: 'Lic. Roberto González y Familia', Telefono: '5512345678', Pases: 3, Mesa: 'Mesa 4', CodigoAcceso: 'BODA-RG-001' },
    { Nombre: 'Dra. Carmen Morales', Telefono: '5587654321', Pases: 2, Mesa: 'Mesa 2', CodigoAcceso: 'BODA-CM-002' },
    { Nombre: '', Telefono: '5598765432', Pases: 2, Mesa: 'Mesa 7', CodigoAcceso: 'BODA-GEN-003' }
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invitados');
  XLSX.writeFile(wb, 'Plantilla_Invitados_Boda.xlsx');
});

// Descargar la lista de invitados cargada actualmente en el sistema
if (btnDownloadCurrentList) {
  btnDownloadCurrentList.addEventListener('click', () => {
    if (!allGuests || allGuests.length === 0) {
      alert('No hay ninguna lista de invitados cargada en este momento.');
      return;
    }
    const rows = allGuests.map(g => ({
      Nombre: g.nombre || '',
      Telefono: g.telefono || '',
      Pases: g.pases || '1',
      Mesa: g.mesa || '',
      CodigoAcceso: g.codigo || '',
      EstadoEnvio: g.estado || 'Pendiente'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invitados_Actuales');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Lista_Invitados_Cargada_${allGuests.length}_registros_${fecha}.xlsx`);
    mostrarNotificacionToast(`💾 Descargada lista actual con ${allGuests.length} invitados.`);
  });
}

// Limpiar toda la lista de invitados y datos guardados
if (btnClearAllData) {
  btnClearAllData.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro de borrar la lista actual de invitados y todos los resultados guardados para dejar el sistema en cero?')) {
      return;
    }

    allGuests = [];
    teamAssignments = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

    if (backendOnline) {
      try { await fetch(`${API_BASE}/api/clear-all`, { method: 'POST' }); } catch (e) {}
    }

    excelSummaryBox.classList.add('hidden');
    btnDownloadCurrentList.classList.add('hidden');
    btnClearAllData.classList.add('hidden');
    if (btnRetryFailed) btnRetryFailed.classList.add('hidden');
    if (testBatchFeedback) testBatchFeedback.classList.add('hidden');
    if (teamTabsContainer) teamTabsContainer.classList.add('hidden');

    guestsTableBody.innerHTML = '';
    resultsTableBody.innerHTML = `<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">Carga tu archivo Excel en el paso 3 para ver la lista de seguimiento aquí.</td></tr>`;
    if (doorGuestsTbody) {
      doorGuestsTbody.innerHTML = `<tr><td colspan="4" class="px-3 py-8 text-center text-slate-400">Carga primero tu lista de invitados en la vista principal.</td></tr>`;
    }

    statSent.textContent = '0';
    statErrors.textContent = '0';
    statPending.textContent = '0';
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Progreso general: 0%';
    progressCounts.textContent = '0 / 0 procesados';
    liveLogBox.innerHTML = '<div class="text-slate-500">Esperando inicio de envíos...</div>';

    dropZoneExcel.innerHTML = `
      <div class="text-2xl mb-1">📂</div>
      <p class="text-xs font-semibold text-slate-700">Haz clic aquí o arrastra tu archivo Excel (.xlsx, .xls, .csv)</p>
      <p class="text-[11px] text-slate-400 mt-1">Columnas: <b>Nombre</b>, <b>Telefono</b>, <b>Pases</b>, <b>Mesa</b>, <b>CodigoAcceso</b></p>
    `;
    inputExcelFile.value = '';
    updatePreviewWhatsApp();
    mostrarNotificacionToast('🗑️ Lista y datos de envío limpiados por completo.');
  });
}

// Generador de Lote de Prueba (15-20 registros)
btnLoadTestBatch.addEventListener('click', async () => {
  const phone = inputTestBatchPhone.value.trim();
  const count = parseInt(selectTestBatchCount.value, 10) || 15;
  if (!phone) {
    testBatchFeedback.className = 'text-xs text-red-600 block';
    testBatchFeedback.textContent = '❌ Ingresa un número de teléfono para generar el lote de prueba.';
    return;
  }

  if (backendOnline) {
    try {
      const res = await fetch(`${API_BASE}/api/generate-test-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, count })
      });
      const data = await res.json();
      if (data.success && data.guests) {
        allGuests = data.guests;
        finalizarCargaInvitados(`Lote_Prueba_${count}.xlsx`);
        testBatchFeedback.className = 'text-xs text-emerald-800 font-semibold block';
        testBatchFeedback.textContent = `✅ Se cargaron ${data.total} invitaciones de prueba hacia ${phone}.`;
        return;
      }
    } catch (e) {}
  }

  // Fallback local si no hay servidor
  const nombresDemo = [
    'Lic. Roberto González y Familia', 'Dra. Carmen Morales', '', 'Ing. Alejandro Torres',
    'Familia Hernández Ruiz', '', 'Mtro. Jorge Luis Pineda', 'Sra. Patricia Vega',
    '', 'Arq. Fernando Mendoza', 'CP. Lucía Rivas y Esposo', '', 'Dr. Miguel Ángel Solís',
    'Familia Castro Domínguez', '', 'Lic. Sofía Villarreal', 'Sr. Ricardo Elizondo',
    '', 'Mtra. Gabriela Montes', 'Ing. Daniel Orozco'
  ];

  allGuests = Array.from({ length: count }, (_, idx) => {
    const rawNombre = nombresDemo[idx % nombresDemo.length];
    return {
      id: idx + 1,
      nombre: rawNombre,
      telefono: phone,
      pases: String((idx % 3) + 1),
      mesa: `Mesa ${(idx % 8) + 1}`,
      codigo: `JARDIN-TEST-${String(idx + 1).padStart(3, '0')}`,
      tipoMensaje: rawNombre ? 'Personalizado' : 'Formal Genérico',
      estado: 'Pendiente'
    };
  });

  finalizarCargaInvitados(`Lote_Prueba_${count}.xlsx`);
  testBatchFeedback.className = 'text-xs text-emerald-800 font-semibold block';
  testBatchFeedback.textContent = `✅ Se generaron ${count} invitaciones de prueba hacia ${phone}.`;
});

// ==========================================
// 3. OPCIONES DE QR DEL JARDÍN
// ==========================================
qrModeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      customQrUploadBox.classList.remove('hidden');
    } else {
      customQrUploadBox.classList.add('hidden');
    }
    updatePreviewWhatsApp();
  });
});

inputQrImage.addEventListener('change', async () => {
  if (inputQrImage.files.length === 0) return;
  const file = inputQrImage.files[0];

  const reader = new FileReader();
  reader.onload = (ev) => {
    customQrDataUrl = ev.target.result;
    imgCustomQr.src = customQrDataUrl;
    previewCustomQr.classList.remove('hidden');
    updatePreviewWhatsApp();
  };
  reader.readAsDataURL(file);

  if (backendOnline) {
    try {
      const formData = new FormData();
      formData.append('qrImage', file);
      await fetch(`${API_BASE}/api/upload-qr-image`, { method: 'POST', body: formData });
    } catch (e) {}
  }
});

btnRemoveQrImage.addEventListener('click', async () => {
  customQrDataUrl = null;
  previewCustomQr.classList.add('hidden');
  inputQrImage.value = '';
  if (backendOnline) {
    try { await fetch(`${API_BASE}/api/remove-qr-image`, { method: 'POST' }); } catch (e) {}
  }
  updatePreviewWhatsApp();
});

// ==========================================
// 4. PLANTILLAS Y VISTA PREVIA
// ==========================================
tabBtnPersonalizado.addEventListener('click', () => {
  tabBtnPersonalizado.className = 'pb-2 text-xs font-bold border-b-2 border-rose-600 text-rose-600 transition-colors';
  tabBtnGenerico.className = 'pb-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors';
  tabContentPersonalizado.classList.remove('hidden');
  tabContentGenerico.classList.add('hidden');
  updatePreviewWhatsApp();
});

tabBtnGenerico.addEventListener('click', () => {
  tabBtnGenerico.className = 'pb-2 text-xs font-bold border-b-2 border-rose-600 text-rose-600 transition-colors';
  tabBtnPersonalizado.className = 'pb-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors';
  tabContentGenerico.classList.remove('hidden');
  tabContentPersonalizado.classList.add('hidden');
  updatePreviewWhatsApp();
});

tplPersonalizado.addEventListener('input', () => {
  updatePreviewWhatsApp();
  guardarEstadoLocal();
});
tplGenerico.addEventListener('input', () => {
  updatePreviewWhatsApp();
  guardarEstadoLocal();
});

btnTogglePreview.addEventListener('click', () => {
  whatsappPreviewCard.classList.toggle('hidden');
  updatePreviewWhatsApp();
});

function updatePreviewWhatsApp() {
  const isPersonalizadoActive = !tabContentPersonalizado.classList.contains('hidden');
  const guest = allGuests[0] || {
    nombre: isPersonalizadoActive ? 'Lic. Roberto González y Familia' : '',
    pases: '2',
    mesa: 'Mesa 4',
    codigo: 'JARDIN-INV-001'
  };

  const msg = construirMensajeBase(guest, tplPersonalizado.value, tplGenerico.value);
  previewWaText.textContent = msg;

  const qrMode = document.querySelector('input[name="qrMode"]:checked').value;
  if (qrMode === 'custom' && customQrDataUrl) {
    previewWaQrImg.src = customQrDataUrl;
  } else {
    previewWaQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent('ACCESO-JARDIN-BODA-EJEMPLO')}`;
  }
}

// Enviar Mensaje de Prueba
btnSendTest.addEventListener('click', async () => {
  const phone = testPhoneInput.value.trim();
  const name = testNameInput.value.trim();
  if (!phone) {
    testFeedback.className = 'text-xs mt-2 text-red-600 block';
    testFeedback.textContent = '❌ Escribe tu número de teléfono para recibir la prueba.';
    return;
  }

  if (!backendOnline) {
    const mockGuest = { nombre: name, telefono: phone, pases: '2', mesa: 'Mesa de Honor', codigo: 'BODA-TEST-001' };
    const texto = construirMensajeBase(mockGuest, tplPersonalizado.value, tplGenerico.value);
    const link = generarEnlaceWhatsAppDirecto(phone, texto, inputCountry.value.trim() || '52');
    window.open(link, '_blank');
    testFeedback.className = 'text-xs mt-2 text-emerald-700 font-semibold block';
    testFeedback.textContent = '📲 Abriendo prueba en WhatsApp directamente.';
    return;
  }

  testFeedback.className = 'text-xs mt-2 text-amber-600 block animate-pulse';
  testFeedback.textContent = '⏳ Enviando prueba con QR a tu WhatsApp...';
  btnSendTest.disabled = true;

  try {
    const qrMode = document.querySelector('input[name="qrMode"]:checked').value;
    const defaultCountry = inputCountry.value.trim() || '52';
    const res = await fetch(`${API_BASE}/api/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testPhone: phone,
        testName: name,
        templatePersonalizado: tplPersonalizado.value,
        templateGenerico: tplGenerico.value,
        qrMode,
        customQrDataUrl,
        defaultCountry
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    testFeedback.className = 'text-xs mt-2 text-emerald-700 font-semibold block';
    testFeedback.textContent = '✅ ¡Prueba enviada con éxito! Revisa tu WhatsApp.';
  } catch (err) {
    testFeedback.className = 'text-xs mt-2 text-red-600 block';
    testFeedback.textContent = `❌ ${err.message}`;
  } finally {
    btnSendTest.disabled = false;
  }
});

// ==========================================
// 5. CONTROL DE ENVÍO AUTOMÁTICO Y MONITOREO EN VIVO
// ==========================================
function renderInitialResultsTable(guests) {
  resultsTableBody.innerHTML = '';
  guests.forEach((g) => {
    const tr = document.createElement('tr');
    tr.id = `row-result-${g.id}`;
    tr.className = 'hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="px-3 py-2 font-mono text-slate-400">${g.id}</td>
      <td class="px-3 py-2 font-medium text-slate-800">${escapeHtml(g.nombre) || '<i>Sin nombre (Formal)</i>'}</td>
      <td class="px-3 py-2 font-mono text-slate-600">${escapeHtml(g.telefono)}</td>
      <td class="px-3 py-2 text-center text-slate-700 font-semibold">${escapeHtml(g.pases || '1')}</td>
      <td class="px-3 py-2 text-center">
        <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 status-pill">
          Pendiente
        </span>
      </td>
      <td class="px-3 py-2 text-slate-500 font-mono time-cell">-</td>
      <td class="px-3 py-2 text-slate-500 detail-cell">-</td>
    `;
    resultsTableBody.appendChild(tr);
  });
}

function updateResultsTable(results, currentGuestId = null) {
  if (!resultsTableBody || !results || results.length === 0) return;

  results.forEach(item => {
    try {
      let row = document.getElementById(`row-result-${item.id}`);
      if (!row) {
        row = document.createElement('tr');
        row.id = `row-result-${item.id}`;
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
          <td class="px-3 py-2 font-mono text-slate-400">${item.id}</td>
          <td class="px-3 py-2 font-medium text-slate-800">${escapeHtml(item.nombre) || '<i>Sin nombre (Formal)</i>'}</td>
          <td class="px-3 py-2 font-mono text-slate-600">${escapeHtml(item.telefono)}</td>
          <td class="px-3 py-2 text-center text-slate-700 font-semibold">${escapeHtml(item.pases || '1')}</td>
          <td class="px-3 py-2 text-center">
            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 status-pill">
              Pendiente
            </span>
          </td>
          <td class="px-3 py-2 text-slate-500 font-mono time-cell">-</td>
          <td class="px-3 py-2 text-slate-500 detail-cell">-</td>
        `;
        if (resultsTableBody.children.length === 1 && resultsTableBody.children[0].querySelector('td[colspan]')) {
          resultsTableBody.innerHTML = '';
        }
        resultsTableBody.appendChild(row);
      }

      const statusPill = row.querySelector('.status-pill');
      const timeCell = row.querySelector('.time-cell');
      const detailCell = row.querySelector('.detail-cell');

      if (item.estado === 'EXITOSO') {
        row.classList.remove('bg-amber-50/70');
        if (statusPill) {
          statusPill.className = 'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800';
          statusPill.textContent = 'Enviado ✓';
        }
        if (timeCell) timeCell.textContent = item.hora || '';
        if (detailCell) detailCell.innerHTML = '<span class="text-emerald-700 font-medium">Entregado con QR</span>';
      } else if (item.estado === 'ERROR') {
        row.classList.remove('bg-amber-50/70');
        if (statusPill) {
          statusPill.className = 'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800';
          statusPill.textContent = 'Error ✕';
        }
        if (timeCell) timeCell.textContent = item.hora || '';
        if (detailCell) detailCell.innerHTML = `<span class="text-red-600 font-medium">${escapeHtml(item.motivo || 'Fallo de entrega')}</span>`;
      }
    } catch (e) {}
  });

  if (currentGuestId) {
    try {
      const currentRow = document.getElementById(`row-result-${currentGuestId}`);
      if (currentRow) {
        const pill = currentRow.querySelector('.status-pill');
        if (pill && pill.textContent.includes('Pendiente')) {
          pill.className = 'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 animate-pulse';
          pill.textContent = 'Enviando... ⏳';
          currentRow.classList.add('bg-amber-50/70');
        }
      }
    } catch (e) {}
  }
}

btnStartSending.addEventListener('click', async () => {
  if (allGuests.length === 0) {
    alert('Primero debes subir tu archivo Excel con la lista de invitados.');
    return;
  }

  if (!backendOnline) {
    alert('Para el Envío Automático necesitas tener conectado el servidor (iniciar.bat en tu PC o tu URL de servidor en el botón "⚙️ Servidor" arriba).\n\nSi no tienes servidor activo ahora mismo, puedes usar la sección "6. Plan B: Envío en Equipo" aquí abajo.');
    return;
  }

  await sincronizarInvitadosAlServidor();

  const qrMode = document.querySelector('input[name="qrMode"]:checked').value;
  const delaySeconds = parseInt(selectDelay.value, 10) || 7;
  const defaultCountry = inputCountry.value.trim() || '52';
  const targetGroup = selectSendTargetGroup ? selectSendTargetGroup.value : 'pending_all';
  const notifySupervisor = checkNotifySupervisor ? checkNotifySupervisor.checked : false;
  const supervisorPhone = inputSupervisorPhone ? inputSupervisorPhone.value.trim() : '';
  const notifyMode = selectNotifyMode ? selectNotifyMode.value : 'errors_only';

  // Calcular cuántos invitados corresponden a esta tanda para informar al usuario
  let countToSend = allGuests.length;
  let labelGrupo = 'toda la lista';
  if (targetGroup === 'pending_mx') {
    countToSend = allGuests.filter(g => g.estado !== 'Enviado' && detectarPaisCliente(g.telefono, defaultCountry) === 'MX').length;
    labelGrupo = 'México (+52) pendientes';
  } else if (targetGroup === 'pending_us') {
    countToSend = allGuests.filter(g => g.estado !== 'Enviado' && detectarPaisCliente(g.telefono, defaultCountry) === 'US').length;
    labelGrupo = 'Estados Unidos (+1) pendientes';
  } else if (targetGroup === 'pending_all') {
    countToSend = allGuests.filter(g => g.estado !== 'Enviado').length;
    labelGrupo = 'invitados pendientes/faltantes';
  }

  if (countToSend === 0) {
    alert(`No hay invitados pendientes en el grupo seleccionado (${labelGrupo}). Si deseas volver a enviar desde cero, usa el botón "🧹 Limpiar Resultados de Envío" o elige "🔄 Toda la lista desde cero".`);
    return;
  }

  const confirmMsg = `¿Deseas iniciar el envío automático a ${countToSend} invitado(s) (${labelGrupo})?`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`${API_BASE}/api/start-sending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guests: allGuests,
        templatePersonalizado: tplPersonalizado.value,
        templateGenerico: tplGenerico.value,
        qrMode,
        customQrDataUrl,
        delaySeconds,
        defaultCountry,
        targetGroup,
        notifySupervisor,
        supervisorPhone,
        notifyMode
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    setSendingUIState(true);
    startProgressPolling();
  } catch (err) {
    alert('Error al iniciar envíos: ' + err.message);
  }
});

btnPauseSending.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/api/pause-sending`, { method: 'POST' });
    btnPauseSending.classList.add('hidden');
    btnResumeSending.classList.remove('hidden');
  } catch (e) {}
});

btnResumeSending.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/api/resume-sending`, { method: 'POST' });
    btnResumeSending.classList.add('hidden');
    btnPauseSending.classList.remove('hidden');
  } catch (e) {}
});

btnStopSending.addEventListener('click', async () => {
  if (!confirm('¿Estás seguro de cancelar el resto de los envíos?')) return;
  try {
    await fetch(`${API_BASE}/api/stop-sending`, { method: 'POST' });
    setSendingUIState(false);
  } catch (e) {}
});

if (btnRetryFailed) {
  btnRetryFailed.addEventListener('click', async () => {
    const qrMode = document.querySelector('input[name="qrMode"]:checked').value;
    const delaySeconds = parseInt(selectDelay.value, 10) || 7;
    const defaultCountry = inputCountry.value.trim() || '52';
    const notifySupervisor = checkNotifySupervisor ? checkNotifySupervisor.checked : false;
    const supervisorPhone = inputSupervisorPhone ? inputSupervisorPhone.value.trim() : '';
    const notifyMode = selectNotifyMode ? selectNotifyMode.value : 'errors_only';

    try {
      const res = await fetch(`${API_BASE}/api/retry-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templatePersonalizado: tplPersonalizado.value,
          templateGenerico: tplGenerico.value,
          qrMode,
          delaySeconds,
          defaultCountry,
          notifySupervisor,
          supervisorPhone,
          notifyMode
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      btnRetryFailed.classList.add('hidden');
      setSendingUIState(true);
      startProgressPolling();
    } catch (err) {
      alert('Error al reintentar fallidos: ' + err.message);
    }
  });
}

function setSendingUIState(sending) {
  isSending = sending;
  btnStartSending.disabled = sending;
  btnPauseSending.disabled = !sending;
  btnResumeSending.disabled = !sending;
  btnStopSending.disabled = !sending;

  if (sending) {
    btnStartSending.classList.add('opacity-50', 'cursor-not-allowed');
    btnPauseSending.classList.remove('hidden');
    btnResumeSending.classList.add('hidden');
  } else {
    btnStartSending.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

function startProgressPolling() {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/send-progress`);
      const data = await res.json();

      statSent.textContent = data.sentCount;
      statErrors.textContent = data.errorCount;
      statPending.textContent = data.pendingCount;

      const total = data.total || allGuests.length || 1;
      const procesados = data.sentCount + data.errorCount;
      const pct = Math.min(100, Math.round((procesados / total) * 100));

      progressBar.style.width = `${pct}%`;
      progressLabel.textContent = `Progreso: ${pct}%`;
      progressCounts.textContent = `${procesados} / ${total} procesados`;

      if (data.logs && data.logs.length > 0) {
        liveLogBox.innerHTML = data.logs.map(log => `<div>${escapeHtml(log)}</div>`).join('');
        liveLogBox.scrollTop = liveLogBox.scrollHeight;
      }

      if (data.results && data.results.length > 0) {
        updateResultsTable(data.results, data.currentGuestId);
        data.results.forEach(resItem => {
          const g = allGuests.find(x => x.id === resItem.id);
          if (g) {
            g.estado = resItem.estado === 'EXITOSO' ? 'Enviado' : 'Error';
            g.motivo = resItem.motivo;
            g.horaEnvio = resItem.hora;
          }
        });
        guardarEstadoLocal();
      }

      if (!data.isRunning && procesados > 0 && procesados >= total) {
        clearInterval(pollingInterval);
        setSendingUIState(false);
        progressBar.style.width = '100%';
        progressLabel.textContent = '¡Envío completado!';

        if (btnRetryFailed && data.errorCount > 0) {
          retryFailedCount.textContent = data.errorCount;
          btnRetryFailed.classList.remove('hidden');
        }
      }
    } catch (err) {}
  }, 1500);
}

// Reiniciar resultados de envío (dejar invitados en Pendiente sin borrar la lista)
if (btnResetSending) {
  btnResetSending.addEventListener('click', async () => {
    if (allGuests.length === 0) {
      alert('No hay invitados cargados actualmente.');
      return;
    }
    if (!confirm('¿Deseas limpiar los resultados de envío, contadores y bitácora para regresar a todos los invitados al estado "Pendiente"?')) {
      return;
    }

    if (backendOnline) {
      try { await fetch(`${API_BASE}/api/reset-sending`, { method: 'POST' }); } catch (e) {}
    }

    allGuests.forEach(g => {
      g.estado = 'Pendiente';
      g.resultado = '';
      g.motivo = '';
      g.horaEnvio = '';
    });

    statSent.textContent = '0';
    statErrors.textContent = '0';
    statPending.textContent = allGuests.length;
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Progreso general: 0%';
    progressCounts.textContent = `0 / ${allGuests.length} procesados`;
    liveLogBox.innerHTML = '<div class="text-slate-500">Resultados limpiados. Listo para nuevo envío...</div>';
    if (btnRetryFailed) btnRetryFailed.classList.add('hidden');

    renderInitialResultsTable(allGuests);
    guardarEstadoLocal();
    sincronizarInvitadosAlServidor();
    mostrarNotificacionToast('🧹 Resultados reiniciados a Pendiente.');
  });
}

// Descargar Reporte de Envíos (siempre sincronizado con los invitados en pantalla)
btnDownloadReport.addEventListener('click', async () => {
  if (allGuests.length === 0) {
    alert('No hay invitados cargados para generar el reporte.');
    return;
  }

  // Generar directamente desde la lista actual en memoria para garantizar que nunca salga vacío ni desincronizado
  const rows = allGuests.map((g, idx) => ({
    'No.': idx + 1,
    'Nombre del Invitado': g.nombre || '(Sin nombre - Mensaje formal)',
    'Teléfono': g.telefono || '-',
    'Pases': g.pases || '1',
    'Mesa': g.mesa || '-',
    'Código QR': g.codigo || '-',
    'Tipo de Invitación': g.tipoMensaje || (g.nombre ? 'Personalizado' : 'Formal Genérico'),
    'Estado de Envío': g.estado || 'Pendiente',
    'Motivo o Detalle': g.motivo || g.resultado || (g.estado === 'Enviado' ? 'Entregado con QR' : '-'),
    'Hora de Envío': g.horaEnvio || '-'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 32 },
    { wch: 18 },
    { wch: 8 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 28 },
    { wch: 15 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Envíos');
  XLSX.writeFile(wb, `Reporte_Invitaciones_Boda_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// ==========================================
// 6. PLAN B: DISTRIBUCIÓN Y ENVÍO EN EQUIPO
// ==========================================
function inicializarPlantillasPlanB() {
  if (planbTplPersonalizado && tplPersonalizado && !planbTplPersonalizado.value) {
    planbTplPersonalizado.value = tplPersonalizado.value;
  }
  if (planbTplGenerico && tplGenerico && !planbTplGenerico.value) {
    planbTplGenerico.value = tplGenerico.value;
  }
}
setTimeout(inicializarPlantillasPlanB, 250);

btnTogglePlanbTemplates.addEventListener('click', () => {
  planbTemplatesBox.classList.toggle('hidden');
  btnTogglePlanbTemplates.textContent = planbTemplatesBox.classList.contains('hidden')
    ? '✏️ Mostrar Editor de Plantilla'
    : 'Ocultar Editor de Plantilla';
});

tabBtnPlanbPersonalizado.addEventListener('click', () => {
  tabBtnPlanbPersonalizado.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white shadow-2xs';
  tabBtnPlanbGenerico.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100';
  tabContentPlanbPersonalizado.classList.remove('hidden');
  tabContentPlanbGenerico.classList.add('hidden');
});

tabBtnPlanbGenerico.addEventListener('click', () => {
  tabBtnPlanbGenerico.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white shadow-2xs';
  tabBtnPlanbPersonalizado.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100';
  tabContentPlanbGenerico.classList.remove('hidden');
  tabContentPlanbPersonalizado.classList.add('hidden');
});

btnCopyMainTemplatesToPlanb.addEventListener('click', () => {
  if (confirm('¿Restablecer el texto del Plan B con el contenido de las plantillas principales?')) {
    planbTplPersonalizado.value = tplPersonalizado.value;
    planbTplGenerico.value = tplGenerico.value;
    mostrarNotificacionToast('Plantillas del Plan B restablecidas.');
  }
});

function construirMensajeBase(guest, tplPers, tplGen) {
  const tieneNombre = Boolean(
    guest.nombre &&
    String(guest.nombre).trim().length > 0 &&
    !['sin nombre', '(sin nombre especificado)', 'n/a', 'ninguno', 'generico', 'invitado'].includes(String(guest.nombre).trim().toLowerCase())
  );

  const plantillaBase = tieneNombre ? tplPers : tplGen;
  const detallePases = guest.pases && String(guest.pases) !== '1'
    ? `🎟 Pases incluidos: ${guest.pases} accesos`
    : `🎟 Pase válido para su acceso personal`;
  const detalleMesa = guest.mesa
    ? `🪑 Mesa asignada: ${guest.mesa}`
    : '';

  const texto = plantillaBase
    .replace(/\{nombre\}/gi, guest.nombre || 'Distinguido/a Invitado/a')
    .replace(/\{pases\}/gi, String(guest.pases || '1'))
    .replace(/\{detalle_pases\}/gi, detallePases)
    .replace(/\{mesa\}/gi, guest.mesa || 'General')
    .replace(/\{detalle_mesa\}/gi, detalleMesa)
    .replace(/\{codigo\}/gi, guest.codigo || '');

  return texto.replace(/\n{3,}/g, '\n\n').trim();
}

function construirMensajeInvitadoPlanB(guest) {
  const tplPers = (planbTplPersonalizado && planbTplPersonalizado.value.trim())
    ? planbTplPersonalizado.value
    : tplPersonalizado.value;
  const tplGen = (planbTplGenerico && planbTplGenerico.value.trim())
    ? planbTplGenerico.value
    : tplGenerico.value;
  return construirMensajeBase(guest, tplPers, tplGen);
}

function generarEnlaceWhatsAppDirecto(rawPhone, mensaje, defaultCountry = '52') {
  let digits = limpiarTelefonoCliente(rawPhone);
  const cleanCountry = String(defaultCountry || '52').replace(/\D/g, '') || '52';
  // Si tiene 10 dígitos sin código de país, anteponer el país predeterminado (52 o 1).
  // Si ya tiene 11 dígitos empezando con 1 (EE.UU.) o 12/13 empezando con 52 (México), se respeta tal cual.
  if (digits.length === 10) {
    digits = cleanCountry + digits;
  }
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(mensaje)}`;
}

btnGenerateTeam.addEventListener('click', async () => {
  if (allGuests.length === 0) {
    alert('Primero debes subir tu lista de invitados en Excel.');
    return;
  }

  if (backendOnline) {
    try {
      const res = await fetch(`${API_BASE}/api/send-progress`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        data.results.forEach(resItem => {
          const g = allGuests.find(x => x.id === resItem.id);
          if (g) {
            g.estado = resItem.estado === 'EXITOSO' ? 'Enviado' : 'Error';
            g.motivo = resItem.motivo;
          }
        });
      }
    } catch (e) {}
  }

  const filtro = selectTeamFilter.value;
  let listaFiltrada = [];

  if (filtro === 'errors') {
    listaFiltrada = allGuests.filter(g => g.estado === 'Error');
    if (listaFiltrada.length === 0) {
      alert('No se encontraron invitados con error. Selecciona "Todos los invitados" o "Solo Pendientes".');
      return;
    }
  } else if (filtro === 'pending') {
    listaFiltrada = allGuests.filter(g => g.estado !== 'Enviado');
    if (listaFiltrada.length === 0) {
      alert('Todos los invitados ya figuran como enviados. Selecciona "Todos los invitados".');
      return;
    }
  } else {
    listaFiltrada = [...allGuests];
  }

  const rawMembers = inputTeamMembers.value.split(',').map(s => s.trim()).filter(Boolean);
  const colaboradores = rawMembers.length > 0 ? rawMembers : ['Colaborador 1', 'Colaborador 2'];
  const defaultCountry = inputCountry.value.trim() || '52';

  teamAssignments = colaboradores.map(nombre => ({
    collaborator: nombre,
    guests: []
  }));

  listaFiltrada.forEach((g, idx) => {
    const colabIdx = idx % colaboradores.length;
    const mensaje = construirMensajeInvitadoPlanB(g);
    const waLink = generarEnlaceWhatsAppDirecto(g.telefono, mensaje, defaultCountry);

    teamAssignments[colabIdx].guests.push({
      id: g.id,
      nombre: g.nombre,
      telefono: g.telefono,
      pases: g.pases || '1',
      mesa: g.mesa || 'General',
      codigo: g.codigo,
      mensaje,
      waLink,
      enviadoManual: Boolean(g.enviadoManual)
    });
  });

  currentTeamMemberIndex = 0;
  teamEmptyState.classList.add('hidden');
  teamTabsContainer.classList.remove('hidden');
  btnExportPlanB.classList.remove('hidden');

  renderTeamTabs();
  renderTeamGuestsTable(0);
  guardarEstadoLocal();
  mostrarNotificacionToast(`¡Lista dividida entre ${colaboradores.length} colaboradores!`);
});

function renderTeamTabs() {
  teamTabsNav.innerHTML = '';
  teamAssignments.forEach((asig, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = idx === currentTeamMemberIndex;
    const count = asig.guests.length;
    const completed = asig.guests.filter(g => g.enviadoManual).length;

    btn.className = `px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
      isActive
        ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-200'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
    }`;
    btn.innerHTML = `
      <span>👤 ${escapeHtml(asig.collaborator)}</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-rose-800 text-rose-100' : 'bg-slate-200 text-slate-700'}">
        ${completed}/${count}
      </span>
    `;
    btn.addEventListener('click', () => {
      currentTeamMemberIndex = idx;
      renderTeamTabs();
      renderTeamGuestsTable(idx);
    });
    teamTabsNav.appendChild(btn);
  });
}

function renderTeamGuestsTable(colabIdx) {
  const asig = teamAssignments[colabIdx];
  if (!asig) return;

  teamCurrentMember.textContent = asig.collaborator;
  const total = asig.guests.length;
  const sent = asig.guests.filter(g => g.enviadoManual).length;
  teamMemberProgress.textContent = `${sent} de ${total} completados manualmente`;

  teamGuestsTableBody.innerHTML = '';

  asig.guests.forEach((g, gIdx) => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50 transition-colors ${g.enviadoManual ? 'bg-emerald-50/50 opacity-75' : ''}`;

    const nombreMostrado = g.nombre && g.nombre.trim()
      ? escapeHtml(g.nombre)
      : '<i class="text-slate-400 font-normal">Sin nombre en Excel (Mensaje Formal)</i>';

    tr.innerHTML = `
      <td class="px-3 py-3 text-center font-mono text-slate-400 text-[11px] align-top">${gIdx + 1}</td>
      <td class="px-3 py-3 align-top max-w-sm">
        <div class="font-bold text-slate-800 text-xs ${g.enviadoManual ? 'line-through text-slate-400' : ''}">
          ${nombreMostrado}
        </div>
        <div class="text-[10px] text-slate-400 font-mono mt-0.5">Folio: ${escapeHtml(g.codigo || 'JARDIN-INV')}</div>
        <div class="mt-2">
          <div class="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span class="font-semibold text-slate-600">Mensaje a Enviar y Exportar:</span>
            <span class="text-rose-600 font-medium">✏️ Editable antes de descargar</span>
          </div>
          <textarea class="team-msg-input w-full text-[11px] p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-rose-500 font-sans leading-relaxed resize-y shadow-inner text-slate-700" rows="4">${escapeHtml(g.mensaje)}</textarea>
        </div>
      </td>
      <td class="px-3 py-3 font-mono text-slate-700 text-xs align-top font-semibold whitespace-nowrap">
        ${escapeHtml(g.telefono)}
      </td>
      <td class="px-3 py-3 text-center text-slate-700 align-top whitespace-nowrap">
        <span class="inline-block px-2 py-0.5 rounded-md bg-slate-100 font-bold text-[11px] text-slate-800">
          ${escapeHtml(g.pases || '1')} pase(s)
        </span>
        <span class="block text-[10px] text-slate-500 mt-1">Mesa: ${escapeHtml(g.mesa || 'General')}</span>
      </td>
      <td class="px-3 py-3 text-center align-top whitespace-nowrap space-y-1.5">
        <button type="button" class="btn-open-wa w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1">
          <span>📲 Enviar WhatsApp</span>
        </button>
        <button type="button" class="btn-copy-msg w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] px-2 py-1 rounded-lg border transition-colors">
          📋 Copiar Texto
        </button>
      </td>
      <td class="px-3 py-3 text-center align-top whitespace-nowrap">
        <button type="button" class="btn-show-qr bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold px-3 py-2 rounded-xl inline-flex items-center space-x-1 shadow-2xs">
          <span>🖼️ Pase QR</span>
        </button>
      </td>
      <td class="px-3 py-3 text-center align-top whitespace-nowrap">
        <label class="inline-flex items-center space-x-1.5 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
          <input type="checkbox" ${g.enviadoManual ? 'checked' : ''} class="check-team-sent w-4 h-4 text-emerald-600 rounded border-slate-300">
          <span class="text-[11px] font-semibold ${g.enviadoManual ? 'text-emerald-700' : 'text-slate-600'}">
            ${g.enviadoManual ? '✓ Listo' : 'Marcar'}
          </span>
        </label>
      </td>
    `;

    tr.querySelector('.team-msg-input').addEventListener('input', (e) => {
      g.mensaje = e.target.value;
      const defaultCountry = inputCountry.value.trim() || '52';
      g.waLink = generarEnlaceWhatsAppDirecto(g.telefono, g.mensaje, defaultCountry);
      guardarEstadoLocal();
    });

    tr.querySelector('.btn-open-wa').addEventListener('click', () => {
      copiarTextoAlPortapapeles(g.mensaje, `📲 Abriendo WhatsApp para ${g.nombre || 'invitado'}. El mensaje con emojis también se copió al portapapeles.`);
      window.open(g.waLink, '_blank');
    });

    tr.querySelector('.btn-copy-msg').addEventListener('click', () => {
      copiarTextoAlPortapapeles(g.mensaje, `📋 Mensaje de ${g.nombre || 'invitado'} copiado al portapapeles.`);
    });

    tr.querySelector('.btn-show-qr').addEventListener('click', () => {
      abrirModalQR(g);
    });

    const checkInput = tr.querySelector('.check-team-sent');
    checkInput.addEventListener('change', (e) => {
      g.enviadoManual = e.target.checked;
      const mainGuest = allGuests.find(x => x.id === g.id);
      if (mainGuest) mainGuest.enviadoManual = g.enviadoManual;
      guardarEstadoLocal();
      renderTeamTabs();
      renderTeamGuestsTable(colabIdx);
    });

    teamGuestsTableBody.appendChild(tr);
  });
}

// Exportar Excel del Plan B con Hipervínculos Clickeables (100% en navegador con SheetJS)
btnExportPlanB.addEventListener('click', () => {
  if (teamAssignments.length === 0) {
    alert('Primero divide la lista de invitados para el equipo.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const allData = [];

  teamAssignments.forEach(asig => {
    asig.guests.forEach((g, idx) => {
      allData.push({
        'Colaborador Asignado': asig.collaborator,
        'No.': idx + 1,
        'Nombre del Invitado': g.nombre || '(Sin nombre - Mensaje formal)',
        'Teléfono': g.telefono,
        'Pases': g.pases || '1',
        'Mesa': g.mesa || 'General',
        'Estado Manual': g.enviadoManual ? 'Enviado ✓' : 'Pendiente',
        'Enlace Directo WhatsApp': g.waLink || '',
        'Mensaje a Enviar': g.mensaje || ''
      });
    });
  });

  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll['!cols'] = [
    { wch: 22 }, { wch: 6 }, { wch: 30 }, { wch: 18 },
    { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 32 }, { wch: 55 }
  ];

  for (let r = 2; r <= allData.length + 1; r++) {
    const cell = wsAll[`H${r}`];
    if (cell && cell.v && String(cell.v).startsWith('http')) {
      const url = String(cell.v).trim();
      cell.t = 's';
      cell.l = { Target: url, Tooltip: 'Clic para abrir WhatsApp con el mensaje listo' };
      cell.v = '📲 Clic para Abrir WhatsApp';
    }
  }
  XLSX.utils.book_append_sheet(wb, wsAll, 'Plan B - Todos');

  teamAssignments.forEach(asig => {
    const safeSheetName = asig.collaborator.replace(/[:\\/?*\[\]]/g, '').slice(0, 28) || 'Equipo';
    const colabData = asig.guests.map((g, idx) => ({
      'No.': idx + 1,
      'Nombre del Invitado': g.nombre || '(Sin nombre - Mensaje formal)',
      'Teléfono': g.telefono,
      'Pases': g.pases || '1',
      'Mesa': g.mesa || 'General',
      'Estado': g.enviadoManual ? 'Enviado ✓' : 'Pendiente',
      'Enlace Directo WhatsApp': g.waLink || '',
      'Mensaje a Enviar': g.mensaje || ''
    }));
    const wsColab = XLSX.utils.json_to_sheet(colabData);
    wsColab['!cols'] = [
      { wch: 6 }, { wch: 30 }, { wch: 18 }, { wch: 8 },
      { wch: 12 }, { wch: 15 }, { wch: 32 }, { wch: 55 }
    ];

    for (let r = 2; r <= colabData.length + 1; r++) {
      const cell = wsColab[`G${r}`];
      if (cell && cell.v && String(cell.v).startsWith('http')) {
        const url = String(cell.v).trim();
        cell.t = 's';
        cell.l = { Target: url, Tooltip: 'Clic para abrir WhatsApp con el mensaje listo' };
        cell.v = '📲 Clic para Abrir WhatsApp';
      }
    }
    XLSX.utils.book_append_sheet(wb, wsColab, safeSheetName);
  });

  XLSX.writeFile(wb, `Plan_B_Distribucion_Equipo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  mostrarNotificacionToast('📥 Archivo Excel descargado con enlaces clickeables.');
});

// ==========================================
// 7. MODAL DE PASE QR Y RECEPCIÓN CON CÁMARA
// ==========================================
async function abrirModalQR(guest) {
  currentModalGuest = guest;
  modalGuestName.textContent = guest.nombre || 'Invitado de Honor';
  modalGuestPases.textContent = `🎟 ${guest.pases || 1} Pase(s)`;
  modalGuestMesa.textContent = `🪑 Mesa: ${guest.mesa || 'General'}`;
  modalGuestCode.textContent = `Folio: ${guest.codigo}`;

  const qrMode = document.querySelector('input[name="qrMode"]:checked').value;
  if (qrMode === 'custom' && customQrDataUrl) {
    modalQrCanvas.classList.add('hidden');
    modalQrCustomImg.src = customQrDataUrl;
    modalQrCustomImg.classList.remove('hidden');
  } else {
    modalQrCustomImg.classList.add('hidden');
    modalQrCanvas.classList.remove('hidden');

    const payload = JSON.stringify({
      evento: 'Boda - Acceso Jardín',
      invitado: guest.nombre || 'Invitado de Honor',
      pases: guest.pases || 1,
      mesa: guest.mesa || 'General',
      codigo: guest.codigo,
      valido: true
    });

    await QRCode.toCanvas(modalQrCanvas, payload, {
      width: 200,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' }
    });
  }

  qrModal.classList.remove('hidden');
}

function cerrarModalQR() {
  qrModal.classList.add('hidden');
  currentModalGuest = null;
}

btnCloseQrModal.addEventListener('click', cerrarModalQR);
btnCloseQrModal2.addEventListener('click', cerrarModalQR);

btnDownloadQrImg.addEventListener('click', () => {
  if (!currentModalGuest) return;
  const g = currentModalGuest;

  const qrMode = document.querySelector('input[name="qrMode"]:checked').value;
  if (qrMode === 'custom' && customQrDataUrl) {
    const a = document.createElement('a');
    a.href = customQrDataUrl;
    a.download = `Pase_QR_${(g.nombre || g.codigo).replace(/\s+/g, '_')}.png`;
    a.click();
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 760;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff1f2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#fecdd3';
  ctx.lineWidth = 4;
  ctx.fillRect(30, 30, 540, 700);
  ctx.strokeRect(30, 30, 540, 700);

  ctx.fillStyle = '#be123c';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NUESTRA BODA • PASE DE ACCESO AL JARDÍN', 300, 85);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText((g.nombre || 'Invitado de Honor').slice(0, 34), 300, 135);

  ctx.drawImage(modalQrCanvas, 150, 170, 300, 300);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(`Pases válidos: ${g.pases || 1}   |   Mesa: ${g.mesa || 'General'}`, 300, 535);

  ctx.fillStyle = '#64748b';
  ctx.font = '16px monospace';
  ctx.fillText(`Folio: ${g.codigo}`, 300, 585);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `Pase_Boda_${(g.nombre || g.codigo).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  a.click();
  mostrarNotificacionToast('📥 Imagen del Pase QR descargada.');
});

// Escáner de Recepción
btnStartScanner.addEventListener('click', () => {
  if (html5QrScanner) return;
  html5QrScanner = new Html5Qrcode('qr-reader');
  btnStartScanner.classList.add('hidden');
  btnStopScanner.classList.remove('hidden');

  html5QrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    (decodedText) => procesarLecturaQR(decodedText),
    () => {}
  ).catch((err) => {
    alert('No se pudo abrir la cámara: ' + err);
    btnStartScanner.classList.remove('hidden');
    btnStopScanner.classList.add('hidden');
    html5QrScanner = null;
  });
});

btnStopScanner.addEventListener('click', detenerCamaraQR);

function detenerCamaraQR() {
  if (!html5QrScanner) return;
  html5QrScanner.stop().then(() => {
    html5QrScanner.clear();
    html5QrScanner = null;
    btnStartScanner.classList.remove('hidden');
    btnStopScanner.classList.add('hidden');
  }).catch(() => { html5QrScanner = null; });
}

function procesarLecturaQR(rawText) {
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (e) { parsed = { codigo: rawText.trim() }; }

  const found = allGuests.find(g =>
    (parsed.codigo && g.codigo === parsed.codigo) ||
    (parsed.invitado && g.nombre && g.nombre.toLowerCase() === parsed.invitado.toLowerCase())
  );

  scanResultCard.classList.remove('hidden');

  if (found) {
    const yaIngreso = Boolean(found.checkedIn);
    scanResultCard.className = `rounded-2xl p-4 border-2 space-y-2 ${yaIngreso ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`;
    scanResultCard.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full ${yaIngreso ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}">
          ${yaIngreso ? '⚠️ YA HABÍA INGRESADO (' + found.horaCheckIn + ')' : '✅ PASE VÁLIDO VERIFICADO'}
        </span>
        <span class="text-xs font-mono text-slate-500">${escapeHtml(found.codigo)}</span>
      </div>
      <div class="text-base font-bold text-slate-900">${escapeHtml(found.nombre || 'Invitado Formal')}</div>
      <div class="flex space-x-3 text-xs font-semibold text-slate-700">
        <span>🎟 Pases: <b>${escapeHtml(found.pases)}</b></span>
        <span>🪑 Mesa: <b>${escapeHtml(found.mesa || 'General')}</b></span>
      </div>
      <button type="button" id="btn-confirm-scan-in" class="w-full ${yaIngreso ? 'bg-slate-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold text-xs py-2.5 px-4 rounded-xl">
        ${yaIngreso ? 'Ya Registrado ✓' : '✓ Confirmar Entrada al Jardín'}
      </button>
    `;
    const btn = document.getElementById('btn-confirm-scan-in');
    if (btn && !yaIngreso) {
      btn.addEventListener('click', () => {
        found.checkedIn = true;
        found.horaCheckIn = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        guardarEstadoLocal();
        renderDoorTable();
        procesarLecturaQR(rawText);
        mostrarNotificacionToast(`✅ Entrada registrada: ${found.nombre || found.codigo}`);
      });
    }
  } else if (parsed && parsed.valido) {
    scanResultCard.className = 'rounded-2xl p-4 border-2 bg-emerald-50 border-emerald-300 space-y-2';
    scanResultCard.innerHTML = `
      <div class="text-xs font-bold uppercase bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full inline-block">✅ QR OFICIAL DE BODA VÁLIDO</div>
      <div class="text-base font-bold text-slate-900">${escapeHtml(parsed.invitado || 'Invitado de Honor')}</div>
      <div class="flex space-x-3 text-xs font-semibold text-slate-700">
        <span>🎟 Pases: <b>${escapeHtml(String(parsed.pases || 1))}</b></span>
        <span>🪑 Mesa: <b>${escapeHtml(parsed.mesa || 'General')}</b></span>
      </div>
      <div class="text-[11px] font-mono text-slate-500">Folio: ${escapeHtml(parsed.codigo || '-')}</div>
    `;
  } else {
    scanResultCard.className = 'rounded-2xl p-4 border-2 bg-red-50 border-red-300 space-y-1';
    scanResultCard.innerHTML = `<div class="text-xs font-bold text-red-800">❌ CÓDIGO QR NO RECONOCIDO</div>`;
  }
}

inputSearchDoor.addEventListener('input', renderDoorTable);

function renderDoorTable() {
  const checkedInList = allGuests.filter(g => g.checkedIn);
  statCheckedIn.textContent = checkedInList.length;
  statPendingIn.textContent = allGuests.length - checkedInList.length;
  statPasesIn.textContent = checkedInList.reduce((acc, g) => acc + (parseInt(g.pases, 10) || 1), 0);

  if (allGuests.length === 0) return;

  const q = (inputSearchDoor.value || '').toLowerCase().trim();
  const list = q
    ? allGuests.filter(g =>
        (g.nombre && g.nombre.toLowerCase().includes(q)) ||
        (g.mesa && g.mesa.toLowerCase().includes(q)) ||
        (g.codigo && g.codigo.toLowerCase().includes(q))
      )
    : allGuests;

  doorGuestsTbody.innerHTML = '';
  list.forEach(g => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50 ${g.checkedIn ? 'bg-emerald-50/50' : ''}`;
    tr.innerHTML = `
      <td class="px-3 py-2.5">
        <div class="font-bold text-slate-800">${escapeHtml(g.nombre) || '<i>Sin nombre (Formal)</i>'}</div>
        <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(g.codigo)} • ${escapeHtml(g.telefono)}</div>
      </td>
      <td class="px-3 py-2.5 text-center font-bold text-slate-700">${escapeHtml(g.pases)}</td>
      <td class="px-3 py-2.5 text-center text-slate-600">${escapeHtml(g.mesa || 'General')}</td>
      <td class="px-3 py-2.5 text-center">
        <button type="button" class="btn-door-toggle px-3 py-1.5 rounded-lg text-xs font-bold ${
          g.checkedIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-600 hover:bg-rose-700 text-white'
        }">
          ${g.checkedIn ? '✓ Ingresó (' + g.horaCheckIn + ')' : 'Registrar Entrada'}
        </button>
      </td>
    `;
    tr.querySelector('.btn-door-toggle').addEventListener('click', () => {
      g.checkedIn = !g.checkedIn;
      g.horaCheckIn = g.checkedIn ? new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
      guardarEstadoLocal();
      renderDoorTable();
    });
    doorGuestsTbody.appendChild(tr);
  });
}

btnExportCheckin.addEventListener('click', () => {
  if (allGuests.length === 0) return alert('No hay invitados cargados.');
  const rows = allGuests.map((g, i) => ({
    'No.': i + 1,
    'Invitado': g.nombre || '(Sin nombre)',
    'Teléfono': g.telefono,
    'Pases': g.pases,
    'Mesa': g.mesa || 'General',
    'Folio QR': g.codigo,
    'Asistencia': g.checkedIn ? 'INGRESÓ ✓' : 'Pendiente',
    'Hora de Llegada': g.horaCheckIn || '-'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia Recepción');
  XLSX.writeFile(wb, `Asistencia_Boda_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// ==========================================
// 8. UTILIDADES Y PERSISTENCIA LOCAL
// ==========================================
function copiarTextoAlPortapapeles(texto, aviso) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(() => mostrarNotificacionToast(aviso)).catch(() => fallbackCopy(texto, aviso));
  } else {
    fallbackCopy(texto, aviso);
  }
}

function fallbackCopy(texto, aviso) {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); mostrarNotificacionToast(aviso); } catch (e) {}
  document.body.removeChild(ta);
}

function mostrarNotificacionToast(mensaje) {
  let toast = document.getElementById('team-global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'team-global-toast';
    toast.className = 'fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2 border border-slate-700 transition-all duration-300';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>💬</span><span>${escapeHtml(mensaje)}</span>`;
  toast.classList.remove('hidden', 'opacity-0');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3500);
}

function guardarEstadoLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      allGuests,
      tplPers: tplPersonalizado.value,
      tplGen: tplGenerico.value,
      teamMembers: inputTeamMembers.value
    }));
  } catch (e) {}
}

function cargarEstadoLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    // Solo restaurar plantillas guardadas si ya contienen la actualización de "Best Man"
    if (data.tplPers && /best\s*man/i.test(data.tplPers)) {
      tplPersonalizado.value = data.tplPers;
    }
    if (data.tplGen && /best\s*man/i.test(data.tplGen)) {
      tplGenerico.value = data.tplGen;
    }
    if (data.teamMembers) inputTeamMembers.value = data.teamMembers;
    if (data.allGuests && Array.isArray(data.allGuests) && data.allGuests.length > 0) {
      allGuests = data.allGuests.map(g => ({
        ...g,
        telefono: limpiarTelefonoCliente(g.telefono)
      }));
      finalizarCargaInvitados('Lista_Guardada.xlsx');
    }
  } catch (e) {}
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

cargarEstadoLocal();
updatePreviewWhatsApp();
