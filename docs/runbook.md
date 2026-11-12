# Runbook de operación — CATERING CON CORAZÓN

Manual de operación diaria del sistema para el administrador, el staff de evento y el contador. Todos los comandos `curl` se reproducen contra la app en desarrollo (`bun run dev`, http://localhost:3000) con la base de datos recién creada (`bun run db:push` + `bun run db:seed`). No se afirma aquí ningún resultado de ejecución: cada comando incluye lo que se espera observar para que puedas verificarlo tú mismo.

Convenciones de las API (detalle completo en `docs/api-contract.md`): errores RFC 7807 (`application/problem+json`) con `type`/`title`/`status`/`detail` y a menudo `code` y `errors[]` por campo; dinero en centavos USD; listados con `?limit=&cursor=` y respuesta `{items, nextCursor}`.

## 1. Arranque del entorno

```bash
bun install
cp .env.example .env       # primera vez: ajusta DATABASE_URL y define AUTH_SECRET
bun run db:push            # primera vez: crea el esquema
bun run db:seed            # primera vez: datos iniciales idempotentes
bun run dev                # http://localhost:3000
```

Verificación rápida de salud (con la app corriendo):

```bash
curl -s http://localhost:3000/api/public/bootstrap | head -c 400
```

Se espera un JSON con `settings` (marca, hero, IVA 15 % guardado con flag apagado), `flags` (tax_enabled false, combos_enabled true, discounts_enabled true), `theme`, `whatsapp`, `banners`, `faqs`, `legalPages`, `categories`.

## 2. Operación diaria

### 2.1 Punto de venta en el evento (ONSITE, staff, objetivo < 30 s por venta)

1. Iniciar sesión como `staff@cateringconcorazon.ec` y entrar a **Punto de venta** (`#/admin/pos`).
2. Buscar el producto por nombre (o filtrar por tipo) y sumarlo al ticket con `+`; ajustar cantidades si hace falta. El ticket vive solo en esa pantalla (no toca el carrito público); el IVA mostrado es un preview, el total definitivo lo calcula el servidor al registrar.
3. Elegir método de pago: **Efectivo / Transferencia / Otro**; opcionalmente asociar un **evento** de la agenda y un nombre de cliente.
4. Marcar **emitir factura** solo si facturación está activada y el cliente la necesita (ver 2.4); si el flag está apagado, la venta se registra igual y sin factura.
5. Pulsar **Registrar venta**: en una sola transacción el sistema valida el catálogo vigente, verifica stock, crea el pedido **COMPLETED**, registra el pago inmediato, descuenta inventario con movimiento auditado (motivo automático `Venta en evento CCC-XXXXXX`) y, si procede, emite la factura.

Respuesta esperable de `POST /api/admin/orders/onsite`: 201 con `{order, invoiceNumber}`; sin stock suficiente: 409 `INSUFFICIENT_STOCK`; producto archivado a mitad del evento: 422 por ítem con `PRODUCT_UNAVAILABLE`.

### 2.2 Inventario y stock

- **Ajustes con motivo obligatorio** (módulo Inventario): todo ajuste exige `delta` distinto de 0 y un **motivo** de al menos 3 caracteres (p. ej. "Compra para evento del sábado", "Merma por temperatura"). Cada ajuste genera un movimiento en el kardex con autor y hora.
- **Kardex** (módulo Inventario → movimientos): historial paginado por cursor, filtrable por producto; virtualizado para navegar miles de filas.
- **Bajo stock**: la vista marca productos con `quantity <= umbral` (umbral editable por producto); el Resumen del panel lista el stock más bajo.
- **Momentos del stock** (ADR-005): ONSITE descuenta al registrar; una reserva web descuenta al pasar a **COMPLETED** (el día del evento); **cancelar** un pedido con stock aplicado lo **reingresa** automáticamente con motivo "Cancelación del pedido CCC-XXXXXX".

### 2.3 Contabilidad (contador/admin)

- **Ingresos**: pagos registrados (automáticos de ONSITE, abonos de reservas desde el detalle del pedido, o ingresos manuales con o sin pedido asociado: `POST /api/admin/payments`).
- **Egresos**: gastos con concepto, monto, categoría libre y fecha (módulo Contabilidad; editables/anulables).
- **Resumen por rango**: `GET /api/admin/accounting/summary?from=2025-11-01&to=2025-11-30` → ingresos, egresos, balance, top 5 productos, separación por canal (EVENT_BOOKING/ONSITE) y por método de pago. Sin rango: mes en curso en la zona horaria del negocio (`timezone` en Ajustes).

### 2.4 Facturación interna

1. Activar el flag **`invoicing_enabled`** (módulo Flags; surte efecto en el siguiente request, sin reinicio). Con el flag apagado, los endpoints responden 409 `FLAG_invoicing_enabled`.
2. Numeración configurable en **Ajustes** (grupo "sistema"): `invoice_prefix` (sembrado `001-001-`) y `invoice_padding` (sembrado 9). La primera factura es `001-001-000000001`; el contador es atómico y crece dentro de la misma transacción que la venta (sin huecos por concurrencia).
3. **Anulación** con motivo obligatorio (mínimo 3 caracteres) desde el módulo Facturación: la factura pasa a VOID y conserva número y motivo (no se renumera).
4. Un pedido solo puede tener **una factura ACTIVE** (409 `INVOICE_ALREADY_ISSUED` si se intenta otra); no se factura un pedido CANCELLED.
5. Recordatorio: es un **registro interno**; no sustituye la facturación electrónica ante el SRI (ver ADR-013 y el aviso legal publicado).

### 2.5 IVA

1. Activar el flag **`tax_enabled`** (módulo Flags).
2. Verificar el porcentaje en **Ajustes** → "IVA (%)" (`tax_percent`, sembrado 15).
3. A partir de ese momento, pedidos y facturas nuevas suman el IVA sobre la base `(subtotal − descuento)` y guardan el **snapshot** del porcentaje aplicado. Los pedidos anteriores no se recalculan; con el flag apagado el pedido guarda `taxPercent: null`.

## 3. Personalización (todo sin reiniciar)

### 3.1 Tema y colores (validación WCAG AA)

Módulo **Tema**: 11 colores hex, radio (none/sm/md/lg/xl), sombra (none/sm/md/lg), tipografías (lista cerrada: Playfair, Lora, Montserrat, Inter, Poppins), logo y favicon (desde Medios o URL). El guardado valida en el servidor que los 6 pares texto/fondo críticos alcanzen **4.5:1**; si alguno falla, el cambio se rechaza con 422 y el detalle del par (la web no puede quedar ilegible). El cambio se refleja en la web pública al instante (variables CSS reinyectadas en caliente; ver ADR-008).

### 3.2 Textos y SEO

Módulo **Ajustes**: grupos marca (nombre, "Sobre nosotros", pie), hero (título, subtítulo, botones), SEO (`seo_title`, `seo_description`; alimentan los metadatos de la página), negocio (moneda, símbolo, locale, timezone, IVA %, mínimo por evento), sistema (prefijos de pedido/factura y dígitos), legal (disclaimer). Un valor corrupto en BD no tumba la web: se usa el valor por defecto y el admin ve el problema en el propio módulo.

### 3.3 WhatsApp real

Módulo **WhatsApp**:

- **Número en formato E.164** con `+` y sin espacios, ej. `+593998877665` (el seed trae el placeholder `+593000000000`). Vacío/nulo permitido: la web degrada y el pedido web se registra igual (la UI ofrece copiar el mensaje).
- **Plantilla** editable con estas variables (las desconocidas quedan vacías):
  `{BRAND}`, `{ORDER_CODE}`, `{CUSTOMER_NAME}`, `{ITEMS}`, `{SUBTOTAL}`, `{DISCOUNT}`, `{TAX}`, `{TOTAL}`, `{EVENT_DATE}`, `{EVENT_LOCATION}`, `{GUESTS}`, `{NOTES}`.
  El servidor sustituye los valores reales del pedido; el cliente no redacta nada.
- **Etiqueta del botón** ("Reservar por WhatsApp" por defecto).

## 4. Respaldos

La base de datos es un único archivo. Respaldar **con la app detenida** (evita copiar a mitad de una escritura):

```bash
# 1) detener el servidor (Ctrl+C del proceso bun run dev)
# 2) copiar la base y las imágenes subidas
cp db/custom.db db/custom.db.$(date +%Y%m%d-%H%M).bak
cp -r public/uploads public/uploads.$(date +%Y%m%d-%H%M).bak   # opcional, imágenes subidas
# 3) arrancar de nuevo: bun run dev
```

Restaurar = detener la app, sobrescribir `db/custom.db` (y `public/uploads` si se respaldó) con la copia, y arrancar. No hay migraciones que reaplicar: el esquema vive dentro del propio archivo. Ritmo sugerido: diario tras la operación del día, y siempre antes de tocar flags estructurales o de editar muchos productos.

## 5. Solución de problemas

- **"EADDRINUSE ... :3000"** al arrancar: otro proceso ocupa el puerto (típico: una instancia previa del dev server). Localízalo y termínalo:

  ```bash
  lsof -ti :3000            # PID del proceso que ocupa 3000
  kill <PID>                # después vuelve a lanzar bun run dev
  ```

- **"El seed duplicó datos"**: no duplica. Todas las entidades usan upserts sobre claves únicas o ids deterministas (`seed-*`); re-ejecutar `bun run db:seed` es seguro y solo rellena huecos. Si aparece un 409/`P2002` inesperado, es por filas creadas manualmente con la misma clave única (p. ej. un combo con id `seed-combo-fiesta`): renómbralas o bórralas desde el panel antes de re-sembrar.
- **Sesión que "expira sola"**: la cookie `ccc_session` dura **12 h** por defecto (`SESSION_TTL_HOURS`); pasada esa ventana hay que volver a iniciar sesión. Tras varios resets de contraseña, si un login devuelve 409 `MUST_CHANGE_PASSWORD`, el sistema exige completar el cambio en la pantalla forzada.
- **429 "Demasiadas solicitudes"**: límites por minuto e IP: login 10, creación de pedidos 6, validación de descuentos 20, borradores IA 6. La respuesta trae `Retry-After` en segundos: espera ese tiempo (o ajusta los topes con las variables de entorno correspondientes, ver `.env.example`).
- **"[CONFIG] AUTH_SECRET no está definida"** en el log de arranque: sin esa variable el servidor firma sesiones con un secreto de desarrollo estable; define `AUTH_SECRET` (32+ caracteres aleatorios) en `.env` para operación real.
- **Colores rechazados al guardar el tema**: es la validación WCAG AA en el servidor. Cómo reproducir el rechazo con un tema blanco-sobre-blanco (sección 6.8): los pares fallan con 1:1 y la respuesta 422 lista exactamente qué par y qué ratio tiene. Corrige oscureciendo el texto (o aclarando el fondo) hasta que cada par supere 4.5:1; el editor del panel muestra el ratio en vivo antes de guardar.
- **Productos con `attributes` corruptos tras manipular la BD a mano**: la lectura es tolerante (la tarjeta simplemente no muestra chips y el log registra un aviso); corrige el JSON editando el producto desde el panel.

## 6. Comandos de verificación reproducibles (curl)

Requisito previo: `bun run dev` corriendo y BD sembrada. La cookie de sesión se guarda en `cookies.txt` (`-c` la crea, `-b` la reutiliza). Comillas simples evitan que el shell expanda los JSON.

### 6.1 Bootstrap público

```bash
curl -s http://localhost:3000/api/public/bootstrap | head -c 600; echo
```

Se espera JSON con `settings.brandName` "Catering con Corazón", `flags.tax_enabled` false, `whatsapp.available` true (número de ejemplo válido E.164) y las listas de contenido.

### 6.2 Catálogo paginado

```bash
curl -s 'http://localhost:3000/api/public/catalog?limit=2' | head -c 600; echo
```

Se espera una respuesta con 2 productos en `items` y un `nextCursor` no nulo; para la página siguiente, añade `&cursor=<valor de nextCursor>`. Un `limit` mayor que el máximo responde 422 `LIMIT_TOO_LARGE`.

### 6.3 Login (cookie de sesión)

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@cateringconcorazon.ec","password":"CorazonAdmin2025!"}'
```

Se espera `{user:{id,name,email,role:"ADMIN",mustChangePassword:false}}` y la cookie `ccc_session` en `cookies.txt`. Credenciales erróneas: 401 genérico (el sistema no revela si falló el email o la contraseña).

### 6.4 Crear el descuento BIENVENIDA10 y validarlo (el seed no siembra códigos)

```bash
# crear el código 10% con la sesión ADMIN de 6.3
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/discounts \
  -H 'Content-Type: application/json' \
  -d '{"code":"BIENVENIDA10","type":"PERCENT","value":10,"minSubtotal":0,"isActive":true}'
# se espera 201 con el código en MAYÚSCULAS

# validarlo contra un subtotal público (sin sesión)
curl -s -X POST http://localhost:3000/api/public/discounts/validate \
  -H 'Content-Type: application/json' \
  -d '{"code":"bienvenida10","subtotalCents":5700}'
# se espera: {"valid":true,"code":"BIENVENIDA10","type":"PERCENT","amountCents":570,"label":"10%"}
```

Un código inexistente responde 422 con `code:"NOT_FOUND"`; un subtotal insuficiente, 422 `MIN_SUBTOTAL`.

### 6.5 Crear una reserva web (EVENT_BOOKING)

```bash
curl -s -X POST http://localhost:3000/api/public/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "customerName": "María Pérez",
    "customerPhone": "+593991234567",
    "eventDate": "2025-12-20T22:00:00.000Z",
    "eventLocation": "Salón Los Alpes, Quito",
    "guests": 40,
    "notes": "Incluir opción vegetariana",
    "discountCode": "BIENVENIDA10",
    "items": [
      {"comboId": "seed-combo-fiesta", "quantity": 6}
    ]
  }'
