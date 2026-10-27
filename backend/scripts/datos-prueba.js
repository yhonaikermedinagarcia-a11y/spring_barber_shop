/*
 * Datos de prueba para probar el sistema con información realista.
 *
 * Uso:
 *   node scripts/datos-prueba.js            # crea los datos (no duplica)
 *   node scripts/datos-prueba.js --limpiar  # borra lo que creó este script
 *
 * Qué crea:
 *   - Un catálogo de servicios más completo.
 *   - Varios barberos (con su ficha, sus horarios y sus servicios).
 *   - Varios clientes.
 *   - Citas pasado (completadas, con pago y reseña) y futuras (pendientes).
 *   - Pagos: cobrados en el local, de pago móvil por revisar y rechazados.
 *   - Reseñas de los clientes sobre los barberos.
 *
 * Es idempotente: si se ejecuta dos veces no duplica nada, porque todo se
 * identifica por el correo `@springbarber.test`. Con `--limpiar` se borra
 * justo lo que creó este script y ni un dato más.
 *
 * Las contraseñas de los usuarios de prueba se pueden cambiar con la variable
 * de entorno `DEMO_PASSWORD`.
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { opcionesPool } = require('../src/config/dbConfig');

const CLAVE = process.env.DEMO_PASSWORD || 'springbarber2026';
const CORREO_BASE = 'springbarber.test';
const LIMPIAR = process.argv.includes('--limpiar');

const SERVICIOS = [
  { nombre: 'Corte clásico', descripcion: 'Corte de pelo a tijera y máquina, con lavado.', precio: 25000, duracion_minutos: 30 },
  { nombre: 'Fade premium', descripcion: 'Degradado a máquina con perfilado a navaja.', precio: 32000, duracion_minutos: 45 },
  { nombre: 'Arreglo de barba', descripcion: 'Perfilado y afeitado con toalla caliente.', precio: 18000, duracion_minutos: 20 },
  { nombre: 'Corte + barba', descripcion: 'Corte de pelo y arreglo de barba en una sola visita.', precio: 38000, duracion_minutos: 50 },
  { nombre: 'Corte infantil', descripcion: 'Corte para peques, con paciencia incluida.', precio: 15000, duracion_minutos: 25 },
];

const BARBEROS = [
  {
    nombre: 'Carlos',
    apellido: 'Navas',
    correo: `barbero1@${CORREO_BASE}`,
    telefono: '04124370853',
    comision: 30,
    descripcion: 'Especialista en fades y degradados a navaja.',
    especialidad: 'Fade',
    instagram: '@carlosnavas',
  },
  {
    nombre: 'Luis',
    apellido: 'Bracho',
    correo: `barbero2@${CORREO_BASE}`,
    telefono: '04124370854',
    comision: 25,
    descripcion: 'Barbas y afeitado clásico con toalla caliente.',
    especialidad: 'Barba',
    instagram: '@luisbarba',
  },
  {
    nombre: 'Miguel',
    apellido: 'Salazar',
    correo: `barbero3@${CORREO_BASE}`,
    telefono: '04124370855',
    comision: 20,
    descripcion: 'Cortes clásicos y peinados para el día a día.',
    especialidad: 'Clásico',
    instagram: '@miguelcuts',
  },
];

const CLIENTES = [
  { nombre: 'Ana', apellido: 'Rivas', correo: `cliente1@${CORREO_BASE}`, telefono: '04121111111' },
  { nombre: 'Pedro', apellido: 'Márquez', correo: `cliente2@${CORREO_BASE}`, telefono: '04122222222' },
  { nombre: 'Rosa', apellido: 'Guerrero', correo: `cliente3@${CORREO_BASE}`, telefono: '04123333333' },
  { nombre: 'Luis', apellido: 'Betancourt', correo: `cliente4@${CORREO_BASE}`, telefono: '04124444444' },
  { nombre: 'Sofía', apellido: 'Pineda', correo: `cliente5@${CORREO_BASE}`, telefono: '04125555555' },
];

const pool = new Pool(opcionesPool());

const preguntar = async (texto, valores) => {
  const r = await pool.query(texto, valores);
  return r.rows;
};

const existeUsuario = async (correo) => {
  const r = await pool.query('SELECT "usuarioID" FROM usuario WHERE correo = $1', [correo]);
  return r.rows[0]?.usuarioID ?? null;
};

const idServicioPorNombre = async (nombre) => {
  const r = await pool.query('SELECT "serviciosID" FROM servicios WHERE LOWER(nombre) = LOWER($1)', [nombre]);
  return r.rows[0]?.serviciosID ?? null;
};

/**
 * Fecha del día laborable (no domingo) a `diasAhead` días de `desde`.
 * @param {Date} desde
 * @param {number} diasAhead Puede ser negativo (historial).
 */
