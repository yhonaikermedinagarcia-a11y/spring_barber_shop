# Spring Barber Shop - Backend API

Plataforma SaaS de agendamiento y gestión operativa para barberías. Este proyecto provee una API RESTful robusta, segura y escalable para gestionar clientes, personal, catálogos de servicios, agendamiento de citas sin colisiones y un registro financiero mediante un sistema de saldo/monedero.

## 🚀 Tecnologías y Arquitectura

El sistema está construido bajo el patrón de diseño **MVC** (Modelo-Vista-Controlador) orientado a APIs.

*   **Entorno:** Node.js
*   **Framework:** Express.js
*   **Base de Datos:** PostgreSQL (paquete `pg` con Pool de conexiones)
*   **Seguridad:** Autenticación Stateless con JSON Web Tokens (JWT) y cifrado de contraseñas con `bcryptjs`.

## 📋 Prerrequisitos

*   [Node.js](https://nodejs.org/) (v16 o superior)
*   [PostgreSQL](https://www.postgresql.org/) (v13 o superior)
*   Git

## 🔧 Instalación y Configuración

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/spring_barber_shop.git
   cd spring_barber_shop/backend
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   # editar .env con las credenciales de PostgreSQL
   ```

   Variables esperadas en `.env`:

   | Variable | Descripción |
   |---|---|
   | `DB_HOST` | Host de PostgreSQL (ej. `localhost`) |
   | `DB_PORT` | Puerto (ej. `5432`) |
   | `DB_NAME` | Nombre de la base de datos |
   | `DB_USER` | Usuario de PostgreSQL |
   | `DB_PASSWORD` | Contraseña de PostgreSQL |
   | `JWT_SECRET` | Secreto para firmar tokens JWT |
   | `PORT` | Puerto del servidor (ej. `3000`) |

4. **Crear la base de datos y aplicar migraciones**
   ```bash
   # Conéctate a PostgreSQL y crea la base (si no existe)
   psql -U postgres -c "CREATE DATABASE spring_barber_shop;"

   # Aplica las migraciones desde el directorio backend/
   npm run migrate
   ```

5. **Iniciar el servidor**
   ```bash
   npm start
   ```

La API queda disponible en `http://localhost:3000`.

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

```bash
# 1. Crear un usuario (o usar uno existente)
curl -X POST http://localhost:3000/api/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Admin","correo":"admin@barberia.com","password":"secreto123","rol":"administrador"}'

# 2. Login → retorna JWT
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@barberia.com","password":"secreto123"}'
# Respuesta: { "ok": true, "token": "eyJhbGciOi..." }

# 3. Usar el token en rutas protegidas
curl http://localhost:3000/api/citas \
  -H "Authorization: Bearer eyJhbGciOi..."
```

### Crear el primer administrador

El sistema requiere al menos un usuario con rol `administrador` para gestionar citas y transacciones. Crea uno antes de iniciar operaciones:

```bash
curl -X POST http://localhost:3000/api/usuarios \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Admin Principal","correo":"admin@barberia.com","password":"cambia-esto","rol":"administrador"}'
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