```

Con los datos del seed: subtotal 5700 centavos (6 combos a $9.50) supera el mínimo de $50.00; con BIENVENIDA10 el descuento es 570; IVA desactivado (`taxPercent:null`, `taxAmount:0`); total 5130. Se espera `orderCode` "CCC-000001", `status` "PENDING_CONFIRMATION", `whatsappAvailable:true` con un `whatsappUrl` de la forma `https://wa.me/593000000000?text=<mensaje codificado>` cuyo `message` renderizado con la plantilla arranca con "¡Hola Catering con Corazón!" y detalla el pedido completo. Cambia la fecha/lugar por los del evento real; los ids sembrados de productos/combos son deterministas y están en `prisma/seed.ts`.

### 6.6 Venta en sitio (ONSITE) con sesión STAFF

```bash
# login staff en otro jar
curl -s -c staff-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"staff@cateringconcorazon.ec","password":"CorazonStaff2025!"}'

# venta directa: 2 dorilocos en efectivo, sin factura
curl -s -b staff-cookies.txt -X POST http://localhost:3000/api/admin/orders/onsite \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"seed-product-dorilocos","quantity":2}],"paymentMethod":"CASH","issueInvoice":false}'
```

Se espera 201 con `order.status:"COMPLETED"`, `order.stockApplied:true`, `invoiceNumber:null` y el pago creado por el total. El inventario de dorilocos baja 2 (ver 6.7). Para que `invoiceNumber` llegue con valor, activa primero `invoicing_enabled` y envía `"issueInvoice":true`.

