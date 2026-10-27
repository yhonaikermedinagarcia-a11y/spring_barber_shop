"""Pruebas dirigidas de bugs contra la API de Spring Barber Shop.
Uso: python3 pruebas_bugs.py [base_url]   (por defecto http://localhost:3000)
Requiere una BD recién migrada y sembrada (npm run migrate && npm run seed).
Cada prueba imprime BUG PRESENTE si el bug se reproduce y CORREGIDO si no.
Ejecutar desde la raíz del repositorio (usa frontend/src/assets/logo-spring.jpg
como imagen de prueba). Modifica datos: úsalo solo contra una base local.
"""
import io, json, os, sys, time, threading, urllib.request, urllib.error, uuid

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JPG = open(os.path.join(RAIZ, 'frontend', 'src', 'assets', 'logo-spring.jpg'), 'rb').read()
UPLOADS = os.path.join(RAIZ, 'backend', 'uploads')

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
RESULTADOS = []


def req(metodo, ruta, body=None, token=None, files=None, raw=False):
    headers = {}
    data = None
    if files is not None:
        limite = uuid.uuid4().hex
        partes = []
        for k, v in (body or {}).items():
            partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (nombre, contenido, tipo) in files.items():
            partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"; filename="{nombre}"\r\nContent-Type: {tipo}\r\n\r\n'.encode() + contenido + b'\r\n')
        partes.append(f'--{limite}--\r\n'.encode())
        data = b''.join(partes)
        headers['Content-Type'] = f'multipart/form-data; boundary={limite}'
    elif body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = f'Bearer {token}'
    r = urllib.request.Request(BASE + ruta, data=data, method=metodo, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            cuerpo = resp.read()
            return resp.status, (cuerpo if raw else json.loads(cuerpo or b'null')), dict(resp.headers)
    except urllib.error.HTTPError as e:
        cuerpo = e.read()
        try:
            return e.code, (cuerpo if raw else json.loads(cuerpo or b'null')), dict(e.headers)
        except Exception:
            return e.code, cuerpo, dict(e.headers)


def registrar(id_, titulo, confirmado, detalle):
    RESULTADOS.append((id_, titulo, confirmado, detalle))
    print(f"[{'BUG PRESENTE' if confirmado else 'CORREGIDO'}] {id_} {titulo}\n      {detalle}")


def login(correo, clave):
    s, b, _ = req('POST', '/api/auth/login', {'correo': correo, 'password': clave})
    return b.get('token'), b.get('usuario')


# Próximo lunes a partir de mañana, como fecha base de las reservas
def proximo(dia_semana, semanas=1):
    t = time.localtime(time.time() + 86400 * 7 * semanas)
    d = time.time() + 86400 * 7 * semanas
    while time.localtime(d).tm_wday != dia_semana:
        d += 86400
    return time.strftime('%Y-%m-%d', time.localtime(d))

LUNES = proximo(0, 3)
MARTES = proximo(1, 3)
MIERC = proximo(2, 3)

admin_tok, _ = login('admin@springbarber.com', 'clave123')
barb_tok, barb_user = login('barbero@springbarber.com', 'clave123')
cli_tok, cli_user = login('cliente@springbarber.com', 'springbarber2026')
assert admin_tok and barb_tok and cli_tok, 'no se pudo iniciar sesión con las cuentas sembradas'
CLI_ID = cli_user['usuarioID']

# ---------------------------------------------------------------- seguridad
s, b, _ = req('GET', '/api/barberos')
expuestos = [(x['correo'], x['telefono']) for x in b['barberos'] if x.get('correo') and x.get('telefono')]
registrar('S1', 'GET /api/barberos (público) expone correo y teléfono personal de las cuentas',
          bool(expuestos), f'sin token devuelve: {expuestos[:3]}')

if expuestos:
    correo, tel = expuestos[0]
    s, b, _ = req('POST', '/api/auth/recuperar', {'correo': correo, 'telefono': tel, 'claveNueva': 'tomada123'})
    tok, u = login(correo, 'tomada123')
    registrar('S2', 'Robo de cuenta: /auth/recuperar solo pide correo+teléfono (datos públicos por S1)',
              bool(tok), f'recuperar -> {s}; login con la clave nueva -> {"OK, rol " + u["rol"] if tok else "falla"}')
    req('POST', '/api/auth/recuperar', {'correo': correo, 'telefono': tel, 'claveNueva': 'clave123'})
    barb_tok, _ = login('barbero@springbarber.com', 'clave123')

s, b, _ = req('POST', '/api/auth/recuperar', {'correo': 'admin@springbarber.com', 'telefono': '0412-4370853', 'claveNueva': 'tomada123'})
tok, u = login('admin@springbarber.com', 'tomada123')
registrar('S3', 'El teléfono del admin sembrado es el WhatsApp público de la web (config.js) -> robo del admin',
          bool(tok), f'recuperar con el número del footer -> {s}; login admin -> {"OK" if tok else "falla"}')
req('POST', '/api/auth/recuperar', {'correo': 'admin@springbarber.com', 'telefono': '04124370853', 'claveNueva': 'clave123'})
admin_tok, _ = login('admin@springbarber.com', 'clave123')

correo = f'sintel_{uuid.uuid4().hex[:6]}@x.com'
req('POST', '/api/usuarios', {'nombre': 'a', 'apellido': 'b', 'correo': correo, 'telefono': 'no tengo', 'clave': 'secreto1'})
s, b, _ = req('POST', '/api/auth/recuperar', {'correo': correo, 'telefono': 'xxx', 'claveNueva': 'tomada123'})
registrar('S4', 'Teléfono sin dígitos: cualquier texto sin números "coincide" en /auth/recuperar',
          s == 200, f'cuenta con telefono="no tengo", recuperar con telefono="xxx" -> {s}')

# Subida de HTML servido desde el mismo origen (XSS almacenado)
html = b'<script>alert(document.domain+" "+localStorage.length)</script>'
s, b, _ = req('POST', '/api/citas/publica', {'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{LUNES}T09:00', 'nombre': 'X', 'telefono': '04140000001', 'pago_metodo': 'pago_movil', 'referencia_pago': '1'},
              files={'comprobante': ('evil.html', html, 'image/png')})
url = (b.get('cita') or {}) and None
s2, b2, _ = req('GET', '/api/transacciones', token=admin_tok)
urls = [t['comprobante_url'] for t in b2['transacciones'] if t.get('comprobante_url', '') and t['comprobante_url'].endswith('.html')]
if urls:
    s3, cuerpo, h = req('GET', urls[0], raw=True)
    registrar('S5', 'Subida sin autenticación de .html con Content-Type falso: se sirve como text/html (XSS almacenado)',
              'text/html' in h.get('Content-Type', ''), f'{urls[0]} -> {s3} {h.get("Content-Type")}')
else:
    registrar('S5', 'Subida de .html como comprobante', False, f'reserva -> {s} {b}')

antes = len(os.listdir(UPLOADS)) if os.path.isdir(UPLOADS) else None
s, b, _ = req('POST', '/api/citas/publica', {'barberoID': 'x'}, files={'comprobante': ('a.jpg', JPG, 'image/jpeg')})
time.sleep(0.5)
despues = len(os.listdir(UPLOADS)) if os.path.isdir(UPLOADS) else None
registrar('S6', 'Archivos subidos en peticiones rechazadas quedan huérfanos en /uploads (llenado de disco sin auth)',
          antes is not None and despues > antes, f'petición inválida -> {s}; archivos en uploads antes={antes} después={despues} (solo se mide si la API corre en esta máquina)')

# --------------------------------------------------------------- pagos
s, b, _ = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 2, 'fecha_hora': f'{LUNES}T10:00', 'pago_metodo': 'efectivo'}, token=cli_tok)
cita_id = b['cita']['citaID']
s, b, _ = req('POST', '/api/transacciones', {'citaID': cita_id, 'metodo_pago': 'efectivo', 'monto': 0}, token=cli_tok)
s2, b2, _ = req('GET', '/api/citas', token=cli_tok)
estado_pago = next(c['pago_estado'] for c in b2['citas'] if c['citaID'] == cita_id)
registrar('P1', 'Un cliente se marca su propia cita como PAGADA (efectivo, monto 0) sin pagar',
          s == 201 and estado_pago == 'completado', f'POST /transacciones -> {s}, estado={b.get("transaccion",{}).get("estado")}, monto={b.get("transaccion",{}).get("monto")}; cita.pago_estado={estado_pago}')

