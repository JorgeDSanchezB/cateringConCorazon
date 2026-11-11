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

## Públicos (sin auth)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/public/bootstrap` | `{settings, flags, theme, whatsapp:{available,buttonLabel}, banners, testimonials, faqs, legalPages}` |
| GET | `/api/public/catalog?limit&cursor&type=PRODUCT\|BEVERAGE&category=<slug>&featured=true&q=` | items: `{id,name,type,basePrice,description,imageUrl,isFeatured,attributes{},attributeSchemaVersion,category,variants[]}` (variants solo si flag) |
| GET | `/api/public/products/:id` | detalle |
| GET | `/api/public/combos?limit&cursor` | `{items:[{id,name,description,imageUrl,pricingMode,fixedPrice,discountPercent,unitPrice,items:[{productId,productName,unitPrice,quantity}]}]}` (vacío si flag off) |
| GET | `/api/public/events?limit&cursor` | próximos: `{items:[{id,name,eventDate,location}]}` |
| GET | `/api/public/legal/:slug` | `{slug,title,content,updatedAt}` |
| POST | `/api/public/discounts/validate` | body `{code,subtotalCents}` → `{valid,code,type,amountCents,label}` o 422 con `errors[0].code` = razón |
| POST | `/api/public/orders` | body `{customerName,customerPhone?,eventDate?,eventLocation?,guests?,notes?,discountCode?,items:[{productId\|comboId,variantId?,quantity}]}` → `{orderCode,status,subtotal,discountAmount,taxPercent,taxAmount,total,whatsappAvailable,whatsappUrl,message}` |

