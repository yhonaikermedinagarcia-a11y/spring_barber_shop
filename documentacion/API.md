# Referencia de la API

Contrato de `http://localhost:3000` para construir el frontend.

La colección de Postman (`postman/My Collection.postman_collection.json`) ejercita todo
lo de esta tabla: 28 peticiones y 49 aserciones. Es la fuente de verdad ejecutable.

---

## Convenciones

**Formato de respuesta.** Siempre JSON con `ok`. Las de éxito incluyen `message` y el
dato; las de error, `message` o `error`.

```jsonc
// éxito
{ "ok": true, "message": "...", "total": 3, "servicios": [ ... ] }
// error
{ "ok": false, "message": "El correo electrónico ya está registrado" }
```

**Errores.** No hay campo `errors` ni validación por campo: el `message` es una frase
lista para mostrar al usuario. La API no distingue campos: o acepta o devuelve 400.

**IDs.** Siempre enteros positivos en la URL. Un id no numérico (`abc`, `1.5`, `-1`)
devuelve `400`, no `500`.

**Fechas.** Entrada ISO: `2026-10-05T10:00:00`. Salida ISO con `Z`.

**Roles.** `cliente` (por defecto), `barbero`, `administrador`.

| Rol | Puede |
|---|---|
| `cliente` | Agendar y listar citas |
| `barbero` | Lo de cliente + cambiar estado de cita, gestionar su horario y sus servicios, ver el saldo |
| `administrador` | Todo lo anterior |

---

## Autenticación

### `POST /api/auth/login` · pública

```jsonc
// petición
{ "correo": "admin@barberia.com", "password": "secreto123" }

// respuesta 200
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "8h",
  "usuario": {
    "usuarioID": 1, "nombre": "Admin", "apellido": "Principal",
    "correo": "admin@barberia.com", "rol": "administrador"
  }
}
```

| Código | Cuándo |
|---|---|
| `200` | Credenciales correctas |
| `400` | Falta `correo` o `password` |
| `401` | Credenciales incorrectas (mensaje genérico, no revela si el correo existe) |
| `429` | Más de 10 intentos fallidos en 15 minutos |

El token va en `Authorization: Bearer <token>`. **No hay refresh ni logout**: dura 8 h
y hay que descartarlo a mano.

### `GET /api/auth/me` · requiere token

Devuelve el usuario del token. Útil al recargar la página.

```jsonc
// respuesta 200
{ "ok": true, "usuario": { "usuarioID": 1, "nombre": "Admin", "apellido": "Principal",
  "correo": "admin@barberia.com", "telefono": "3000000000", "rol": "administrador" } }
```

| Código | Cuándo |
|---|---|
| `200` | Sesión válida |
| `401` | Sin token, token inválido o expirado, o la cuenta ya no existe |

---

## Usuarios

> Campo de contraseña: **`clave` o `password`** (ambos funcionan). Obligatorios:
> `nombre`, `apellido`, `correo`, `telefono` y la contraseña. `rol` es opcional y
> por defecto vale `cliente`.

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/usuarios` | pública | `{ ok, total, usuarios: [...] }` |
| `GET` | `/api/usuarios/:id` | pública | `{ ok, usuario: {...} }` |
| `POST` | `/api/usuarios` | pública | `{ ok, message, usuario }` · `201` |
| `PUT` | `/api/usuarios/:id` | pública | `{ ok, message, usuario }` |
| `DELETE` | `/api/usuarios/:id` | pública | `{ ok, message, usuarioID }` |

```jsonc
// POST /api/usuarios
{ "nombre": "Ada", "apellido": "Lovelace", "correo": "ada@barberia.com",
  "telefono": "3000000000", "clave": "secreta123", "rol": "administrador" }

// un usuario devuelto (nunca incluye `clave`)
{ "usuarioID": 1, "nombre": "Ada", "apellido": "Lovelace",
  "correo": "ada@barberia.com", "telefono": "3000000000", "rol": "administrador" }
