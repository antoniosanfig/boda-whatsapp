import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} from '@whiskeysockets/baileys';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS para permitir conexión desde GitHub Pages (https://*.github.io) o cualquier dominio
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de Multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// ==========================================
// ESTADO DE LA APLICACIÓN
// ==========================================
const AUTH_DIR = path.join(__dirname, 'auth_session');
let sock = null;
let waState = {
  status: 'disconnected', // 'disconnected', 'connecting', 'qr_ready', 'connected'
  qrDataUrl: null,
  userPhone: null,
  userName: null,
  error: null
};

let currentGuests = [];
let customQRImagePath = null;
let sendingState = {
  isRunning: false,
  isPaused: false,
  shouldStop: false,
  currentIndex: 0,
  total: 0,
  sentCount: 0,
  errorCount: 0,
  results: [],
  logs: []
};

// ==========================================
// CONTROLADOR DE WHATSAPP (BAILEYS)
// ==========================================
async function initWhatsApp(forceNew = false) {
  try {
    if (forceNew && fs.existsSync(AUTH_DIR)) {
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch (e) {
        console.error('Error al limpiar directorio de sesión:', e.message);
      }
    }

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    waState.status = 'connecting';
    waState.error = null;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version = undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (e) { }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['BodaInvitaciones', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          waState.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
          waState.status = 'qr_ready';
          console.log('Nuevo código QR generado para vinculación.');
        } catch (qrErr) {
          console.error('Error al generar DataURL del QR:', qrErr);
        }
      }

      if (connection === 'open') {
        waState.status = 'connected';
        waState.qrDataUrl = null;
        waState.error = null;
        const userJid = sock.user?.id || '';
        waState.userPhone = userJid.split(':')[0] || userJid.split('@')[0] || 'Conectado';
        waState.userName = sock.user?.name || 'WhatsApp Conectado';
        console.log(`WhatsApp conectado exitosamente como: ${waState.userPhone}`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`Conexión cerrada. Código: ${statusCode}, Reconectar: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          waState.status = 'disconnected';
          waState.qrDataUrl = null;
          waState.userPhone = null;
          waState.userName = null;
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (e) { }
          console.log('Sesión cerrada por el usuario. Esperando reconexión manual.');
        } else if (shouldReconnect) {
          waState.status = 'connecting';
          setTimeout(() => initWhatsApp(false), 3000);
        } else {
          waState.status = 'disconnected';
        }
      }
    });
  } catch (err) {
    console.error('Error al inicializar WhatsApp:', err);
    waState.status = 'disconnected';
    waState.error = err.message;
  }
}

// Iniciar WhatsApp al arrancar
initWhatsApp(false);

// Limpiar número de teléfono proveniente de Excel (quita símbolos +, (, ), -, decimales .0, espacios, etc.)
function limpiarTelefono(rawPhone) {
  if (rawPhone === null || rawPhone === undefined) return '';
  let str = String(rawPhone).trim();
  // Si Excel exportó el número con punto decimal (ej. 5512345678.0), quitar la parte decimal
  if (/^\d+\.0+$/.test(str)) {
    str = str.split('.')[0];
  }
  let digits = str.replace(/\D/g, '');
  // Si tiene prefijo internacional con 00 (ej. 001... o 0052...), quitar los dos ceros iniciales
  if (digits.startsWith('001') && digits.length === 13) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0052') && (digits.length === 14 || digits.length === 15)) {
    digits = digits.slice(2);
  }
  return digits;
}

// Detectar si un número limpio pertenece a México ('MX') o Estados Unidos/Canadá ('US')
function detectarPaisTelefono(rawPhone, defaultCountry = '52') {
  const digits = limpiarTelefono(rawPhone);
  if (!digits || digits.length < 10) return 'INVALID';
  if (digits.length === 11 && digits.startsWith('1')) return 'US';
  if ((digits.length === 12 && digits.startsWith('52')) || (digits.length === 13 && digits.startsWith('521'))) return 'MX';
  if (digits.length === 10) {
    return String(defaultCountry).replace(/\D/g, '') === '1' ? 'US' : 'MX';
  }
  return digits.startsWith('1') ? 'US' : 'MX';
}

// Función para normalizar y resolver número de WhatsApp (soporta México +52 y EE.UU. +1)
async function resolveWhatsAppJid(rawPhone, defaultCountry = '52') {
  if (!rawPhone) return null;
  let digits = limpiarTelefono(rawPhone);
  if (!digits || digits.length < 10) return null;

  const cleanDefaultCountry = String(defaultCountry || '52').replace(/\D/g, '') || '52';
  const wasTenDigits = digits.length === 10;

  // Si tiene 10 dígitos sin código de país, anteponer el código predeterminado (52 o 1)
  if (wasTenDigits) {
    digits = cleanDefaultCountry + digits;
  }

  const primaryJid = `${digits}@s.whatsapp.net`;

  try {
    if (sock && sock.onWhatsApp) {
      // 1. Validar JID principal (funciona directo para EE.UU. 1XXXXXXXXXX o México 52XXXXXXXXXX)
      const [check] = await sock.onWhatsApp(primaryJid);
      if (check && check.exists) return check.jid;

      // 2. Variantes de México (52 vs 521)
      if (digits.startsWith('52') && digits.length === 12) {
        const altJid = `521${digits.slice(2)}@s.whatsapp.net`;
        const [checkAlt] = await sock.onWhatsApp(altJid);
        if (checkAlt && checkAlt.exists) return checkAlt.jid;
      } else if (digits.startsWith('521') && digits.length === 13) {
        const altJid = `52${digits.slice(3)}@s.whatsapp.net`;
        const [checkAlt] = await sock.onWhatsApp(altJid);
        if (checkAlt && checkAlt.exists) return checkAlt.jid;
      }

      // 3. Si originalmente tenía 10 dígitos, probar con el otro país (+1 EE.UU. o +52 México) por si venía sin lada internacional
      if (wasTenDigits) {
        const raw10 = digits.slice(cleanDefaultCountry.length);
        if (cleanDefaultCountry !== '1') {
          const usJid = `1${raw10}@s.whatsapp.net`;
          const [checkUs] = await sock.onWhatsApp(usJid);
          if (checkUs && checkUs.exists) return checkUs.jid;
        } else {
          const mxJid = `52${raw10}@s.whatsapp.net`;
          const [checkMx] = await sock.onWhatsApp(mxJid);
          if (checkMx && checkMx.exists) return checkMx.jid;
          const mxAltJid = `521${raw10}@s.whatsapp.net`;
          const [checkMxAlt] = await sock.onWhatsApp(mxAltJid);
          if (checkMxAlt && checkMxAlt.exists) return checkMxAlt.jid;
        }
      }
    }
  } catch (e) {
    console.warn(`Aviso al validar en WhatsApp: ${e.message}`);
  }

  return primaryJid;
}

// ==========================================
// RUTAS DE LA API
// ==========================================

// Estado de WhatsApp
app.get('/api/wa-status', (req, res) => {
  res.json({
    status: waState.status,
    qrDataUrl: waState.qrDataUrl,
    userPhone: waState.userPhone,
    userName: waState.userName,
    error: waState.error
  });
});

// Desvincular / Reiniciar sesión de WhatsApp
app.post('/api/wa-logout', async (req, res) => {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (e) { }
    }
    await initWhatsApp(true);
    res.json({ success: true, message: 'Sesión reiniciada. Escanea el nuevo código QR.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Subir y procesar archivo Excel
app.post('/api/upload-excel', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se subió ningún archivo' });
    }

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ success: false, error: 'El archivo Excel está vacío' });
    }

    // Mapeo inteligente de columnas
    const guests = rawData.map((row, index) => {
      const nombreKey = Object.keys(row).find(k =>
        /nombre|invitado|name|persona|contacto/i.test(k.trim())
      );
      const telefonoKey = Object.keys(row).find(k =>
        /telefono|teléfono|celular|cel|whatsapp|phone|movil|móvil|numero|número/i.test(k.trim())
      );
      const pasesKey = Object.keys(row).find(k =>
        /pases|pase|boletos|personas|cupo|lugares/i.test(k.trim())
      );
      const mesaKey = Object.keys(row).find(k =>
        /mesa|lugar|asiento|zona/i.test(k.trim())
      );
      const codigoKey = Object.keys(row).find(k =>
        /codigo|código|qr|id|folio|clave/i.test(k.trim())
      );

      const rawNombre = nombreKey ? String(row[nombreKey]).trim() : '';
      const rawTelefono = telefonoKey ? limpiarTelefono(row[telefonoKey]) : '';
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
        pases: pases,
        mesa: mesa,
        codigo: codigo,
        tipoMensaje: tieneNombre ? 'Personalizado' : 'Formal Genérico',
        estado: 'Pendiente',
        resultado: '',
        horaEnvio: ''
      };
    });

    currentGuests = guests;
    sendingState = {
      isRunning: false,
      isPaused: false,
      shouldStop: false,
      currentIndex: 0,
      total: guests.length,
      sentCount: 0,
      errorCount: 0,
      results: [],
      logs: []
    };

    const total = guests.length;
    const conNombre = guests.filter(g => g.tipoMensaje === 'Personalizado').length;
    const sinNombre = total - conNombre;
    const conTelefono = guests.filter(g => g.telefono.replace(/\D/g, '').length >= 10).length;

    res.json({
      success: true,
      total,
      conNombre,
      sinNombre,
      conTelefono,
      guests
    });
  } catch (err) {
    console.error('Error al procesar Excel:', err);
    res.status(500).json({ success: false, error: 'Error al leer el archivo Excel: ' + err.message });
  }
});

// Nombres de ejemplo realistas para pruebas
const NOMBRES_PRUEBA = [
  'Lic. Roberto González y Familia',
  'Dra. Carmen Morales',
  'Ing. Carlos Santana y Acompañante',
  'Familia Martínez Herrera',
  'Dra. Sofía Mendoza',
  '',
  'Sr. Fernando Ruiz y Esposa',
  'Mtra. Laura Valenzuela',
  'Familia Ramírez Castro',
  '',
  'Dr. Alejandro Silva',
  'Sra. Patricia Domínguez',
  'Familia Navarro Méndez',
  '',
  'Lic. Javier Ortega',
  'Ing. Beatriz Paredes y Familia',
  '',
  'Dr. Gabriel Fuentes',
  'Familia Gómez Solís',
  'Lic. Mónica Estrada'
];

function generarListaPrueba(phone, count = 15) {
  const total = Math.min(Math.max(count, 5), 30);
  const lista = [];

  for (let i = 0; i < total; i++) {
    const rawNombre = NOMBRES_PRUEBA[i % NOMBRES_PRUEBA.length];
    const tieneNombre = Boolean(rawNombre && rawNombre.trim());
    const pases = (i % 3) + 1;
    const mesa = `Mesa ${Math.floor(i / 4) + 1}`;
    const codigo = `TEST-JARDIN-${String(i + 1).padStart(3, '0')}`;

    lista.push({
      id: i + 1,
      nombre: tieneNombre ? rawNombre : '',
      telefono: phone,
      pases: String(pases),
      mesa: mesa,
      codigo: codigo,
      tipoMensaje: tieneNombre ? 'Personalizado' : 'Formal Genérico',
      estado: 'Pendiente',
      resultado: '',
      horaEnvio: ''
    });
  }
  return lista;
}

// Generar lote de prueba directamente en el sistema
app.post('/api/generate-test-batch', (req, res) => {
  try {
    const { phone, count = 15 } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Por favor ingresa tu número de teléfono para la prueba.' });
    }

    const numCount = parseInt(count, 10) || 15;
    const guests = generarListaPrueba(limpiarTelefono(phone), numCount);
    currentGuests = guests;
    sendingState = {
      isRunning: false,
      isPaused: false,
      shouldStop: false,
      currentIndex: 0,
      total: guests.length,
      sentCount: 0,
      errorCount: 0,
      results: [],
      logs: []
    };

    const total = guests.length;
    const conNombre = guests.filter(g => g.tipoMensaje === 'Personalizado').length;
    const sinNombre = total - conNombre;

    res.json({
      success: true,
      total,
      conNombre,
      sinNombre,
      conTelefono: total,
      guests,
      message: `Se han generado ${total} invitaciones de prueba con tu número telefónico.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Descargar Excel de prueba con 15 o 20 registros dirigidos a un teléfono
app.get('/api/download-test-excel', (req, res) => {
  try {
    const phone = req.query.phone || '525512345678';
    const count = parseInt(req.query.count, 10) || 15;
    const guests = generarListaPrueba(String(phone).trim(), count);

    const excelRows = guests.map(g => ({
      'Nombre': g.nombre,
      'Telefono': g.telefono,
      'Pases': g.pases,
      'Mesa': g.mesa,
      'CodigoAcceso': g.codigo
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [
      { wch: 35 },
      { wch: 18 },
      { wch: 8 },
      { wch: 12 },
      { wch: 20 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invitados_Prueba');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const cleanPhone = String(phone).replace(/\D/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="Prueba_${count}_Invitaciones_${cleanPhone}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Subir imagen personalizada de QR / Pase del Jardín
app.post('/api/upload-qr-image', upload.single('qrImage'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se subió ninguna imagen' });
    }
    customQRImagePath = req.file.path;
    res.json({
      success: true,
      imageUrl: `/uploads/${req.file.filename}`,
      message: 'Imagen del QR del Jardín cargada exitosamente'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eliminar imagen personalizada (volver a generación automática)
app.post('/api/remove-qr-image', (req, res) => {
  customQRImagePath = null;
  res.json({ success: true, message: 'Se ha restablecido la generación de QR automático individual.' });
});

// Función para construir el texto final del mensaje
function construirMensaje(guest, templatePersonalizado, templateGenerico) {
  const tieneNombre = Boolean(guest.nombre && guest.nombre.trim());
  const plantillaBase = tieneNombre ? templatePersonalizado : templateGenerico;

  const detallePases = guest.pases && guest.pases !== '1'
    ? `🎟 Pases incluidos: ${guest.pases} accesos`
    : `🎟 Pase válido para su acceso personal`;

  const detalleMesa = guest.mesa
    ? `🪑 Mesa asignada: ${guest.mesa}`
    : '';

  let texto = plantillaBase
    .replace(/\{nombre\}/gi, guest.nombre || 'Distinguido/a Invitado/a')
    .replace(/\{pases\}/gi, guest.pases || '1')
    .replace(/\{detalle_pases\}/gi, detallePases)
    .replace(/\{mesa\}/gi, guest.mesa || '')
    .replace(/\{detalle_mesa\}/gi, detalleMesa)
    .replace(/\{codigo\}/gi, guest.codigo || '');

  texto = texto.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

  return texto;
}

// Enviar mensaje de prueba individual
app.post('/api/send-test', async (req, res) => {
  try {
    if (waState.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp no está conectado. Por favor vincula tu celular primero escaneando el código QR.'
      });
    }

    const {
      testPhone,
      testName,
      templatePersonalizado,
      templateGenerico,
      qrMode = 'individual',
      customQrDataUrl = null,
      defaultCountry = '52'
    } = req.body;

    if (!testPhone) {
      return res.status(400).json({ success: false, error: 'Por favor ingresa un número de teléfono para la prueba.' });
    }

    const jid = await resolveWhatsAppJid(testPhone, defaultCountry);
    if (!jid) {
      return res.status(400).json({ success: false, error: 'Número de teléfono inválido.' });
    }

    const mockGuest = {
      nombre: testName ? testName.trim() : '',
      pases: '2',
      mesa: 'Mesa de Honor',
      codigo: 'BODA-TEST-001'
    };

    const textoFinal = construirMensaje(mockGuest, templatePersonalizado, templateGenerico);

    let imageBuffer = null;
    if (qrMode === 'custom' && customQRImagePath && fs.existsSync(customQRImagePath)) {
      imageBuffer = fs.readFileSync(customQRImagePath);
    } else if (qrMode === 'custom' && customQrDataUrl && String(customQrDataUrl).includes('base64,')) {
      const b64 = String(customQrDataUrl).split('base64,')[1];
      imageBuffer = Buffer.from(b64, 'base64');
    } else {
      const contenidoQR = JSON.stringify({
        evento: 'Boda - Pase de Prueba',
        invitado: mockGuest.nombre || 'Invitado de Honor',
        pases: mockGuest.pases,
        mesa: mockGuest.mesa,
        codigo: mockGuest.codigo,
        esPrueba: true
      });
      imageBuffer = await QRCode.toBuffer(contenidoQR, {
        width: 600,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' }
      });
    }

    await sock.sendMessage(jid, {
      image: imageBuffer,
      caption: textoFinal,
      mimetype: 'image/png'
    });

    logEvento(`📲 Mensaje de prueba enviado con éxito a: ${testPhone}`);
    res.json({ success: true, message: `Mensaje de prueba enviado exitosamente a ${testPhone}` });

  } catch (err) {
    console.error('Error al enviar prueba:', err);
    res.status(500).json({ success: false, error: err.message || 'Error al enviar mensaje de prueba' });
  }
});

// Iniciar proceso de envíos
app.post('/api/start-sending', async (req, res) => {
  try {
    if (waState.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp no está conectado. Por favor vincula tu celular primero escaneando el código QR.'
      });
    }

    if (Array.isArray(req.body.guests) && req.body.guests.length > 0) {
      if (!currentGuests || currentGuests.length === 0) {
        currentGuests = req.body.guests;
      } else {
        // Sincronizar estados desde el cliente por si hubo actualizaciones
        req.body.guests.forEach(cg => {
          const existing = currentGuests.find(x => x.id === cg.id);
          if (existing && cg.estado === 'Enviado') {
            existing.estado = 'Enviado';
          }
        });
      }
    }

    if (!currentGuests || currentGuests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay lista de invitados cargada. Por favor sube un archivo Excel primero.'
      });
    }

    if (sendingState.isRunning && !sendingState.isPaused) {
      return res.status(400).json({
        success: false,
        error: 'Ya hay un envío en curso actualmente.'
      });
    }

    const {
      templatePersonalizado,
      templateGenerico,
      qrMode = 'individual',
      customQrDataUrl = null,
      delaySeconds = 7,
      defaultCountry = '52',
      targetGroup = 'pending_all', // 'pending_all', 'pending_mx', 'pending_us', 'all_force'
      notifySupervisor = false,
      supervisorPhone = '',
      notifyMode = 'errors_only'
    } = req.body;

    if (sendingState.isRunning && sendingState.isPaused) {
      sendingState.isPaused = false;
      return res.json({ success: true, message: 'Envíos reanudados' });
    }

    // Filtrar la lista según el grupo seleccionado por el usuario
    let targetList = currentGuests;
    if (targetGroup === 'all_force') {
      currentGuests.forEach(g => {
        g.estado = 'Pendiente';
        g.resultado = '';
        g.horaEnvio = '';
      });
      targetList = currentGuests;
    } else if (targetGroup === 'pending_mx') {
      targetList = currentGuests.filter(g =>
        g.estado !== 'Enviado' && detectarPaisTelefono(g.telefono, defaultCountry) === 'MX'
      );
    } else if (targetGroup === 'pending_us') {
      targetList = currentGuests.filter(g =>
        g.estado !== 'Enviado' && detectarPaisTelefono(g.telefono, defaultCountry) === 'US'
      );
    } else {
      // 'pending_all': todos los que aún no están marcados como Enviado
      targetList = currentGuests.filter(g => g.estado !== 'Enviado');
    }

    if (targetList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay invitados pendientes que coincidan con el filtro seleccionado (todos ya fueron enviados o no hay registros de ese país).'
      });
    }

    // Conservar los resultados exitosos previos si es un envío parcial o continuación
    const targetIds = new Set(targetList.map(g => g.id));
    const preservedResults = targetGroup === 'all_force'
      ? []
      : sendingState.results.filter(r => !targetIds.has(r.id) && r.estado === 'EXITOSO');

    sendingState = {
      isRunning: true,
      isPaused: false,
      shouldStop: false,
      currentIndex: 0,
      total: targetList.length,
      sentCount: 0,
      errorCount: 0,
      results: preservedResults,
      logs: sendingState.logs || []
    };

    res.json({
      success: true,
      totalToSend: targetList.length,
      message: `Proceso de envío iniciado para ${targetList.length} invitado(s)`
    });

    ejecutarEnviosEnCola({
      templatePersonalizado,
      templateGenerico,
      qrMode,
      customQrDataUrl,
      delaySeconds: Math.max(3, Number(delaySeconds) || 7),
      defaultCountry,
      notifySupervisor: Boolean(notifySupervisor),
      supervisorPhone: String(supervisorPhone || '').trim(),
      notifyMode: notifyMode === 'all' ? 'all' : 'errors_only'
    }, targetList);

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reintentar únicamente envíos fallidos
app.post('/api/retry-failed', async (req, res) => {
  try {
    if (waState.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp no está conectado. Por favor vincula tu celular primero escaneando el código QR.'
      });
    }

    const failedGuests = currentGuests.filter(g => g.estado === 'Error');
    if (failedGuests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay mensajes con error para reintentar.'
      });
    }

    if (sendingState.isRunning && !sendingState.isPaused) {
      return res.status(400).json({
        success: false,
        error: 'Ya hay un envío en curso actualmente.'
      });
    }

    const {
      templatePersonalizado,
      templateGenerico,
      qrMode = 'individual',
      delaySeconds = 7,
      defaultCountry = '52',
      notifySupervisor = false,
      supervisorPhone = '',
      notifyMode = 'errors_only'
    } = req.body;

    failedGuests.forEach(g => {
      g.estado = 'Pendiente';
      g.resultado = '';
    });

    sendingState = {
      isRunning: true,
      isPaused: false,
      shouldStop: false,
      currentIndex: 0,
      total: failedGuests.length,
      sentCount: 0,
      errorCount: 0,
      results: sendingState.results.filter(r => r.estado !== 'ERROR'),
      logs: []
    };

    res.json({ success: true, message: `Reintentando ${failedGuests.length} envíos con error.` });

    ejecutarEnviosEnCola({
      templatePersonalizado,
      templateGenerico,
      qrMode,
      delaySeconds: Math.max(3, Number(delaySeconds) || 7),
      defaultCountry,
      notifySupervisor: Boolean(notifySupervisor),
      supervisorPhone: String(supervisorPhone || '').trim(),
      notifyMode: notifyMode === 'all' ? 'all' : 'errors_only'
    }, failedGuests);

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Función en segundo plano para enviar mensajes uno a uno
async function ejecutarEnviosEnCola(config, guestList = currentGuests) {
  const {
    templatePersonalizado,
    templateGenerico,
    qrMode,
    delaySeconds,
    defaultCountry,
    notifySupervisor = false,
    supervisorPhone = '',
    notifyMode = 'errors_only'
  } = config;

  let supervisorJid = null;
  if (notifySupervisor && supervisorPhone) {
    try {
      supervisorJid = await resolveWhatsAppJid(supervisorPhone, defaultCountry);
      if (supervisorJid) {
        logEvento(`📲 Alertas configuradas para el supervisor: ${supervisorPhone} (Modo: ${notifyMode === 'all' ? 'Todos los envíos' : 'Solo errores'})`);
      }
    } catch (supInitErr) {
      console.warn('No se pudo resolver JID del supervisor:', supInitErr.message);
    }
  }

  for (let i = sendingState.currentIndex; i < guestList.length; i++) {
    if (sendingState.shouldStop) {
      logEvento('🛑 Envío detenido por el usuario.');
      break;
    }

    while (sendingState.isPaused && !sendingState.shouldStop) {
      await delay(1000);
    }
    if (sendingState.shouldStop) break;

    sendingState.currentIndex = i;
    const guest = guestList[i];
    const nombreDisplay = guest.nombre || 'Invitado sin nombre (Mensaje Formal)';
    const horaActual = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    logEvento(`[${i + 1}/${guestList.length}] Procesando: ${nombreDisplay} (${guest.telefono})...`);

    try {
      const jid = await resolveWhatsAppJid(guest.telefono, defaultCountry);
      if (!jid) {
        throw new Error('Número de teléfono inválido o vacío');
      }

      const textoFinal = construirMensaje(guest, templatePersonalizado, templateGenerico);

      let imageBuffer = null;
      if (qrMode === 'custom' && customQRImagePath && fs.existsSync(customQRImagePath)) {
        imageBuffer = fs.readFileSync(customQRImagePath);
      } else if (qrMode === 'custom' && config.customQrDataUrl && String(config.customQrDataUrl).includes('base64,')) {
        const b64 = String(config.customQrDataUrl).split('base64,')[1];
        imageBuffer = Buffer.from(b64, 'base64');
      } else {
        const contenidoQR = JSON.stringify({
          evento: 'Boda - Acceso Jardín',
          invitado: guest.nombre || 'Invitado de Honor',
          pases: guest.pases || 1,
          mesa: guest.mesa || 'General',
          codigo: guest.codigo,
          valido: true
        });
        imageBuffer = await QRCode.toBuffer(contenidoQR, {
          width: 600,
          margin: 2,
          color: {
            dark: '#1e293b',
            light: '#ffffff'
          }
        });
      }

      await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: textoFinal,
        mimetype: 'image/png'
      });

      guest.estado = 'Enviado';
      guest.resultado = 'Exitoso';
      guest.horaEnvio = horaActual;
      sendingState.sentCount++;

      sendingState.results.push({
        id: guest.id,
        nombre: guest.nombre || '(Sin nombre especificado)',
        telefono: guest.telefono,
        pases: guest.pases,
        mesa: guest.mesa,
        tipoMensaje: guest.tipoMensaje,
        estado: 'EXITOSO',
        motivo: 'Entregado con QR de acceso',
        hora: horaActual,
        mensaje: textoFinal
      });

      logEvento(`✅ Enviado con éxito a: ${nombreDisplay} (${guest.telefono})`);

      if (supervisorJid && notifyMode === 'all') {
        try {
          await sock.sendMessage(supervisorJid, {
            text: `✅ *[BODA - INVITACIÓN ENTREGADA]*\n` +
              `👤 *Invitado:* ${guest.nombre || '(Sin nombre - Formal)'}\n` +
              `📱 *Teléfono:* ${guest.telefono}\n` +
              `🎫 *Pases:* ${guest.pases || '1'} | *Mesa:* ${guest.mesa || 'General'}\n` +
              `⏰ *Hora:* ${horaActual}\n` +
              `📊 *Progreso:* ${sendingState.sentCount + sendingState.errorCount}/${guestList.length}`
          });
        } catch (supErr) {
          console.warn('Aviso: no se envió reporte de éxito al supervisor:', supErr.message);
        }
      }

    } catch (err) {
      guest.estado = 'Error';
      guest.resultado = err.message || 'Error al enviar';
      guest.horaEnvio = horaActual;
      sendingState.errorCount++;

      sendingState.results.push({
        id: guest.id,
        nombre: guest.nombre || '(Sin nombre especificado)',
        telefono: guest.telefono,
        pases: guest.pases,
        mesa: guest.mesa,
        tipoMensaje: guest.tipoMensaje,
        estado: 'ERROR',
        motivo: err.message || 'Fallo de entrega',
        hora: horaActual,
        mensaje: '-'
      });

      logEvento(`❌ Error con ${nombreDisplay} (${guest.telefono}): ${err.message}`);

      if (supervisorJid) {
        try {
          const cleanDigits = String(guest.telefono || '').replace(/\D/g, '');
          const waDirectLink = cleanDigits ? `https://wa.me/${cleanDigits.length === 10 ? (defaultCountry + cleanDigits) : cleanDigits}` : 'Sin teléfono';
          await sock.sendMessage(supervisorJid, {
            text: `⚠️ *[ALERTA ERROR DE ENVÍO - BODA]*\n` +
              `👤 *Invitado:* ${guest.nombre || '(Sin nombre especificado)'}\n` +
              `📱 *Teléfono:* ${guest.telefono}\n` +
              `❌ *Motivo:* ${err.message || 'Fallo de entrega'}\n` +
              `🎫 *Pases:* ${guest.pases || '1'} | *Mesa:* ${guest.mesa || 'General'}\n` +
              `⏰ *Hora:* ${horaActual}\n\n` +
              `📲 *Enlace para atención manual:* ${waDirectLink}`
          });
        } catch (supErr) {
          console.warn('Aviso: no se envió alerta de error al supervisor:', supErr.message);
        }
      }
    }

    if (i < guestList.length - 1 && !sendingState.shouldStop) {
      const jitter = (Math.random() * 2 - 1) * 1000;
      const tiempoEspera = Math.max(3000, delaySeconds * 1000 + jitter);
      logEvento(`⏳ Esperando ${(tiempoEspera / 1000).toFixed(1)} segundos para el siguiente envío...`);
      await delay(tiempoEspera);
    }
  }

  sendingState.isRunning = false;
  sendingState.isPaused = false;
  logEvento(`🎉 Proceso concluido. Exitosos: ${sendingState.sentCount} | Fallos: ${sendingState.errorCount}`);

  if (supervisorJid) {
    try {
      const horaFin = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      await sock.sendMessage(supervisorJid, {
        text: `📋 *[RESUMEN FINAL DE CAMPAÑA - BODA]*\n\n` +
          `👥 *Total de la lista:* ${guestList.length}\n` +
          `✅ *Enviados exitosos:* ${sendingState.sentCount}\n` +
          `❌ *Errores / Fallidos:* ${sendingState.errorCount}\n` +
          `⏰ *Finalizado a las:* ${horaFin}\n\n` +
          `_El reporte detallado en Excel ya está listo para descargarse en el sistema web._`
      });
    } catch (supFinalErr) {
      console.warn('Aviso: no se envió resumen final al supervisor:', supFinalErr.message);
    }
  }

  guardarReporteEnDisco();
}

function logEvento(mensaje) {
  const timestamp = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = `[${timestamp}] ${mensaje}`;
  sendingState.logs.push(entry);
  if (sendingState.logs.length > 500) sendingState.logs.shift();
  console.log(entry);
}

// Pausar envíos
app.post('/api/pause-sending', (req, res) => {
  sendingState.isPaused = true;
  logEvento('⏸ Envíos pausados temporalmente.');
  res.json({ success: true, message: 'Envíos pausados' });
});

// Sincronizar lista de invitados desde el navegador hacia el servidor
app.post('/api/sync-guests', (req, res) => {
  try {
    const { guests } = req.body;
    if (Array.isArray(guests)) {
      currentGuests = guests;
    }
    res.json({ success: true, total: currentGuests.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reiniciar únicamente los resultados de envío (volver todos a Pendiente sin borrar la lista)
app.post('/api/reset-sending', (req, res) => {
  sendingState = {
    isRunning: false,
    isPaused: false,
    shouldStop: false,
    currentIndex: 0,
    total: currentGuests.length,
    sentCount: 0,
    errorCount: 0,
    results: [],
    logs: []
  };
  currentGuests.forEach(g => {
    g.estado = 'Pendiente';
    g.resultado = '';
    g.motivo = '';
    g.horaEnvio = '';
  });
  res.json({ success: true, message: 'Resultados de envío reiniciados a Pendiente.' });
});

// Limpiar absolutamente toda la lista y datos de envío en el servidor
app.post('/api/clear-all', (req, res) => {
  currentGuests = [];
  sendingState = {
    isRunning: false,
    isPaused: false,
    shouldStop: false,
    currentIndex: 0,
    total: 0,
    sentCount: 0,
    errorCount: 0,
    results: [],
    logs: []
  };
  res.json({ success: true, message: 'Lista y datos de envío eliminados por completo.' });
});

// Reanudar envíos
app.post('/api/resume-sending', (req, res) => {
  sendingState.isPaused = false;
  logEvento('▶ Envíos reanudados.');
  res.json({ success: true, message: 'Envíos reanudados' });
});

// Detener envíos
app.post('/api/stop-sending', (req, res) => {
  sendingState.shouldStop = true;
  sendingState.isRunning = false;
  sendingState.isPaused = false;
  logEvento('🛑 Proceso de envíos cancelado por el usuario.');
  res.json({ success: true, message: 'Proceso cancelado' });
});

// Obtener progreso de envíos
app.get('/api/send-progress', (req, res) => {
  const currentGuest = (sendingState.isRunning && currentGuests[sendingState.currentIndex])
    ? currentGuests[sendingState.currentIndex]
    : null;

  res.json({
    isRunning: sendingState.isRunning,
    isPaused: sendingState.isPaused,
    currentIndex: sendingState.currentIndex,
    currentGuestId: currentGuest ? currentGuest.id : null,
    total: sendingState.total,
    sentCount: sendingState.sentCount,
    errorCount: sendingState.errorCount,
    pendingCount: Math.max(0, sendingState.total - (sendingState.sentCount + sendingState.errorCount)),
    logs: sendingState.logs.slice(-50),
    results: sendingState.results
  });
});

// Servir imagen de QR de acceso para un invitado individual
app.get('/api/guest-qr/:id', async (req, res) => {
  try {
    const guestId = parseInt(req.params.id, 10);
    const guest = currentGuests.find(g => g.id === guestId);
    if (!guest) {
      return res.status(404).send('Invitado no encontrado');
    }

    if (customQRImagePath && fs.existsSync(customQRImagePath)) {
      return res.sendFile(customQRImagePath);
    }

    const contenidoQR = JSON.stringify({
      evento: 'Boda - Acceso Jardín',
      invitado: guest.nombre || 'Invitado de Honor',
      pases: guest.pases || 1,
      mesa: guest.mesa || 'General',
      codigo: guest.codigo,
      valido: true
    });

    const qrBuffer = await QRCode.toBuffer(contenidoQR, {
      width: 500,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="QR_${guest.codigo || ('invitado_' + guest.id)}.png"`);
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('Error al generar QR: ' + err.message);
  }
});

// Exportar distribución de equipo (Plan B) en Excel
app.post('/api/export-team-distribution', (req, res) => {
  try {
    const { assignments = [] } = req.body;
    if (!assignments || assignments.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay asignaciones para exportar' });
    }

    const wb = XLSX.utils.book_new();

    const allData = [];
    assignments.forEach(asig => {
      (asig.guests || []).forEach((g, idx) => {
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
      { wch: 22 },
      { wch: 6 },
      { wch: 30 },
      { wch: 18 },
      { wch: 8 },
      { wch: 10 },
      { wch: 15 },
      { wch: 32 },
      { wch: 55 }
    ];

    for (let r = 2; r <= allData.length + 1; r++) {
      const cellRef = `H${r}`;
      const cell = wsAll[cellRef];
      if (cell && cell.v && String(cell.v).startsWith('http')) {
        const url = String(cell.v).trim();
        cell.t = 's';
        cell.l = { Target: url, Tooltip: 'Clic para abrir WhatsApp con el mensaje listo' };
        cell.v = '📲 Clic para Abrir WhatsApp';
      }
    }

    XLSX.utils.book_append_sheet(wb, wsAll, 'Plan B - Todos');

    assignments.forEach(asig => {
      const safeSheetName = asig.collaborator.replace(/[:\\/?*\[\]]/g, '').slice(0, 28) || 'Equipo';
      const colabData = (asig.guests || []).map((g, idx) => ({
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
        { wch: 6 },
        { wch: 30 },
        { wch: 18 },
        { wch: 8 },
        { wch: 10 },
        { wch: 15 },
        { wch: 32 },
        { wch: 55 }
      ];

      for (let r = 2; r <= colabData.length + 1; r++) {
        const cellRef = `G${r}`;
        const cell = wsColab[cellRef];
        if (cell && cell.v && String(cell.v).startsWith('http')) {
          const url = String(cell.v).trim();
          cell.t = 's';
          cell.l = { Target: url, Tooltip: 'Clic para abrir WhatsApp con el mensaje listo' };
          cell.v = '📲 Clic para Abrir WhatsApp';
        }
      }

      XLSX.utils.book_append_sheet(wb, wsColab, safeSheetName);
    });

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fechaStr = new Date().toISOString().slice(0, 10);
    const fileName = `Plan_B_Distribucion_Equipo_${fechaStr}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al exportar distribución: ' + err.message });
  }
});

// Generar y descargar reporte en Excel
function generarLibroReporte() {
  const reportData = (sendingState.results.length > 0 ? sendingState.results : currentGuests).map((item, index) => ({
    'No.': index + 1,
    'Nombre del Invitado': item.nombre || '(Sin nombre - Mensaje formal)',
    'Teléfono': item.telefono,
    'Pases': item.pases || '1',
    'Mesa': item.mesa || '-',
    'Tipo de Invitación': item.tipoMensaje || (item.nombre ? 'Personalizado' : 'Formal Genérico'),
    'Estado de Envío': item.estado || 'Pendiente',
    'Motivo o Detalle': item.motivo || item.resultado || '-',
    'Hora de Envío': item.hora || item.horaEnvio || '-',
    'Mensaje Enviado': item.mensaje || '-'
  }));

  const ws = XLSX.utils.json_to_sheet(reportData);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 32 },
    { wch: 18 },
    { wch: 8 },
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
    { wch: 30 },
    { wch: 15 },
    { wch: 60 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Envíos');
  return wb;
}

function guardarReporteEnDisco() {
  try {
    const reportDir = path.join(__dirname, 'reportes');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const wb = generarLibroReporte();
    const fechaStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Reporte_Envios_Boda_${fechaStr}.xlsx`;
    const filePath = path.join(reportDir, fileName);
    XLSX.writeFile(wb, filePath);
    console.log(`Reporte guardado automáticamente en: ${filePath}`);
    return filePath;
  } catch (err) {
    console.error('Error al guardar reporte en disco:', err.message);
  }
}

app.get('/api/export-report', (req, res) => {
  try {
    const wb = generarLibroReporte();
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fechaStr = new Date().toISOString().slice(0, 10);
    const fileName = `Reporte_Invitaciones_Boda_${fechaStr}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al exportar reporte: ' + err.message });
  }
});

// Ruta de verificación de estado para servidores en la nube (Render / Railway)
app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, waStatus: waState.status, uptime: process.uptime() });
});

// Iniciar servidor escuchando en 0.0.0.0 (requerido para Render.com, Railway.app y nube)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🌸 Sistema Completo de Invitaciones de Boda (Node.js Cloud)`);
  console.log(`🌐 Servidor activo en el puerto: ${PORT}`);
  console.log(`====================================================`);

  // Auto-ping en Render.com para evitar suspensión mientras está activo
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  if (externalUrl) {
    setInterval(() => {
      fetch(`${externalUrl}/healthz`).catch(() => { });
    }, 10 * 60 * 1000);
  }
});

