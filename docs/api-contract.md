# Contratos API — CATERING CON CORAZÓN

Convenciones globales:

- **Autenticación**: cookie `ccc_session` (JWT httpOnly). Endpoints admin devuelven `401` (sin sesión), `403` (rol insuficiente) o `409 code=MUST_CHANGE_PASSWORD`.
- **Errores**: RFC 7807 (`application/problem+json`):
  ```json
  { "type": "validation|not-found|conflict|unauthorized|forbidden|rate-limit|config|internal|module-disabled",
    "title": "...", "status": 422, "detail": "...",
    "code": "MIN_ORDER_NOT_MET|INSUFFICIENT_STOCK|...",
    "errors": [{ "field": "items.0.productId", "message": "..." }] }
  ```
- **Paginación**: todo listado acepta `?limit=` (default 24, máx 50 → 422 si excede) y `?cursor=` (base64url de `{"v1":"...","v2":"..."}`). Respuesta: `{ "items": [...], "nextCursor": string|null }`. `nextCursor=null` = fin.
- **Dinero**: enteros en centavos USD. Fechas: ISO 8601.
- **Rate limits** (por minuto e IP, configurables por entorno, ver `.env.example`): login 10, creación de pedidos 6, validación de descuentos 20, borradores IA 6. Superarlos → 429 con `Retry-After`.

## Públicos (sin auth)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/public/bootstrap` | `{settings, flags, theme, whatsapp:{available,buttonLabel,waUrl}, banners, testimonials, faqs, legalPages, categories}` (testimonials vacío si flag off) |
| GET | `/api/public/catalog?limit&cursor&type=PRODUCT\|BEVERAGE&category=<slug>&featured=true&q=` | items: `{id,name,type,basePrice,description,imageUrl,isFeatured,attributes{},attributeSchemaVersion,category,variants[]}` (variants solo si flag) |
| GET | `/api/public/products/:id` | detalle |
| GET | `/api/public/combos?limit&cursor` | `{items:[{id,name,description,imageUrl,pricingMode,fixedPrice,discountPercent,unitPrice,items:[{productId,productName,unitPrice,quantity}]}]}` (vacío si flag off) |
| GET | `/api/public/events?limit&cursor` | próximos: `{items:[{id,name,eventDate,location}]}` |
| GET | `/api/public/legal/:slug` | `{slug,title,content,updatedAt}` |
| POST | `/api/public/discounts/validate` | body `{code,subtotalCents}` → `{valid,code,type,amountCents,label}` o 422 con `errors[0].code` = razón (`NOT_FOUND|DISABLED|INACTIVE|NOT_STARTED|EXPIRED|MIN_SUBTOTAL|MAX_USES`). Rate limit 20/min. |
| POST | `/api/public/orders` | body `{customerName,customerPhone?,eventDate?,eventLocation?,guests?,notes?,discountCode?,items:[{productId\|comboId,variantId?,quantity}]}` → `{orderCode,status,subtotal,discountAmount,taxPercent,taxAmount,total,whatsappAvailable,whatsappUrl,message}`. Rate limit 6/min. 409 `MIN_ORDER_NOT_MET` bajo el mínimo por evento; WhatsApp sin número → pedido creado igual con `whatsappAvailable:false`. |