s, b, _ = req('POST', '/api/transacciones', {'usuarioID': CLI_ID, 'tipo_movimiento': 'recarga', 'monto': 1000000, 'saldo_restante': 1000000, 'referencia_pago': 'gratis'}, token=cli_tok)
registrar('P2', 'Un cliente crea movimientos de saldo (recargas) a su nombre o de otros, con saldo arbitrario',
          s == 201, f'POST /transacciones (movimiento) como cliente -> {s}')

s, b, _ = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{LUNES}T16:00', 'pago_metodo': 'efectivo'}, token=cli_tok)
cid = b['cita']['citaID']
s, b, _ = req('PUT', f'/api/citas/{cid}/pago/completar', token=admin_tok)
tid = b['transaccion']['transaccionID']
s, b, _ = req('PUT', f'/api/transacciones/{tid}/rechazar', {'motivo': 'x'}, token=admin_tok)
s2, b2, _ = req('PUT', f'/api/transacciones/{tid}/aprobar', token=admin_tok)
s3, b3, _ = req('PUT', f'/api/transacciones/{tid}/rechazar', {'motivo': 'otra vez'}, token=admin_tok)
registrar('P3', 'Aprobar/rechazar no comprueba el estado actual: un cobro ya completado se puede rechazar (y la cita queda "denegada")',
          s == 200 and s2 == 200 and s3 == 200, f'rechazar completado -> {s}; aprobar rechazado -> {s2}; rechazar de nuevo -> {s3}')

