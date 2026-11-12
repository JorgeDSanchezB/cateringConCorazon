# ADR-011 — WhatsApp como único canal de contacto y confirmación, sin pasarela de pago

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El negocio ya atiende a sus clientes por WhatsApp; un número, una conversación, un trato personal. El sitio debe convertir (armar pedido → enviar reserva) sin obligar al cliente a crear cuenta, y sin que el negocio asuma comisiones, conciliaciones de pasarela ni requisitos de facturación electrónica que hoy no puede sostener. El presupuesto operativo es cero servicios de pago y cero canales de contacto que nadie atienda.

## Decisión

1. **Un único número configurable**: `WhatsAppSetting` (singleton) con `phoneNumber` en formato E.164 validado (`^\+[1-9]\d{7,14}$`, ej. `+593998877665`; el seed trae el placeholder `+593000000000` para sustituir por el real). Número vacío/nulo permitido: la web lo degrada y el pedido web se registra igual (tolerancia a fallos; la UI ofrece copiar el mensaje).
2. **Mensaje estructurado generado en el servidor**: al crear la reserva (`POST /api/public/orders`), el backend compone el resumen completo (código, cliente, fecha/lugar/invitados, líneas con precios, subtotal, descuento, IVA si activo, total, notas) con la **plantilla editable** `defaultMessage` y devuelve el `whatsappUrl` (wa.me) listo para abrir. El cliente no redacta nada ni toca precios: los totales del mensaje son los del servidor.
3. **Plantilla con variables**: `{BRAND}`, `{ORDER_CODE}`, `{CUSTOMER_NAME}`, `{ITEMS}`, `{SUBTOTAL}`, `{DISCOUNT}`, `{TAX}`, `{TOTAL}`, `{EVENT_DATE}`, `{EVENT_LOCATION}`, `{GUESTS}`, `{NOTES}`. Variables desconocidas se sustituyen por cadena vacía (sin romper la plantilla). Editable desde el panel "WhatsApp".
4. **Sin pasarela de pago**: no hay checkout en línea ni cobro automático; la forma y confirmación de pago se acuerda por WhatsApp (efectivo/transferencia) y el contador registra pagos en el panel (con o sin pedido asociado).
5. **Botón público de contacto**: el saludo de la misma plantilla genera la URL del botón flotante; todo el texto visible (etiqueta del botón) es dato de BD.
6. **Rate limits de protección**: creación de pedidos 6/min por IP, validación de descuentos 20/min, login 10/min (ver `.env.example` y runbook).

## Coste introducido

- **Confirmación humana y no inmediata**: una reserva web llega `PENDING_CONFIRMATION` y alguien del negocio debe confirmar por WhatsApp; fuera de horario de atención el cliente espera (el FAQ sembrado lo explica).
- **Dependencia de un número personal/empresarial de WhatsApp**: si cambia de dueño o de dispositivo, la configuración hay que actualizarla a mano en el panel.
- **Sin acuse estructurado de vuelta**: la respuesta del cliente vuelve como chat humano; el reingreso al sistema (estado CONFIRMED, pagos) es manual del panel.

## Alternativa descartada

**Múltiples canales** (teléfono, correo, formulario neutro) y/o **carrito con checkout online + pasarela de pago**: multiplicaría la operación sin atenderla (nadie contesta el segundo canal), añadiría comisiones y cumplimiento PCI/facturación electrónica que el negocio no puede sostener todavía, y partiría la confirmación en dos sitios. Se descartó por decisión de negocio explícita: un canal, bien hecho.