## Auth

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/login` | `{email,password}` → `{user:{id,name,email,role,mustChangePassword}}` + cookie. 401 genérico (no revela si falló email o contraseña). Rate limit 10/min. |
| POST | `/api/auth/logout` | `{ok:true}` |
| GET | `/api/auth/me` | usuario de la sesión (`{user:{...}}`); permitido también con cambio de contraseña pendiente (usado por la pantalla forzada) |
| POST | `/api/auth/change-password` | `{currentPassword,newPassword}` → `{ok}`; nueva: 10+ caracteres con letras y números; actual incorrecta → 422 (distinto de 401 sesión inválida) |

## Admin

Roles: `ADMIN` (todo), `STAFF` (POS, pedidos, inventario, eventos lectura), `CONTADOR` (contabilidad, facturación, pedidos lectura).

| Método | Ruta | Roles | Notas |
|---|---|---|---|
| GET | `/api/admin/overview` | todos | `{pendingOrders,ordersToday,onsiteSalesTodayCents,onsiteSalesTodayCount,incomeMonthCents,expenseMonthCents,balanceMonthCents,lowStock[],topProducts[],recentOrders[]}` (día/mes en la timezone del negocio) |
| GET/POST | `/api/admin/products` | GET todos / POST ADMIN | filtros `type,category=<id de categoría>,visibility=visible\|hidden\|archived,q`; orden `sortOrder,id` asc; POST body ver abajo |
| GET/PATCH/DELETE | `/api/admin/products/:id` | GET todos / resto ADMIN | DELETE = archivado lógico |
| POST | `/api/admin/products/:id/variants` | ADMIN | `{name,priceDelta,sku?,sortOrder?,isActive?}` |
| PATCH/DELETE | `/api/admin/variants/:id` | ADMIN | |
| GET/POST | `/api/admin/attribute-schemas` | ADMIN | POST `{schemaJson:string,description?}` (JSON Schema draft-07 simplificado; se fuerza `additionalProperties:false`) |
| GET/POST | `/api/admin/categories` | GET todos / POST ADMIN | |
| PATCH/DELETE | `/api/admin/categories/:id` | ADMIN | DELETE 409 si tiene productos |
| GET/POST | `/api/admin/combos` | ADMIN | POST `{name,description?,imageUrl?,pricingMode:FIXED_PRICE\|PERCENT_DISCOUNT,fixedPrice?,discountPercent?,isVisible,isFeatured,sortOrder,items:[{productId,quantity}]}` |
| GET/PATCH/DELETE | `/api/admin/combos/:id` | ADMIN | PATCH reemplaza `items` si viene |
| GET/POST | `/api/admin/discounts` | ADMIN | GET: `{items:[{...código,usedCount,orderCount}],nextCursor}` (createdAt desc); POST `{code,type:PERCENT\|FIXED_AMOUNT,value,minSubtotal?,maxUses?,startsAt?,endsAt?,isActive}`; código se normaliza a MAYÚSCULAS |
| PATCH/DELETE | `/api/admin/discounts/:id` | ADMIN | |
| GET/POST | `/api/admin/events` | GET todos / POST ADMIN | GET filtro `upcoming=true`; POST `{name,eventDate,location,notes?,minOrderOverride?,isActive}` |
| GET/PATCH/DELETE | `/api/admin/events/:id` | GET todos / resto ADMIN | GET incluye últimos 20 pedidos; DELETE 409 si tiene pedidos |
| GET | `/api/admin/orders` | todos | filtros `status,channel,eventId,q`; items con `_count` |
| GET | `/api/admin/orders/:id` | todos | detalle + `allowedTransitions` |
| PATCH | `/api/admin/orders/:id/status` | ADMIN/STAFF | `{status}`; efectos de stock automáticos |
| POST | `/api/admin/orders/:id/payments` | CONTADOR/ADMIN | `{amount,method:CASH\|TRANSFER\|OTHER,reference?,notes?}` |
| POST | `/api/admin/orders/onsite` | ADMIN/STAFF | `{items,paymentMethod,issueInvoice,eventId?,customerName?}` → `{order,invoiceNumber}` |
| GET | `/api/admin/inventory` | todos | filtros `q,lowStock=true` (marca `isLow` cuando quantity ≤ umbral); orden `updatedAt` desc |
| POST | `/api/admin/inventory/adjust` | ADMIN/STAFF | `{productId,delta,reason}` (motivo obligatorio) |
| GET | `/api/admin/inventory/movements` | todos | filtro `productId` |
| GET | `/api/admin/accounting/summary` | CONTADOR/ADMIN | `?from&to` → `{incomeCents,expenseCents,balanceCents,topProducts,channelSplit,paymentMethodSplit,...}` |
| GET/POST | `/api/admin/payments` | CONTADOR/ADMIN | filtros `from,to,orderId`; POST ingreso manual |
| GET/POST | `/api/admin/expenses` | CONTADOR/ADMIN | filtros `from,to,category` |
| PATCH/DELETE | `/api/admin/expenses/:id` | CONTADOR/ADMIN | |
| GET/POST | `/api/admin/invoices` | CONTADOR/ADMIN | filtro `status=ACTIVE\|VOID`; 409 `FLAG_invoicing_enabled` si flag off; POST `{orderId,customerName?,customerTaxId?}` → 201 `{number,orderId}`; 409 `INVOICE_ALREADY_ISSUED` si ya hay factura activa |
| POST | `/api/admin/invoices/:id/void` | CONTADOR/ADMIN | `{reason}` |
| GET/POST | `/api/admin/users` | ADMIN | GET filtros `q,role`; POST `{name,email,role,password?,mustChangePassword?}` → incluye `tempPassword` si se generó |
| PATCH | `/api/admin/users/:id` | ADMIN | `{name?,email?,role?,isActive?,mustChangePassword?}` (auto-protección) |
| POST | `/api/admin/users/:id/reset-password` | ADMIN | `{reason}` → `{tempPassword}` (una sola vez) |
| GET/PUT | `/api/admin/theme` | ADMIN | GET incluye `contrast` (pares WCAG), `fonts`, `radiusLevels`, `shadowLevels`; PUT body completo → valida WCAG AA 4.5:1 en SERVIDOR antes de guardar (422 con los pares y su ratio; el tema no se persiste) |
| GET/PUT | `/api/admin/settings` | ADMIN | PUT parcial (validado); GET → `{defs,values,problems}` (problems = valores corruptos en BD con default aplicado) |
| GET/PUT | `/api/admin/flags` | ADMIN | PUT `{tax_enabled:true,...}` parcial → `{items:[{key,value,description,default,updatedAt}]}`; surte efecto en el siguiente request |
| GET/PUT | `/api/admin/whatsapp` | ADMIN | GET incluye `configured` (número E.164 válido); PUT `{phoneNumber(null\|E.164),defaultMessage,buttonLabel}`; E.164 inválido → 422 |
| GET/POST | `/api/admin/content/banners` | ADMIN | GET paginado (sortOrder asc); POST `{title?,subtitle?,imageUrl?,linkUrl?,isVisible?,sortOrder?}` |
| PATCH/DELETE | `/api/admin/content/banners/:id` | ADMIN | PATCH parcial de los mismos campos |
| GET/POST | `/api/admin/content/faqs` | ADMIN | GET paginado (sortOrder asc); POST `{question,answer,isVisible?,sortOrder?}` |
| PATCH/DELETE | `/api/admin/content/faqs/:id` | ADMIN | PATCH parcial de los mismos campos |
| GET/POST | `/api/admin/content/testimonials` | ADMIN | GET paginado (sortOrder asc); POST `{customerName,text,rating(1-5),isVisible?,sortOrder?}` (se muestran en la web solo si flag `testimonials_enabled`) |
| PATCH/DELETE | `/api/admin/content/testimonials/:id` | ADMIN | PATCH parcial de los mismos campos |
| GET | `/api/admin/legal` | ADMIN | `{items:[{slug,title,updatedAt}]}` (sin paginar) |
| GET/PUT | `/api/admin/legal/:slug` | ADMIN | GET `{slug,title,content,updatedAt,disclaimer}` (disclaimer global); PUT `{title,content}` |
| GET/POST | `/api/admin/media` | ADMIN | GET galería paginada (createdAt desc); POST multipart `file` + `alt?` → 201 MediaAsset (PNG/JPEG/WebP/SVG, máx `UPLOAD_MAX_BYTES`=5MB por defecto) |
| DELETE | `/api/admin/media/:id` | ADMIN | borra registro y archivo local (si es externo, solo el registro) → `{ok:true}` |
| POST | `/api/admin/ai/draft` | ADMIN | `{kind:"legal",slug:privacidad\|cookies\|terminos\|aviso-legal,currentTitle?,notes?≤600}` → `{text,title}`. Borrador legal generado EN EL BACKEND con `z-ai-web-dev-sdk` (nunca en cliente; el texto SIEMPRE acaba con aviso de que no sustituye asesoría legal). Rate limit 6/min; 500 si el servicio IA no está disponible (editor manual sigue); 422 si la IA devuelve vacío |

### POST /api/admin/products (body)

```json
{
  "name": "Sándwiches de pollo",
  "type": "PRODUCT | BEVERAGE",
  "categoryId": "uuid|null",
  "basePrice": 350,
  "description": "string|null",
  "imageUrl": "/uploads/x.png | https://... | null",
  "isFeatured": false, "isVisible": true, "sortOrder": 0,
  "attributes": { "sinGluten": true, "nivelPicante": "suave" }
}
```

`attributes` se valida contra la ProductAttributeSchema ACTIVA (JSON Schema + ajv, mundo cerrado). PATCH: campo ausente = no tocar; `null` = limpiar; objeto = validar (contra la versión almacenada del producto). Claves desconocidas → 422.
