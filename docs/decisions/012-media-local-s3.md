# ADR-012 — Medios: subida local a public/uploads con registro MediaAsset; S3/R2 como adaptador futuro

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El panel necesita subir imágenes (banners, fotos de producto, logo, favicon) y elegir entre ellas (selector de medios). La solución debe funcionar en este entorno sin credenciales ni servicios externos, y a la vez no pintarse en una esquina cuando el negocio crezca y convenga un almacenamiento de objetos (S3/R2) por respaldo o CDN.

## Decisión

1. **Almacenamiento local en `public/uploads/`**: `POST /api/admin/media` recibe `multipart/form-data` con `file` (y `alt` opcional), valida la whitelist MIME (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`) y el tamaño máximo `UPLOAD_MAX_BYTES` (por defecto 5 MB = 5 242 880 bytes), escribe el archivo con nombre aleatorio `UUID.ext` (extensión derivada del MIME) y lo registra en `MediaAsset` (url, filename, mimeType, sizeBytes, alt, createdAt). Respuesta 201 con el asset; la URL pública es `/uploads/<nombre>`.
2. **Galería paginada por cursor** (`GET /api/admin/media`, orden `createdAt` descendente) y **borrado físico** (`DELETE /api/admin/media/:id`: elimina el registro y el archivo si es local; si es una URL externa solo advierte y borra el registro).
3. **Las URL externas siguen siendo válidas como datos**: los campos de imagen de producto/banner/logo aceptan `/uploads/...` o `https://...` (regex validada), de modo que el negocio puede enlazar directamente una imagen propia ya alojada fuera del sistema.
4. **S3/R2 documentado como adaptador opcional futuro**: la superficie ya está preparada para sustituir la escritura/lectura local por un cliente de objetos: el contrato con el resto del sistema es el registro `MediaAsset` y la URL final; ninguna otra parte del código depende de que el archivo esté en disco local. No se implementa ahora (no hay credenciales en este entorno; añadirlo sin poder verificarlo sería sobreingeniería).
5. El seed registra los medios de los productos sembrados como `MediaAsset` para que la galería arranque con contenido.

## Coste introducido

- **Almacenamiento local no escala horizontalmente**: `public/` vive en el disco del proceso; despliegues multi-instancia (o contenedores efímeros) pierden las subidas hasta migrar al adaptador de objetos.
- **El servidor sirve los archivos estáticos de subida** junto con la app; muchos archivos grandes golpean el mismo proceso (mitigado por el límite de 5 MB y la naturaleza de galería pequeña del catálogo).
- **SVG dentro de la whitelist**: decisión tomada por flexibilidad con logos vectoriales; quien suba SVG es personal autenticado del panel, pero conviene recordarlo como superficie de contenido de confianza al revisar la seguridad.

## Alternativa descartada

**Solo URLs externas** (sin subida): obligaría a alojar las imágenes fuera antes de poder cambiar un banner y depender de terceros para contenido propio (y su vida útil), contradiciendo "funcionar sin servicios externos". También se descartó implementar ya el cliente S3/R2: exigiría credenciales y un bucket reales para probar algo que este entorno no tiene; quedó como adaptador documentado (decisión 4).