# --------------------------------------------------------------- citas
s, b, _ = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 1, 'fecha_hora': '2020-01-06T10:00'}, token=cli_tok)
registrar('C1', 'Se pueden reservar citas en el pasado', s == 201, f'fecha 2020-01-06 -> {s}')

req('POST', '/api/barbero-servicios', {'barberoID': 1, 'servicioID': 1}, token=admin_tok)
s, b, _ = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 3, 'fecha_hora': f'{MARTES}T09:00'}, token=cli_tok)
s2, b2, _ = req('GET', '/api/barbero-servicios/barbero/1')
registrar('C2', 'No se valida que el barbero ofrezca el servicio (barbero_servicio)', s == 201,
          f'barbero 1 ofrece {[x["serviciosID"] for x in b2["servicios"]]}; reservar el servicio 3 -> {s}')
req('DELETE', '/api/barbero-servicios/1/1', token=admin_tok)

s, b, _ = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{MARTES}T11:00'}, token=cli_tok)
c_a = b['cita']['citaID']
req('POST', f'/api/citas/{c_a}/cancelar-solicitud', {'motivo': 'no puedo'}, token=cli_tok)
s, b, _ = req('POST', '/api/citas/publica', {'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{MARTES}T11:00', 'nombre': 'Otro', 'telefono': '04149999999'})
s2, b2, _ = req('PUT', f'/api/citas/{c_a}/reembolso/rechazar', {'motivo': 'no'}, token=admin_tok)
s3, b3, _ = req('GET', f'/api/citas/ocupados?barberoID=1&desde={MARTES}&hasta={MARTES}')
dobles = [o for o in b3['ocupados'] if o['fecha_inicio'].startswith(MARTES) and 'T15:00' in o['fecha_inicio'] or True]
activos_11 = [o for o in b3['ocupados'] if o['estado'] not in ('cancelada', 'denegada', 'cancelacion_solicitada')]
solap = len([o for o in activos_11 if o['citaID'] in (c_a, (b.get('cita') or {}).get('citaID'))])
registrar('C3', 'Doble reserva: rechazar una solicitud de cancelación devuelve la cita a "pendiente" aunque la hora ya se dio a otro',
          s == 201 and s2 == 200 and solap == 2, f'2ª reserva en la hora liberada -> {s}; rechazar cancelación -> {s2}; citas activas a la misma hora: {solap}')

s, b, _ = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{MARTES}T13:00'}, token=cli_tok)
c_b = b['cita']['citaID']
req('PUT', f'/api/citas/{c_b}/estado', {'estado': 'completada'}, token=admin_tok)
s, b, _ = req('PUT', f'/api/citas/{c_b}/estado', {'estado': 'cancelada'}, token=cli_tok)
registrar('C4', 'El cliente puede pasar a "cancelada" una cita ya COMPLETADA (y saltarse el flujo de reembolso)',
          s == 200, f'PUT estado cancelada sobre cita completada -> {s} {b.get("cita",{}).get("estado")}')

s, b, _ = req('POST', '/api/citas/publica', {'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{MARTES}T14:00', 'nombre': 'Inv', 'telefono': '04145550000', 'pago_metodo': 'pago_movil', 'referencia_pago': '123'},
              files={'comprobante': ('c.jpg', JPG, 'image/jpeg')})