### 6.7 Inventario y ajuste con motivo

```bash
# stock por producto (cualquier rol autenticado)
curl -s -b cookies.txt 'http://localhost:3000/api/admin/inventory?limit=4' | head -c 500; echo

# solo bajo stock
curl -s -b cookies.txt 'http://localhost:3000/api/admin/inventory?lowStock=true' | head -c 300; echo

# ajuste con motivo obligatorio (ADMIN/STAFF)
curl -s -b staff-cookies.txt -X POST http://localhost:3000/api/admin/inventory/adjust \
  -H 'Content-Type: application/json' \
  -d '{"productId":"seed-product-dorilocos","delta":24,"reason":"Compra para evento del sábado"}'
```

El ajuste sin motivo (o con `delta:0`) responde 422. El kardex completo: `GET /api/admin/inventory/movements` (filtra `?productId=`).

### 6.8 Rechazo WCAG del tema (blanco sobre blanco)

```bash
curl -s -b cookies.txt -X PUT http://localhost:3000/api/admin/theme \
  -H 'Content-Type: application/json' \
  -d '{
    "background":"#FFFFFF","foreground":"#FFFFFF",
    "card":"#FFFFFF","cardForeground":"#FFFFFF",
    "primary":"#FFFFFF","primaryForeground":"#FFFFFF",
    "accent":"#FFFFFF","accentForeground":"#FFFFFF",
    "muted":"#FFFFFF","mutedForeground":"#FFFFFF","border":"#FFFFFF",
    "radiusLevel":"lg","shadowLevel":"md",
    "fontHeading":"playfair","fontBody":"inter"
  }'
```

