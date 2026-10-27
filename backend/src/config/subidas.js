/*
 * Configuración de las subidas de archivos (multer).
 *
 * Se usa para dos cosas: el comprobante de un pago móvil y la foto de un
 * barbero. Los dos archivos se guardan en `backend/uploads` y se sirven como
 * estáticos desde `/uploads`, que es la ruta que guarda la base de datos.
 *
 * El nombre del archivo lo genera `crypto.randomUUID()`: si se usara el
 * nombre que envía el cliente, dos personas podrían subir archivos con el
 * mismo nombre y uno pisaría al otro.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const CARPETA = path.resolve(__dirname, '../../uploads');

// Si la carpeta no existe, multer falla al escribir. Se crea al arrancar.
fs.mkdirSync(CARPETA, { recursive: true });

/*
 * Tipos admitidos y la extensión con la que se guardan.
 *
 * La extensión sale del tipo, **no** del nombre que manda el cliente. Antes
 * se respetaba el nombre original: un "comprobante.html" con Content-Type
 * image/png se guardaba como .html y se servía como página web desde el mismo
 * dominio que la web, con acceso a la sesión del administrador que lo abría.
 */
const TIPOS_PERMITIDOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

/*
 * Firma (primeros bytes) de cada tipo. El Content-Type lo decide el cliente,
 * así que además se comprueba que el contenido sea de verdad lo que dice.
 */
const FIRMAS = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  'image/gif': (b) => b.slice(0, 4).toString('latin1') === 'GIF8',
  'application/pdf': (b) => b.slice(0, 5).toString('latin1') === '%PDF-',
};

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA),
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${TIPOS_PERMITIDOS[file.mimetype] || ''}`);
  },
});

const multerBase = multer({
  storage: almacenamiento,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS[file.mimetype]) {
      const error = new Error('El archivo debe ser una imagen (JPG, PNG, WEBP o GIF) o un PDF');
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

const borrar = (ruta) => fs.promises.unlink(ruta).catch(() => {});

/*
 * Si la petición termina en error (validación, permisos, hora ocupada...),
 * el archivo que multer ya escribió se borra. Antes se quedaban huérfanos en
 * el disco y, como la reserva pública no pide sesión, cualquiera podía
 * llenarlo con peticiones inválidas.
 */
const limpiarSiFalla = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 && req.file?.path) borrar(req.file.path);
  });
  next();
};

const comprobarContenido = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const manejador = await fs.promises.open(req.file.path, 'r');
    const cabecera = Buffer.alloc(12);
    await manejador.read(cabecera, 0, 12, 0);
    await manejador.close();
    if (!FIRMAS[req.file.mimetype]?.(cabecera)) {
      return res.status(400).json({
        ok: false,
        message: 'El archivo no es una imagen o un PDF válido',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Misma forma de uso que multer: `subirArchivo.single('campo')`.
const subirArchivo = {
  single: (campo) => [limpiarSiFalla, multerBase.single(campo), comprobarContenido],
};

// Ruta pública con la que se guarda el archivo en la base de datos.
const rutaPublica = (nombreArchivo) => `/uploads/${nombreArchivo}`;

module.exports = { subirArchivo, rutaPublica, CARPETA };