```

`PUT` es parcial: los campos ausentes se conservan.

| Error | Cuándo |
|---|---|
| `400` | Faltan obligatorios, o el `id` no es numérico |
| `404` | El usuario no existe (en `:id`) |
| `400` | Correo ya registrado |

**Aviso:** el `UNIQUE` de correo distingue mayúsculas. `Ada@x.com` y `ada@x.com` son
cuentas distintas.

---

## Servicios

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/servicios` | pública | `{ ok, total, servicios: [...] }` |
| `GET` | `/api/servicios/:id` | pública | `{ ok, servicio: {...} }` |
| `POST` | `/api/servicios` | pública | `{ ok, message, servicio }` · `201` |

```jsonc
// POST /api/servicios
{ "nombre": "Corte Clásico", "descripcion": "Corte tradicional",
  "precio": 15, "duracion_minutos": 30 }

// respuesta
{ "serviciosID": 1, "nombre": "Corte Clásico", "descripcion": "Corte tradicional",
  "precio": "15.00", "duracion_minutos": 30 }
```

`precio` y `duracion_minutos` son obligatorios y positivos. `precio` sale como string
(numérico de PostgreSQL), no como número.

> No hay `PUT` ni `DELETE`. Para modificar o borrar un servicio hay que hacerlo
> directamente en la base de datos.

---

## Barberos

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/barberos` | pública | `{ ok, total, barberos: [...] }` |
| `GET` | `/api/barberos/:id` | pública | `{ ok, barbero: {...} }` |
| `POST` | `/api/barberos` | pública | `{ ok, message, barbero }` · `201` |

```jsonc
// POST /api/barberos — convierte un usuario existente en barbero
{ "usuarioID": 1, "comision": 20.0, "estado": true }

// respuesta (incluye los datos del usuario unidos)
{ "barberoID": 1, "usuarioID": 1, "nombre": "Ada", "apellido": "Lovelace",
  "correo": "ada@barberia.com", "telefono": "3000000000",
  "comision": "20.00", "estado": true }
```

`estado` es opcional y por defecto `true` (barbero activo). **Un usuario solo puede
ser barbero una vez.**

> No hay `PUT` ni `DELETE`: no se puede cambiar la comisión ni desactivar un barbero
> desde la API.

---

## Servicios por barbero

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/barbero-servicios/barbero/:barberoID` | pública | `{ ok, total, servicios: [...] }` |
| `POST` | `/api/barbero-servicios` | `administrador` / `barbero` | `{ ok, message, asignacion }` · `201` |
| `DELETE` | `/api/barbero-servicios/:barberoID/:servicioID` | `administrador` / `barbero` | `{ ok, message, barbero_servicioID }` |

```jsonc
// POST /api/barbero-servicios
{ "barberoID": 1, "servicioID": 1 }
```

Asignar dos veces el mismo servicio devuelve `400`. No se puede asignar un servicio a
un barbero inexistente.

---

## Horarios laborales

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/horarios/barbero/:barberoID` | pública | `{ ok, total, horarios: [...] }` |
| `POST` | `/api/horarios` | `administrador` / `barbero` | `{ ok, message, horario }` · `201` |
| `DELETE` | `/api/horarios/barbero/:barberoID/:dia` | `administrador` / `barbero` | `{ ok, message, horarioID }` |

```jsonc
// POST /api/horarios — upsert: si el barbero ya tiene ese día, lo reemplaza
{ "barberoID": 1, "dia_semana": "lunes", "hora_inicio": "09:00", "hora_fin": "17:00" }

// respuesta
{ "horarioID": 1, "barberoID": 1, "dia_semana": "lunes",
  "hora_inicio": "09:00:00", "hora_fin": "17:00:00" }
```

| Campo | Notas |
|---|---|
| `dia_semana` | Uno de `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado`, `domingo`. Sin tilde y en minúsculas: se envía como sea y el servidor lo normaliza |
| `hora_inicio` / `hora_fin` | `HH:MM`. `hora_fin` debe ser **posterior** a `hora_inicio` |

Un horario por barbero y día: repetir el `POST` actualiza, no duplica.

---

## Citas

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/citas` | token | `{ ok, total, citas: [...] }` |
| `POST` | `/api/citas` | token | `{ ok, message, cita }` · `201` |
| `PUT` | `/api/citas/:id/estado` | `administrador` / `barbero` | `{ ok, message, cita }` |

