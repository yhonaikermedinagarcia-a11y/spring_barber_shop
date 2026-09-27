# spring_barber_shop
Plataforma web SaaS de agendamiento en línea y gestión operativa automatizada orientada a barberías.

## Puesta en marcha

```bash
cd backend
npm install
cp .env .env.example   # y ajustar credenciales de PostgreSQL
npm run migrate        # crea el esquema completo
npm start
```

La API queda en `http://localhost:3000`.

## Migraciones

El esquema se construye aplicando en orden los archivos `.sql` de
`backend/migrations/`. El registro de cuáles se aplicó vive en la tabla
`schema_migrations`.

```bash
npm run migrate:status   # ver cuáles faltan
npm run migrate          # aplicar las pendientes
```

Las migraciones son idempotentes: se pueden reaplicar sin efectos duplicados. Para
reconstruir el esquema desde cero basta con crear una base vacía y ejecutar
`npm run migrate`.

| # | Archivo | Qué hace |
|---|---|---|
| 000 | `000_esquema_base.sql` | Crea las 7 tablas con sus constraints |
| 001 | `001_agregar_estado_cita.sql` | Agrega `cita.estado` y su CHECK |
| 002 | `002_llaves_foraneas.sql` | Agrega las 8 llaves foráneas |
| 003 | `003_constraints_unique.sql` | `UNIQUE` en `usuario.correo` y `barbero.usuarioID` |
| 004 | `004_modulo_horario_laboral.sql` | `UNIQUE` y CHECKs de `horario_laboral` |
| 005 | `005_modulo_barbero_servicio.sql` | `UNIQUE` del par en `barbero_servicio` |
| 006 | `006_modulo_transacciones.sql` | `fecha_creacion` con `DEFAULT now()` y `NOT NULL` |

## Módulos de la API

| Ruta | Descripción | Acceso |
|---|---|---|
| `/api/usuarios` | CRUD de usuarios | público |
| `/api/servicios` | Catálogo de servicios | público |
| `/api/barberos` | Barberos y su comisión | público |
| `/api/barbero-servicios` | Qué servicios ofrece cada barbero | lectura pública, escritura con rol |
| `/api/horarios` | Horario laboral por barbero | lectura pública, escritura con rol |
| `/api/citas` | Agendar y cambiar estado de citas | JWT |
| `/api/auth/login` | Inicio de sesión, emite JWT | público |
| `/api/transacciones` | Movimientos de saldo | solo `administrador` |

Las respuestas usan siempre el formato `{ ok, ... }`. Las rutas inexistentes
devuelven 404 en JSON.
