# ADR-013 — Legales: 4 plantillas completas editables desde admin, borrador asistido por IA, sin integración SRI

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

Todo sitio público en Ecuador necesita publicar política de privacidad, política de cookies, términos y condiciones y aviso legal. El titular no puede redactarlos de cero pero tampoco puede publicarlos sin revisarlos: los textos legales son su responsabilidad. Además, la facturación del sistema es un registro interno (numeración configurable), no un comprobante electrónico ante el SRI, y eso debe quedar dicho en el propio sitio para no inducir a error.

Por otro lado, el entorno dispone de un SDK de IA (`z-ai-web-dev-sdk`) usable desde el backend; usarlo bien significa acotarlo a un asistente de redacción, con su costo protegido, y sin que un fallo del servicio tumbe el editor manual.

## Decisión

1. **Cuatro páginas legales como contenido editable**: `LegalPage` por slug reservado (`privacidad`, `cookies`, `terminos`, `aviso-legal`), sembradas completas (privacidad conforme a la LOPDP ecuatoriana, cookies técnicas del sitio, términos del servicio de catering con montaje en sitio y sin entregas a domicilio, aviso legal con identificación y el aviso de facturación interna). Edición Markdown desde el panel "Legal" (`GET/PUT /api/admin/legal/:slug`); la web pública las sirve en `#/legal/<slug>`.
2. **Disclaimer global obligatorio**: `SiteSetting.legal_disclaimer` (editable, grupo "legal") se muestra junto a la edición en el panel y acompaña las páginas; sembrado con el texto "Esta plantilla es un borrador generado automáticamente y no constituye asesoría legal. Revísala con un abogado colegiado en Ecuador antes de publicarla."
3. **Borrador asistido por IA, en el backend, nunca sustituto de asesoría**: `POST /api/admin/ai/draft` (solo ADMIN, rate limit `AI_DRAFT_MAX_PER_MINUTE` = 6/min por costo) recibe `{kind:"legal", slug (de las 4), currentTitle?, notes?}` y llama a `z-ai-web-dev-sdk` en el servidor. El prompt de sistema fuerza: español de Ecuador, Markdown con secciones numeradas, y una sección final de aviso de que es una plantilla generada automáticamente que no sustituye asesoría legal profesional; pide dejar `[NOMBRE DEL RESPONSABLE]`, `[CIUDAD]`, `[EMAIL]` entre corchetes para que el administrador los rellene. Devuelve `{text, title}`.
4. **Clasificación de fallos del asistente**: SDK no inicializable o fallo de red → 500 con mensaje claro ("el editor manual sigue funcionando"); respuesta vacía/demasiado corta → 422 explícito. El editor manual nunca depende de la IA.
5. **Sin integración SRI real**: la facturación es interna con numeración configurable (`invoice_prefix` `001-001-`, `invoice_padding` 9; primera factura `001-001-000000001`), anulable con motivo, y el aviso legal sembrado lo declara en su sección 5: no sustituye a la facturación electrónica obligatoria ante el SRI. No se usa número de RUC ni autorización de emisión reales.

## Coste introducido

- **El texto legal definitivo es responsabilidad del titular**: el sistema provee plantilla y aviso, no criterio legal; nada valida el contenido contra la normativa (imposible y fuera de alcance).
- **La IA puede no estar disponible**: es una dependencia de servicio opcional; sin ella se pierde la asistencia, no la función (coste aceptado deliberadamente).
- **Costo por uso**: cada borrador consume llamadas al modelo; el rate limit de 6/min y el rol ADMIN acotan el gasto.

## Alternativa descartada

**Textos legales estáticos en el código** (o en archivos del repo): cualquier ajuste del titular (nombre legal, RUC, ciudad) sería un despliegue, y el disclaimer "editable" no existiría. **Integración real con el SRI** (facturación electrónica): exige certificados, firma y validación oficial fuera del alcance y del presupuesto operativo actual; se documentó explícitamente como no incluida en lugar de simularla. Entregar **tests de legalidad ficticios** también se descartó: sería fingir una garantía que no existe.