const proximoLaborable = (desde, diasAhead) => {
  const fecha = new Date(desde);
  fecha.setHours(12, 0, 0, 0);
  fecha.setDate(fecha.getDate() + diasAhead);
  // getDay() devuelve 0 para el domingo, que es el día de descanso.
  while (fecha.getDay() === 0) {
    fecha.setDate(fecha.getDate() + 1);
  }
  return fecha;
};

const ymd = (fecha) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
};

const limpiar = async () => {
  console.log('\n  Borrando los datos de prueba…\n');

  // Se borran de abajo arriba por las llaves foráneas.
  const correos = [...BARBEROS, ...CLIENTES].map((u) => u.correo);

  await preguntar('DELETE FROM transacciones WHERE "usuarioID" IN (SELECT "usuarioID" FROM usuario WHERE correo = ANY($1))', [correos]);
  await preguntar(
    `DELETE FROM transacciones
     WHERE "citaID" IN (
       SELECT c."citaID" FROM cita c
       JOIN barbero b ON b."barberoID" = c."barberoID"
       JOIN usuario u ON u."usuarioID" = b."usuarioID"
       WHERE u.correo = ANY($1)
     )`,
    [correos]
  );
  await preguntar(
    `DELETE FROM resena
     WHERE "barberoID" IN (
       SELECT b."barberoID" FROM barbero b
       JOIN usuario u ON u."usuarioID" = b."usuarioID"
       WHERE u.correo = ANY($1)
     )`,
    [correos]
  );
  await preguntar(
    `DELETE FROM cita
     WHERE "barberoID" IN (
       SELECT b."barberoID" FROM barbero b
       JOIN usuario u ON u."usuarioID" = b."usuarioID"
       WHERE u.correo = ANY($1)
     )`,
    [correos]
  );
  await preguntar(
    `DELETE FROM horario_laboral
     WHERE "barberoID" IN (
       SELECT b."barberoID" FROM barbero b
       JOIN usuario u ON u."usuarioID" = b."usuarioID"
       WHERE u.correo = ANY($1)
     )`,
    [correos]
  );
  await preguntar(
    `DELETE FROM barbero_servicio
     WHERE "barberoID" IN (
       SELECT b."barberoID" FROM barbero b
       JOIN usuario u ON u."usuarioID" = b."usuarioID"
       WHERE u.correo = ANY($1)
     )`,
    [correos]
  );
  await preguntar('DELETE FROM barbero WHERE "usuarioID" IN (SELECT "usuarioID" FROM usuario WHERE correo = ANY($1))', [correos]);
  await preguntar('DELETE FROM usuario WHERE correo = ANY($1)', [correos]);

  console.log('    ✓ Datos de prueba borrados.\n');
};