codigo = b.get('codigo')
s2, b2, _ = req('GET', '/api/transacciones', token=admin_tok)
tx = next(t for t in b2['transacciones'] if t['citaID'] == b['cita']['citaID'])
req('PUT', f'/api/transacciones/{tx["transaccionID"]}/aprobar', token=admin_tok)
s3, b3, _ = req('PUT', f'/api/citas/publica/{codigo}/estado')
registrar('C5', 'El invitado que pagó por pago móvil cancela directo (sin solicitud de reembolso); el pago sigue "completado"',
          s3 == 200 and b3.get('cita', {}).get('estado') == 'cancelada', f'cancelar por código -> {s3} estado={b3.get("cita",{}).get("estado")} pago={b3.get("cita",{}).get("pago_estado")}')

s, b, _ = req('GET', '/api/citas/ocupados?barberoID=1&desde=hola')
registrar('C6', '/citas/ocupados con fecha inválida devuelve 500 en vez de 400', s == 500, f'desde=hola -> {s}')

# Toma de citas de invitado ajenas registrándose con su teléfono
s, b, _ = req('POST', '/api/citas/publica', {'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{MIERC}T09:00', 'nombre': 'Víctima', 'telefono': '0414-777.66.55'})
correo = f'ladron_{uuid.uuid4().hex[:6]}@x.com'
s2, b2, _ = req('POST', '/api/usuarios', {'nombre': 'L', 'apellido': 'L', 'correo': correo, 'telefono': '04147776655', 'clave': 'secreto1'})
registrar('C7', 'Registrarse con el teléfono de un invitado le "roba" todas sus citas (sin verificar el teléfono)',
          s2 == 201 and b2.get('citasVinculadas', 0) >= 1, f'citasVinculadas={b2.get("citasVinculadas")}')

# Concurrencia de reservas
res = []
def reservar(i):
    res.append(req('POST', '/api/citas/publica', {'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{MIERC}T15:00', 'nombre': f'C{i}', 'telefono': f'041400000{i:02d}'})[0])
hs = [threading.Thread(target=reservar, args=(i,)) for i in range(10)]
[h.start() for h in hs]; [h.join() for h in hs]
registrar('C8', 'Reservas simultáneas a la misma hora (control: el FOR UPDATE debería dejar pasar solo 1)',
          res.count(201) > 1, f'10 peticiones paralelas -> {res.count(201)} creadas, {res.count(400)} rechazadas')

# --------------------------------------------------------------- usuarios
s, b, _ = req('POST', '/api/usuarios', {'nombre': 'a', 'apellido': 'b', 'correo': 'Cliente@SpringBarber.com', 'telefono': '0412', 'clave': '1'})
registrar('U1', 'Correo distinguiendo mayúsculas + sin validar formato + clave de 1 carácter al registrarse',
          s == 201, f'"Cliente@SpringBarber.com" con clave "1" -> {s} (ya existe cliente@springbarber.com)')

correo = f'deg_{uuid.uuid4().hex[:6]}@x.com'
s, b, _ = req('POST', '/api/usuarios', {'nombre': 'a', 'apellido': 'b', 'correo': correo, 'telefono': '04120000000', 'clave': 'secreto1', 'rol': 'administrador'}, token=admin_tok)
uid = b['usuario']['usuarioID']
tok2, _ = login(correo, 'secreto1')
req('PUT', f'/api/usuarios/{uid}', {'rol': 'cliente'}, token=admin_tok)
s, b, _ = req('GET', '/api/usuarios', token=tok2)
req('DELETE', f'/api/usuarios/{uid}', token=admin_tok)
s2, b2, _ = req('GET', '/api/estadisticas/resumen', token=tok2)
registrar('U2', 'El rol va dentro del JWT (8 h): un admin degradado o BORRADO sigue siendo admin hasta que expira',
          s == 200 and s2 == 200, f'tras degradar -> GET /usuarios {s}; tras borrar la cuenta -> GET /estadisticas {s2}')

s, b, _ = req('PUT', '/api/usuarios/perfil', {'claveActual': 123456, 'claveNueva': 'nueva123'}, token=cli_tok)
registrar('U3', 'PUT /usuarios/perfil con claveActual numérica -> 500 (bcrypt "Illegal arguments")', s == 500, f'-> {s}')

s, b, _ = req('PUT', '/api/usuarios/perfil', {'nombre': 'a', 'apellido': 'b', 'correo': 'admin@springbarber.com', 'telefono': '1'}, token=cli_tok)
registrar('U4', 'Cambiar el correo del perfil a uno ya usado devuelve 500 en vez de 400', s == 500, f'-> {s}')