## Auth

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/login` | `{email,password}` → `{user:{id,name,email,role,mustChangePassword}}` + cookie. Rate limit 10/min. |
| POST | `/api/auth/logout` | `{ok:true}` |
| GET | `/api/auth/me` | igual a login sin contraseña |
| POST | `/api/auth/change-password` | `{currentPassword,newPassword}` → `{ok}` |

## Admin

Roles: `ADMIN` (todo), `STAFF` (POS, pedidos, inventario, eventos lectura), `CONTADOR` (contabilidad, facturación, pedidos lectura).

| Método | Ruta | Roles | Notas |
|---|---|---|---|
| GET | `/api/admin/overview` | todos | `{pendingOrders,ordersToday,onsiteSalesTodayCents,incomeMonthCents,expenseMonthCents,balanceMonthCents,lowStock[],topProducts[],recentOrders[]}` |
| GET/POST | `/api/admin/products` | GET todos / POST ADMIN | filtros `type,category,visibility=visible\|hidden\|archived,q`; POST body ver abajo |
| GET/PATCH/DELETE | `/api/admin/products/:id` | GET todos / resto ADMIN | DELETE = archivado lógico |
| POST | `/api/admin/products/:id/variants` | ADMIN | `{name,priceDelta,sku?,sortOrder?,isActive?}` |
| PATCH/DELETE | `/api/admin/variants/:id` | ADMIN | |
| GET/POST | `/api/admin/attribute-schemas` | ADMIN | POST `{schemaJson:string,description?}` (JSON Schema draft-07 simplificado; se fuerza `additionalProperties:false`) |
| GET/POST | `/api/admin/categories` | GET todos / POST ADMIN | |
| PATCH/DELETE | `/api/admin/categories/:id` | ADMIN | DELETE 409 si tiene productos |
| GET/POST | `/api/admin/combos` | ADMIN | POST `{name,description?,imageUrl?,pricingMode:FIXED_PRICE\|PERCENT_DISCOUNT,fixedPrice?,discountPercent?,isVisible,isFeatured,sortOrder,items:[{productId,quantity}]}` |
| GET/PATCH/DELETE | `/api/admin/combos/:id` | ADMIN | PATCH reemplaza `items` si viene |
| GET/POST | `/api/admin/discounts` | ADMIN | POST `{code,type:PERCENT\|FIXED_AMOUNT,value,minSubtotal?,maxUses?,startsAt?,endsAt?,isActive}` |
| PATCH/DELETE | `/api/admin/discounts/:id` | ADMIN | |
| GET/POST | `/api/admin/events` | GET todos / POST ADMIN | GET filtro `upcoming=true`; POST `{name,eventDate,location,notes?,minOrderOverride?,isActive}` |
| GET/PATCH/DELETE | `/api/admin/events/:id` | GET todos / resto ADMIN | GET incluye últimos 20 pedidos; DELETE 409 si tiene pedidos |
| GET | `/api/admin/orders` | todos | filtros `status,channel,eventId,q`; items con `_count` |
| GET | `/api/admin/orders/:id` | todos | detalle + `allowedTransitions` |
| PATCH | `/api/admin/orders/:id/status` | ADMIN/STAFF | `{status}`; efectos de stock automáticos |
| POST | `/api/admin/orders/:id/payments` | CONTADOR/ADMIN | `{amount,method:CASH\|TRANSFER\|OTHER,reference?,notes?}` |
| POST | `/api/admin/orders/onsite` | ADMIN/STAFF | `{items,paymentMethod,issueInvoice,eventId?,customerName?}` → `{order,invoiceNumber}` |
| GET | `/api/admin/inventory` | todos | filtros `q,lowStock=true` |
| POST | `/api/admin/inventory/adjust` | ADMIN/STAFF | `{productId,delta,reason}` (motivo obligatorio) |
| GET | `/api/admin/inventory/movements` | todos | filtro `productId` |
| GET | `/api/admin/accounting/summary` | CONTADOR/ADMIN | `?from&to` → `{incomeCents,expenseCents,balanceCents,topProducts,channelSplit,paymentMethodSplit,...}` |
| GET/POST | `/api/admin/payments` | CONTADOR/ADMIN | filtros `from,to,orderId`; POST ingreso manual |
| GET/POST | `/api/admin/expenses` | CONTADOR/ADMIN | filtros `from,to,category` |
| PATCH/DELETE | `/api/admin/expenses/:id` | CONTADOR/ADMIN | |
| GET/POST | `/api/admin/invoices` | CONTADOR/ADMIN | 409 `FLAG_invoicing_enabled` si flag off; POST `{orderId,customerName?,customerTaxId?}` |
| POST | `/api/admin/invoices/:id/void` | CONTADOR/ADMIN | `{reason}` |
| GET/POST | `/api/admin/users` | ADMIN | POST `{name,email,role,password?,mustChangePassword?}` → incluye `tempPassword` si se generó |
| PATCH | `/api/admin/users/:id` | ADMIN | `{name?,email?,role?,isActive?,mustChangePassword?}` (auto-protección) |
| POST | `/api/admin/users/:id/reset-password` | ADMIN | `{reason}` → `{tempPassword}` (una sola vez) |
| GET/PUT | `/api/admin/theme` | ADMIN | PUT valida WCAG AA (422 con pares que fallan) |
| GET/PUT | `/api/admin/settings` | ADMIN | PUT parcial; GET incluye `problems` de config |
| GET/PUT | `/api/admin/flags` | ADMIN | PUT `{tax_enabled:true,...}` parcial |
| GET/PUT | `/api/admin/whatsapp` | ADMIN | PUT `{phoneNumber(null\|E.164),defaultMessage,buttonLabel}` |
| GET/POST | `/api/admin/content/banners` | ADMIN | |
| PATCH/DELETE | `/api/admin/content/banners/:id` | ADMIN | |
| GET/POST | `/api/admin/content/faqs` | ADMIN | |
| PATCH/DELETE | `/api/admin/content/faqs/:id` | ADMIN | |
| GET/POST | `/api/admin/content/testimonials` | ADMIN | |
| PATCH/DELETE | `/api/admin/content/testimonials/:id` | ADMIN | |
| GET | `/api/admin/legal` | ADMIN | lista |
| GET/PUT | `/api/admin/legal/:slug` | ADMIN | GET incluye `disclaimer` global |
| GET/POST | `/api/admin/media` | ADMIN | POST multipart `file` + `alt?` → MediaAsset |
| DELETE | `/api/admin/media/:id` | ADMIN | |

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