const crear = async () => {
  console.log('\n  Creando datos de prueba…\n');

  const hash = await bcrypt.hash(CLAVE, 10);

  // 1. Servicios
  const idsServicios = {};
  for (const s of SERVICIOS) {
    const existente = await idServicioPorNombre(s.nombre);
    if (existente) {
      idsServicios[s.nombre] = existente;
      console.log(`    · ${s.nombre} (ya existía)`);
      continue;
    }
    const r = await preguntar(
      `INSERT INTO servicios (nombre, descripcion, precio, duracion_minutos)
       VALUES ($1, $2, $3, $4) RETURNING "serviciosID"`,
      [s.nombre, s.descripcion, s.precio, s.duracion_minutos]
    );
    idsServicios[s.nombre] = r[0].serviciosID;
    console.log(`    ✓ ${s.nombre}`);
  }

  // 2. Usuarios
  const idsUsuarios = {};

  const crearUsuario = async (u, rol) => {
    const existente = await existeUsuario(u.correo);
    if (existente) {
      idsUsuarios[u.correo] = existente;
      console.log(`    · ${u.correo} (ya existía)`);
      return;
    }
    const r = await preguntar(
      `INSERT INTO usuario (nombre, apellido, correo, telefono, rol, clave)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING "usuarioID"`,
      [u.nombre, u.apellido, u.correo, u.telefono, rol, hash]
    );
    idsUsuarios[u.correo] = r[0].usuarioID;
    console.log(`    ✓ ${u.correo}`);
  };

  for (const b of BARBEROS) await crearUsuario(b, 'barbero');
  for (const c of CLIENTES) await crearUsuario(c, 'cliente');

  // 3. Fichas de barbero, horarios y servicios
  const idsBarberos = {};

  for (const b of BARBEROS) {
    const usuarioID = idsUsuarios[b.correo];

    const barbero = await preguntar(
      `SELECT "barberoID" FROM barbero WHERE "usuarioID" = $1`,
      [usuarioID]
    );

    if (barbero.length === 0) {
      const r = await preguntar(
        `INSERT INTO barbero ("usuarioID", comision, estado, descripcion, especialidad, instagram, telefono_contacto)
         VALUES ($1, $2, true, $3, $4, $5, $6) RETURNING "barberoID"`,
        [usuarioID, b.comision, b.descripcion, b.especialidad, b.instagram, b.telefono]
      );
      idsBarberos[b.correo] = r[0].barberoID;
      console.log(`    ✓ ficha de ${b.nombre}`);
    } else {
      idsBarberos[b.correo] = barbero[0].barberoID;
    }

    const barberoID = idsBarberos[b.correo];

    // Horario: de lunes a sábado, de 9:00 a 18:00, con almuerzo de 12:00 a 13:00.
    const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    for (const dia of dias) {
      await preguntar(
        `INSERT INTO horario_laboral ("barberoID", dia_semana, hora_inicio, hora_fin, almuerzo_inicio, almuerzo_fin)
         VALUES ($1, $2, '09:00', '18:00', '12:00', '13:00')
         ON CONFLICT ("barberoID", dia_semana) DO NOTHING`,
        [barberoID, dia]
      );
    }

    // Servicios: cada barbero hace todos menos el corte infantil.
    const serviciosDelBarbero = SERVICIOS.filter((s) => s.nombre !== 'Corte infantil');
    for (const s of serviciosDelBarbero) {
      await preguntar(
        `INSERT INTO barbero_servicio ("barberoID", "servicioID")
         VALUES ($1, $2) ON CONFLICT ("barberoID", "servicioID") DO NOTHING`,
        [barberoID, idsServicios[s.nombre]]
      );
    }
  }

  console.log('    ✓ horarios y servicios de los barberos');

  // 4. Citas
  const hoy = new Date();
  let creadas = 0;
  let citasPasadas = [];

  for (let i = 0; i < 18; i += 1) {
    const barbero = BARBEROS[i % BARBEROS.length];
    const cliente = CLIENTES[i % CLIENTES.length];
    const servicio = SERVICIOS[i % 3];
    const barberoID = idsBarberos[barbero.correo];
    const clienteID = idsUsuarios[cliente.correo];

    // Mitad hacia atrás (historial) y mitad hacia adelante (agenda abierta).
    const haciaAtras = i % 2 === 0;
    const fecha = proximoLaborable(hoy, haciaAtras ? -(7 + (i % 20)) : 1 + (i % 12));

    const hora = 9 + ((i * 2) % 8); // de 9:00 a 16:00, sin solaparse por barbero
    const duracion = servicio.duracion_minutos;
    const inicio = new Date(fecha);
    inicio.setHours(hora, 0, 0, 0);
    const fin = new Date(inicio.getTime() + duracion * 60000);

    const existe = await preguntar(
      `SELECT "citaID" FROM cita
       WHERE "barberoID" = $1
         AND fecha_inicio < $3
         AND fecha_fin   > $2`,
      [barberoID, inicio, fin]
    );
    if (existe.length > 0) continue;

    // Los domingos y los feriados no se agendan.
    const feriado = await preguntar('SELECT 1 FROM feriado WHERE fecha = $1', [ymd(inicio)]);
    if (feriado.length > 0) continue;

    const estado = haciaAtras ? 'completada' : i % 3 === 0 ? 'confirmada' : 'pendiente';

    const r = await preguntar(
      `INSERT INTO cita ("clienteID", "barberoID", "servicioID", fecha_inicio, fecha_fin, estado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING "citaID"`,
      [clienteID, barberoID, idsServicios[servicio.nombre], inicio, fin, estado]
    );

    const citaID = r[0].citaID;
    creadas += 1;

    // 5. Pagos y reseñas de las citas ya completadas
    if (estado === 'completada') {
      citasPasadas.push({ citaID, barberoID, clienteID, servicio });

      const metodo = i % 3 === 0 ? 'tarjeta' : 'efectivo';
      await preguntar(
        `INSERT INTO transacciones ("citaID", "usuarioID", metodo_pago, estado, monto, referencia_pago)
         VALUES ($1, $2, $3, 'completado', $4, $5)`,
        [citaID, clienteID, metodo, servicio.precio, `CAJA-${citaID}`]
      );
    }
  }

  console.log(`    ✓ ${creadas} citas`);

  // Un par de pagos por revisar (pago móvil) y una reseña de cada cliente.
  const citasCompletadas = citasPasadas.slice(0, 2);
  for (const c of citasCompletadas) {
    await preguntar(
      `INSERT INTO transacciones ("citaID", "usuarioID", metodo_pago, estado, monto, referencia_pago)
       VALUES ($1, $2, 'pago_movil', 'pendiente', $3, $4)`,
      [c.citaID, c.clienteID, c.servicio.precio, `PAGO-MOVIL-${c.citaID}`]
    );
  }
  if (citasCompletadas.length > 0) {
    console.log(`    ✓ ${citasCompletadas.length} pagos por revisar`);
  }

  const comentarios = [
    'Excelente corte, muy puntual.',
    'Buen trabajo y buena atención.',
    'Me gustó el resultado, volveré.',
    'Corte rápido y prolijo.',
    'El perfilado de barba quedó perfecto.',
  ];

  for (const c of citasPasadas) {
    const yaExiste = await preguntar(
      'SELECT 1 FROM resena WHERE "barberoID" = $1 AND "autorID" = $2',
      [c.barberoID, c.clienteID]
    );
    if (yaExiste.length > 0) continue;

    await preguntar(
      `INSERT INTO resena ("barberoID", "autorID", calificacion, comentario)
       VALUES ($1, $2, $3, $4)`,
      [
        c.barberoID,
        c.clienteID,
        c.citaID % 2 === 0 ? 5 : 4,
        comentarios[c.citaID % comentarios.length],
      ]
    );
  }

  console.log('    ✓ reseñas');

  // 6. Un movimiento de saldo de ejemplo (el libro de prepago).
  const primerCliente = idsUsuarios[CLIENTES[0].correo];
  const saldo = await preguntar(
    `SELECT 1 FROM transacciones WHERE "usuarioID" = $1 AND tipo_movimiento = 'recarga'`,
    [primerCliente]
  );
  if (saldo.length === 0) {
    await preguntar(
      `INSERT INTO transacciones ("usuarioID", tipo_movimiento, monto, saldo_restante, referencia_pago)
       VALUES ($1, 'recarga', 100, 100, 'RECARGA-DEMO-1')`,
      [primerCliente]
    );
    console.log('    ✓ saldo de ejemplo');
  }

  console.log('\n  Listo. Usuarios de prueba (contraseña: la misma para todos):\n');
  for (const b of BARBEROS) {
    console.log(`    barbero    ${b.correo.padEnd(28)} ${CLAVE}`);
  }
  for (const c of CLIENTES) {
    console.log(`    cliente    ${c.correo.padEnd(28)} ${CLAVE}`);
  }
  console.log('\n  Para borrar todo esto otra vez: node scripts/datos-prueba.js --limpiar\n');
};

(async () => {
  try {
    if (LIMPIAR) await limpiar();
    else await crear();
  } catch (error) {
    console.error('\n  Error al preparar los datos de prueba:', error.message, '\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