# --------------------------------------------------------------- estadísticas
s, b, _ = req('GET', '/api/estadisticas/resumen', token=admin_tok)
s3, b3, _ = req('GET', '/api/citas', token=admin_tok)
validas = [c for c in b3['citas'] if c['barberoID'] == 1 and c['estado'] not in ('cancelada', 'denegada', 'cancelacion_solicitada')]
ranking = next(r for r in b['rankingBarberos'] if r['barberoID'] == 1)
registrar('E1', 'Ranking de barberos cuenta citas "denegada" y "cancelacion_solicitada" como ingresos',
          ranking['citas'] != len(validas), f'ranking dice {ranking["citas"]} citas; citas que no están canceladas/denegadas/en cancelación: {len(validas)}')

# --------------------------------------------------------------- almuerzo
JUEVES = proximo(3, 3)
cod = {}
for h in ('11:30', '12:00', '12:30', '11:45', '13:00'):
    s, b, _ = req('POST', '/api/citas/publica', {'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{JUEVES}T{h}', 'nombre': 'Alm', 'telefono': '04140001111'})
    cod[h] = s
registrar('A1', 'Se puede reservar dentro de la hora de almuerzo (12:00-13:00)',
          not (cod['11:30'] == 201 and cod['13:00'] == 201 and cod['12:00'] == 400 and cod['12:30'] == 400 and cod['11:45'] == 400),
          f'11:30 (acaba 12:00) -> {cod["11:30"]}; 11:45 (pisa) -> {cod["11:45"]}; 12:00 -> {cod["12:00"]}; 12:30 -> {cod["12:30"]}; 13:00 -> {cod["13:00"]}')
s, b, _ = req('POST', '/api/horarios', {'barberoID': 1, 'dia_semana': 'jueves', 'hora_inicio': '09:00', 'hora_fin': '18:00'}, token=admin_tok)
s2, b2, _ = req('POST', '/api/horarios', {'barberoID': 1, 'dia_semana': 'jueves', 'hora_inicio': '09:00', 'hora_fin': '18:00', 'almuerzo_inicio': '19:00', 'almuerzo_fin': '20:00'}, token=admin_tok)
registrar('A2', 'Editar el horario sin mandar el almuerzo lo borra, o se acepta un almuerzo fuera de la jornada',
          not ((b.get('horario') or {}).get('almuerzo_inicio', '')[:5] == '12:00' and s2 == 400),
          f'sin campos -> almuerzo {(b.get("horario") or {}).get("almuerzo_inicio")}; almuerzo 19-20 -> {s2}')

# --------------------------------------------------------------- reseñas
c_ok = req('POST', '/api/citas', {'clienteID': CLI_ID, 'barberoID': 1, 'servicioID': 1, 'fecha_hora': f'{JUEVES}T15:00'}, token=cli_tok)[1]['cita']['citaID']
req('PUT', f'/api/citas/{c_ok}/estado', {'estado': 'completada'}, token=admin_tok)
s, b, _ = req('POST', '/api/barberos/1/resenas', {'calificacion': 4.5, 'comentario': 'Muy buen corte'}, token=cli_tok)
s2, b2, _ = req('GET', '/api/barberos/1/resenas')  # sin sesión: lo que ve cualquier visitante
s3, b3, _ = req('GET', '/api/barberos')
r = (b2.get('resenas') or [{}])[0]
card = next(x for x in b3['barberos'] if x['barberoID'] == 1)
registrar('R1', 'Reseña con media estrella rechazada / no visible para el público',
          not (s == 201 and b2.get('total') == 1 and r.get('comentario') == 'Muy buen corte' and r.get('nombre') and r.get('usuarioID') == CLI_ID),
          f'publicar 4.5 -> {s}; visitante ve total={b2.get("total")}, autor="{r.get("nombre")} {r.get("apellido")}", usuarioID={r.get("usuarioID")}')
registrar('R2', 'Las tarjetas de barberos muestran 0 estrellas (la API no manda promedio ni total)',
          not (card.get('total_resenas') == 1 and card.get('promedio_calificacion') == 4.5),
          f'promedio_calificacion={card.get("promedio_calificacion")} total_resenas={card.get("total_resenas")}')

print('\nResumen:', sum(1 for r in RESULTADOS if r[2]), 'bugs presentes de', len(RESULTADOS), 'pruebas')
json.dump([dict(id=r[0], titulo=r[1], confirmado=r[2], detalle=r[3]) for r in RESULTADOS], open('/tmp/resultados.json', 'w'), ensure_ascii=False, indent=1)
