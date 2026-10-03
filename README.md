# Spring Barber Shop - Backend API

Plataforma SaaS de agendamiento y gestión operativa para barberías. Este proyecto provee una API RESTful robusta, segura y escalable para gestionar clientes, personal, catálogos de servicios, agendamiento de citas sin colisiones y un registro financiero mediante un sistema de saldo/monedero.

## 🚀 Tecnologías y Arquitectura

El sistema está construido bajo el patrón de diseño **MVC** (Modelo-Vista-Controlador) orientado a APIs.

*   **Entorno:** Node.js
*   **Framework:** Express.js
*   **Base de Datos:** PostgreSQL (paquete `pg` con Pool de conexiones)
*   **Seguridad:** Autenticación Stateless con JSON Web Tokens (JWT) y cifrado de contraseñas con `bcryptjs`.

## 📋 Prerrequisitos

*   [Node.js](https://nodejs.org/) **v18 o superior** — Express 5 lo exige; con Node 16 el proyecto no arranca
*   [PostgreSQL](https://www.postgresql.org/) v13 o superior
*   Git

## 🔧 Instalación y Configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/yhonaikermedinagarcia-a11y/spring_barber_shop.git
cd spring_barber_shop/backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar las variables de entorno

```bash
cp .env.example .env
```

`.env.example` trae `cambiar_esto` como valor de la contraseña y del secreto JWT.
**No sirve tal cual**: hay que editar dos líneas antes de seguir.

```bash
# En .env sustituye:
#   DB_PASSWORD=cambiar_esto   ->  la contraseña real de tu usuario de PostgreSQL
#   JWT_SECRET=cambiar_esto   ->  una cadena larga y aleatoria
# Genera una con: openssl rand -hex 32
```

| Variable | Por defecto | Descripción |
|---|---|---|
| `DB_HOST` | `localhost` | Host de PostgreSQL |
| `DB_PORT` | `5432` | Puerto de PostgreSQL |
| `DB_NAME` | `barberia` | Nombre de la base de datos |
| `DB_USER` | `postgres` | Usuario de PostgreSQL |
| `DB_PASSWORD` | — | Contraseña (**obligatoria**) |
| `JWT_SECRET` | — | Secreto para firmar los tokens (**obligatorio**) |
| `PORT` | `3000` | Puerto donde escucha la API |

El nombre de la base debe ser **el mismo** en `.env` y en el paso 4. Si cambias
`DB_NAME`, cambia también el `CREATE DATABASE`.

### 4. Crear la base de datos

```bash
# El nombre debe coincidir con DB_NAME de tu .env
psql -U postgres -c "CREATE DATABASE barberia;"
```

Si ya existe, PostgreSQL avisa y no pasa nada. En Windows, `psql` suele estar en
`C:\Program Files\PostgreSQL\<versión>\bin` y quizá no esté en el PATH.

### 5. Aplicar las migraciones

```bash
npm run migrate
```

Crea el esquema completo. **Paso obligatorio**: sin él el servidor arranca pero todas
las peticiones devuelven `500` con `relation does not exist`.

```
Aplicando 7 de 7 migraciones:
  000_esquema_base.sql ... ok
  ...
  006_modulo_transacciones.sql ... ok
7 migración(es) aplicada(s).
```

Para consultar el estado: `npm run migrate:status`.

### 6. Arrancar el servidor

```bash
npm start
```

Si todo está correcto:

```
✅ Conexión exitosa a PostgreSQL (Base de datos: barberia)
🚀 Servidor corriendo en http://localhost:3000
```

### 7. Comprobar que funciona

```bash
curl http://localhost:3000/
```

O abre `postman/My Collection.postman_collection.json` en Postman y pulsa **Run**.
Si los 30 pasos y 53 aserciones quedan en verde, el backend está correcto.

## ⚠️ Si algo falla

El servidor **no arranca** si no puede conectarse a PostgreSQL, y el error indica qué
variable revisar:

```
❌ No se pudo conectar con PostgreSQL
   password authentication failed for user "postgres"

   Revisa backend/.env:
     DB_HOST=localhost
     DB_PORT=5432
     DB_NAME=barberia
     DB_USER=postgres
```

| Síntoma | Causa habitual |
|---|---|
| `password authentication failed` | `DB_PASSWORD` incorrecta |
| `database "X" does not exist` | Falta crear la base (paso 4), o `DB_NAME` no coincide |
| `ECONNREFUSED` | PostgreSQL no está corriendo |
| `Falta la variable de entorno JWT_SECRET` | No se editó `JWT_SECRET` en el paso 3 |
| Todo devuelve `500` con `relation does not exist` | Saltó el paso 5, `npm run migrate` |

## 🗄️ Esquema de Base de Datos

El núcleo opera sobre 7 entidades con integridad referencial estricta y restricciones UNIQUE y CHECK:

| Entidad | Descripción |
|---|---|
| `usuario` | Autenticación y roles |
| `barbero` | Perfiles operativos |
| `servicios` | Catálogo de prestaciones |
| `cita` | Eje transaccional de agendamiento |
| `horario_laboral` | Gestión de jornadas y turnos |
| `barbero_servicio` | Relación dinámica de habilidades del personal |
| `transacciones` | Sistema de monedero/saldo para el modelo de negocio |

### Migraciones

El esquema se construye aplicando en orden los archivos `.sql` de `backend/migrations/`. El registro de cuáles se aplicó vive en la tabla `schema_migrations`.

```bash
npm run migrate:status   # ver cuáles faltan
npm run migrate          # aplicar las pendientes
```

Las migraciones son idempotentes: se pueden reaplicar sin efectos duplicados. Para reconstruir el esquema desde cero basta con crear una base vacía y ejecutar `npm run migrate`.

| # | Archivo | Qué hace |
|---|---|---|
| 000 | `000_esquema_base.sql` | Crea las 7 tablas con sus constraints |
| 001 | `001_agregar_estado_cita.sql` | Agrega `cita.estado` y su CHECK |
| 002 | `002_llaves_foraneas.sql` | Agrega las 8 llaves foráneas |
| 003 | `003_constraints_unique.sql` | `UNIQUE` en `usuario.correo` y `barbero.usuarioID` |
| 004 | `004_modulo_horario_laboral.sql` | `UNIQUE` y CHECKs de `horario_laboral` |
| 005 | `005_modulo_barbero_servicio.sql` | `UNIQUE` del par en `barbero_servicio` |
| 006 | `006_modulo_transacciones.sql` | `fecha_creacion` con `DEFAULT now()` y `NOT NULL` |

### Aplicación manual (opcional)

Si prefieres no usar el runner, puedes aplicar los archivos en orden desde `psql`:

```bash
psql -U postgres -d spring_barber_shop \
  -f backend/migrations/000_esquema_base.sql \
  -f backend/migrations/001_agregar_estado_cita.sql \
  -f backend/migrations/002_llaves_foraneas.sql \
  -f backend/migrations/003_constraints_unique.sql \
  -f backend/migrations/004_modulo_horario_laboral.sql \
  -f backend/migrations/005_modulo_barbero_servicio.sql \
  -f backend/migrations/006_modulo_transacciones.sql
```

## 📡 Endpoints Principales

Todas las respuestas de la API utilizan un formato JSON estandarizado: `{ "ok": true/false, ...data }`.

| Módulo | Endpoint | Método | Protección | Descripción |
|---|---|---|---|---|
| Auth | `/api/auth/login` | POST | Pública | Inicia sesión y retorna JWT |
| Usuarios | `/api/usuarios` | GET, POST | Pública/JWT | CRUD de clientes/empleados |
| Servicios | `/api/servicios` | GET, POST | Pública/JWT | Catálogo de prestaciones |
| Barberos | `/api/barberos` | GET, POST | Pública/JWT | Gestión de personal operativo |
| Horarios | `/api/horarios` | POST | Barbero/Admin | Configura la jornada laboral |
| Citas | `/api/citas` | POST | Autenticado | Crea cita validando disponibilidad y horario |
| Citas | `/api/citas/:id/estado` | PUT | Barbero/Admin | Modifica el estado (pendiente, completada, etc.) |
| B-Servicio | `/api/barbero-servicios` | POST, DELETE | Barbero/Admin | Asigna o desvincula servicios a un barbero |
| Finanzas | `/api/transacciones` | GET, POST | Barbero/Admin | Registra movimientos en el saldo del usuario |

### Flujo de autenticación

Todas las rutas protegidas esperan el token en el header `Authorization: Bearer <token>`.

> **Ojo con el nombre del campo de la contraseña.** En `POST /api/usuarios` el campo
> histórico es `clave`, aunque **`password` también funciona** (se acepta cualquiera de
> los dos). En `POST /api/auth/login` el campo es `password`. Ningún otro endpoint recibe
> contraseña. Todos los campos marcados como obligatorios en la tabla siguiente deben
> enviarse o la respuesta es `400`.

```bash
# 1. Crear un usuario (o usar uno existente).
#    Obligatorios: nombre, apellido, correo, telefono, clave (o password)
curl -X POST http://localhost:3000/api/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Admin","apellido":"Principal","correo":"admin@barberia.com","telefono":"3000000000","clave":"secreto123","rol":"administrador"}'

# 2. Login → retorna JWT
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@barberia.com","password":"secreto123"}'

# Respuesta:
# {
#   "ok": true,
#   "token": "eyJhbGciOi...",
#   "expiresIn": "8h",
#   "usuario": { "usuarioID": 1, "nombre": "Admin", "apellido": "Principal",
#                "correo": "admin@barberia.com", "rol": "administrador" }
# }

# 3. Averiguar quién está autenticado (imprescindible al recargar la página)
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer eyJhbGciOi..."

# 4. Usar el token en rutas protegidas
curl http://localhost:3000/api/citas \
  -H "Authorization: Bearer eyJhbGciOi..."
```

**Sobre la sesión:** el token dura 8 horas (`expiresIn`). No hay endpoint de refresh ni
de logout, así que el frontend debe:

- guardarlo (localStorage o similar) y adjuntarlo en cada petición protegida;
- limpiarlo al expirar o ante un `401`, y volver a pedir credenciales;
- usar `GET /api/auth/me` al arrancar para saber si la sesión sigue viva.

### Crear el primer administrador

El sistema requiere al menos un usuario con rol `administrador` para gestionar citas y transacciones. Crea uno antes de iniciar operaciones:

```bash
curl -X POST http://localhost:3000/api/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Admin","apellido":"Principal","correo":"admin@barberia.com","telefono":"3000000000","clave":"cambia-esto","rol":"administrador"}'
```

Luego inicia sesión con ese usuario para obtener el token de administrador.

## 📁 Estructura del Proyecto

```
backend/
├── migrations/           # Archivos SQL idempotentes (000–006)
├── scripts/
│   └── migrate.js        # Runner de migraciones
├── src/
│   ├── config/           # db.js (Pool pg), jwt.js (firma/verificación)
│   ├── controllers/      # Lógica de cada módulo
│   ├── middlewares/      # authMiddleware.js (verificación JWT)
│   ├── routes/           # Definición de rutas por módulo
│   └── app.js            # Punto de entrada, montaje de middlewares
├── .env.example          # Plantilla de variables de entorno
├── .env                  # Credenciales locales (ignorado por git)
└── package.json
```

## ⚠️ Manejo de Errores

Formato de respuesta exitosa:
```json
{ "ok": true, "data": { ... } }
```

Formato de respuesta con error:
```json
{ "ok": false, "error": "Credenciales inválidas" }
```

Errores comunes:

| Código | Significado |
|---|---|
| `400` | Solicitud inválida o conflicto de negocio (datos faltantes, correo duplicado, barbero repetido, cita solapada o fuera de horario) |
| `401` | No autenticado (token ausente o inválido) |
| `403` | Prohibido (rol insuficiente) |
| `404` | Ruta o recurso inexistente |
| `429` | Demasiados intentos de acceso a `/api/auth/login` |
| `500` | Error interno del servidor |

> **Nota:** Las rutas no encontradas están manejadas globalmente y retornan un error 404 Not Found en formato JSON.

### Limitación de intentos de acceso

`POST /api/auth/login` acepta **10 intentos fallidos por IP cada 15 minutos**; a partir
del siguiente responde `429`. Solo se cuentan los fallos: un login correcto no suma y
además reinicia el contador, de modo que quien se equivoca unas veces y luego entra
bien no arrastra el presupuesto. La respuesta incluye las cabeceras `RateLimit` y
`Retry-After`.

Dos cosas que conviene tener presentes al desplegar:

- **Si hay un proxy o balanceador delante**, hay que configurar `trust proxy` en
  `app.js`. Sin eso todas las peticiones parecen venir de la misma IP y el límite se
  agota de golpe para todos los usuarios.
- **Con varias réplicas**, el contador vive en la memoria de cada proceso, así que el
  límite real se multiplica por el número de servidores. La solución es un almacén
  compartido (Redis).

## Pruebas E2E

La colección de Postman (`postman/My Collection.postman_collection.json`) recorre
los 8 módulos con 28 peticiones y 49 aserciones: el flujo completo, los 401 sin
token, los 403 por rol insuficiente, los 400 de validación, los 404 y los casos de
conflicto (correo duplicado, barbero repetido, cita solapada, cita fuera de
horario).

Las fechas se calculan en el pre-request de la colección a partir del día actual, de
modo que siempre agenda el próximo lunes a las 10:00 dentro del horario configurado
y la suite no caduca con el paso del tiempo. Los correos llevan `{{$timestamp}}` y
`{{$randomInt}}`, así que la colección se puede reejecutar sobre la misma base.

```bash
# terminal 1: base de datos de pruebas y servidor
cd backend
DB_NAME=e2e_local npm run migrate
DB_NAME=e2e_local JWT_SECRET=local npm start

# terminal 2: la colección
npx newman run "postman/My Collection.postman_collection.json" \
  --env-var "base_url=http://localhost:3000"
```

En GitHub Actions corre sola en cada push y pull request: levanta PostgreSQL, aplica
las migraciones, espera a que la API responda antes de probar y publica el informe
HTML como artefacto aunque la suite falle.