```jsonc
// POST /api/citas
{ "clienteID": 2, "barberoID": 1, "servicioID": 1, "fecha_hora": "2026-10-05T10:00:00" }

// GET /api/citas — una cita trae los nombres ya unidos
{ "citaID": 1, "clienteID": 2, "barberoID": 1, "servicioID": 1,
  "fecha_inicio": "2026-10-05T14:00:00.000Z", "fecha_fin": "2026-10-05T14:30:00.000Z",
  "estado": "pendiente",
  "cliente_nombre": "Ada", "cliente_apellido": "Lovelace",
  "barbero_nombre": "Grace", "barbero_apellido": "Hopper",
  "servicio_nombre": "Corte Clásico", "precio": "15.00", "duracion_minutos": 30 }
```

**La hora de fin la calcula el servidor** a partir de `duracion_minutos` del servicio.
No se envía.

**Al agendar se valida, en este orden:**

1. El barbero existe y está activo.
2. El servicio existe.
3. El barbero tiene horario configurado para **ese día de la semana**.
4. La cita completa dentro de ese horario (empieza después de `hora_inicio` y
   termina antes de `hora_fin`).
5. No se solapa con otra cita del mismo barbero. Las canceladas no bloquean.

| Error | Cuándo |
|---|---|
| `400` | El barbero no tiene horario para ese día, o la cita cae fuera del horario |
| `400` | Se solapa con otra cita |
| `400` | El barbero no está activo |
| `400` | La cita cruzaría la medianoche |
| `404` | El barbero o el servicio no existen |

### Estados de una cita

`pendiente` → `confirmada` → `completada`, o → `cancelada` en cualquier momento.
**El servidor no impone el orden**: acepta cualquiera de los cuatro. La validación
vive en el frontend.

```jsonc
// PUT /api/citas/:id/estado
{ "estado": "confirmada" }
```

Un `401` significa token ausente o expirado. Un `403` significa rol insuficiente.

---

## Transacciones (saldo)

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| `GET` | `/api/transacciones` | **`administrador`** | `{ ok, total, transacciones: [...] }` |
| `POST` | `/api/transacciones` | **`administrador`** | `{ ok, message, transaccion }` · `201` |

```jsonc
// POST /api/transacciones
{ "usuarioID": 1, "tipo_movimiento": "recarga", "monto": 100,
  "saldo_restante": 100, "referencia_pago": "PAG-001" }

// respuesta
{ "transaccionID": 1, "usuarioID": 1, "tipo_movimiento": "recarga",
  "monto": "100.00", "saldo_restante": "100.00", "referencia_pago": "PAG-001",
  "fecha_creacion": "2026-10-03T15:42:32.918Z" }
```

`referencia_pago` es **obligatoria** aunque la columna no lo sugiera. `tipo_movimiento`
es texto libre: la base no valida los valores.

---

## Errores

| Código | Significado |
|---|---|
| `400` | Solicitud inválida o conflicto de negocio (datos faltantes, correo duplicado, barbero repetido, cita solapada o fuera de horario) |
| `401` | Sin autenticación: token ausente, inválido o expirado |
| `403` | Autenticado pero sin permiso (rol insuficiente) |
| `404` | Ruta o recurso inexistente |
| `429` | Demasiados intentos en `/api/auth/login` |
| `500` | Error interno del servidor |

Las rutas inexistentes devuelven 404 en JSON:

```json
{ "ok": false, "message": "Recurso no encontrado" }
```

---

## Lo que falta para un panel de administración

Si el frontend necesita gestionar el catálogo, la API tiene estos huecos:

| Módulo | Falta |
|---|---|
| Servicios | `PUT /api/servicios/:id`, `DELETE /api/servicios/:id` |
| Barberos | `PUT /api/barberos/:id` (cambiar comisión, activar/desactivar) |
| Citas | `GET /api/citas/:id`, `DELETE /api/citas/:id` |
| Horarios | `PUT` (se resuelve con otro `POST`, es un upsert) |
| Transacciones | `GET /api/transacciones/:id` |
| Auth | `POST /api/auth/logout` (hoy no hay revocación) |

Solo **usuarios** tiene el CRUD completo.