Se espera **422** `application/problem+json` con `type:"validation"` y un `errors[]` donde cada entrada (field `theme`) dice qué par de colores quedó en 1:1 frente al mínimo AA 4.5:1. El tema en BD no cambia. Con colores legibles (los sembrados, p. ej. `#3B241A` sobre `#FFF9F2`), la misma llamada responde 200 con el tema y el informe de contraste por par.

### 6.9 Resumen del panel y contabilidad (roles)

```bash
# dashboard (ADMIN/STAFF/CONTADOR)
curl -s -b cookies.txt http://localhost:3000/api/admin/overview | head -c 500; echo

# contabilidad por rango (CONTADOR/ADMIN)
curl -s -c contador-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"contador@cateringconcorazon.ec","password":"CorazonContador2025!"}'
curl -s -b contador-cookies.txt \
  'http://localhost:3000/api/admin/accounting/summary?from=2025-11-01&to=2025-11-30' | head -c 400; echo
```

Un STAFF pidiendo el resumen contable recibe 403 (matriz de roles, ADR-004). Los totales reflejan lo creado en 6.5/6.6 (ingreso = pago ONSITE; la reserva todavía no genera pago).

## 7. Cambios de contraseña y usuarios

- Cada usuario cambia la suya en la cabecera del panel ("Contraseña"): exige la actual y una nueva de 10+ caracteres con letras y números.
- Un ADMIN crea usuarios (con contraseña temporal de un solo uso si no se define una), cambia roles, desactiva cuentas y fuerza resets con motivo auditable (módulo **Usuarios**). Un ADMIN no puede quitarse a sí mismo el rol ni desactivarse (protección de acceso).
- Las contraseñas sembradas del README están pensadas para desarrollo: cámbialas antes de operación real.
