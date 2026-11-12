# ADR-004 — Roles ADMIN / STAFF / CONTADOR con matrices de permisos por módulo

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El panel interno lo usan tres perfiles reales distintos del negocio: el dueño/administrador (configura catálogo, precios, textos, usuarios y flags), el staff que atiende eventos (registra ventas en sitio y maneja pedidos/inventario) y un contador externo (revisa ingresos, egresos y facturación, sin permisos sobre el catálogo). Se necesita una frontera simple, auditable y comprensible para personas no técnicas, donde "qué puede hacer cada rol" se explique en una tabla.

## Decisión

**Tres roles fijos** (`User.role`, validado en aplicación porque SQLite no tiene enums): `ADMIN`, `STAFF`, `CONTADOR`. La autorización se hace en dos capas coordinadas:

1. **API (fuente de verdad)**: cada Route Handler llama `requireUser(req, { roles: [...] })` (`src/lib/auth.ts`); sin sesión → 401, rol insuficiente → 403, `mustChangePassword` pendiente → 409 `MUST_CHANGE_PASSWORD` salvo en las pantallas de cambio forzado.
2. **Panel (usabilidad)**: `admin-app.tsx` define los módulos visibles por rol; acceder por URL a un módulo no permitido muestra un panel explicativo "Acceso no autorizado" (la API seguiría protegiendo de todos modos).

Matriz de módulos del panel (`admin-app.tsx`):

| Módulo (hash) | ADMIN | STAFF | CONTADOR | Flag que lo apaga |
|---|---|---|---|---|
| Resumen (`#/admin`) | si | si | si | — |
| Punto de venta (`#/admin/pos`) | si | si | no | — |
| Pedidos (`#/admin/orders`) | si | si | si | — |
| Inventario (`#/admin/inventory`) | si | si | no | — |
| Contabilidad (`#/admin/accounting`) | si | no | si | — |
| Facturación (`#/admin/invoices`) | si | no | si | `invoicing_enabled` |
| Productos / Categorías / Combos / Descuentos / Eventos / Esquemas / Contenido / Legal / Usuarios / Tema / WhatsApp / Ajustes / Flags | si | no | no | `combos_enabled`, `discounts_enabled` según módulo |

Matriz de operaciones relevantes de la API (verificada en `src/app/api/**`):

| Operación | Roles |
|---|---|
| `GET /api/admin/overview`, `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `GET /api/admin/inventory`, `GET /api/admin/inventory/movements`, `GET /api/admin/products`, `GET /api/admin/products/:id`, `GET /api/admin/events`, `GET /api/admin/events/:id` | todos |
| `POST /api/admin/orders/onsite`, `PATCH /api/admin/orders/:id/status`, `POST /api/admin/inventory/adjust` | ADMIN, STAFF |
| `POST /api/admin/orders/:id/payments`, `GET/POST /api/admin/payments`, `GET/POST/PATCH/DELETE /api/admin/expenses`, `GET /api/admin/accounting/summary`, `GET/POST /api/admin/invoices`, `POST /api/admin/invoices/:id/void` | CONTADOR, ADMIN |
| Todo lo demás del panel (productos/variantes/categorías/combos/descuentos/eventos/esquemas/contenido/legal/usuarios/tema/ajustes/flags/whatsapp/medios/borrador IA) | ADMIN |

Protecciones adicionales: un ADMIN no puede degradar su propio rol ni desactivarse a sí mismo (evita quedar fuera del panel); el reset de contraseñas ajenas exige motivo y deja auditoría (`PasswordReset`).

## Coste introducido

- **Granularidad fija**: un permiso "a medias" (p. ej. STAFF que edita precios pero no textos) obliga a decidir entre darle ADMIN o cambiar la matriz en código. Con tres roles esto se considera aceptable y hasta deseable para la operación del negocio.
- **Coherencia doble**: la matriz de la UI y la de la API viven en sitios distintos; se mitigó leyendo ambas del mismo árbol de requisitos y documentándolas aquí y en `docs/api-contract.md`.

## Alternativa descartada

**Permisos finos por endpoint** (RBAC granular: tabla `Permission` con claves por acción, roles editables con casillas por llamada): se descartó porque duplica la superficie de configuración y de errores para un equipo de tres perfiles; el costo de administrar permisos supera el beneficio. Si el negocio crece a roles nuevos (p. ej. "cocina"), la decisión deberá revisarse.
