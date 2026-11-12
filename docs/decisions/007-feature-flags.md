# ADR-007 — Feature flags en base de datos, editables en caliente sin reiniciar

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El producto se entregó con módulos que el titular quiere poder encender/apagar según cómo opera: IVA, facturación interna, variantes de producto, testimonios públicos, combos y códigos de descuento. La solución clásica (variables de entorno) exige reiniciar el proceso y tocar un archivo del servidor, algo que el operador del negocio no hará. Además, el entorno de publicación no ofrece reinicios bajo demanda cómodos.

## Decisión

1. **Seis flags en la tabla `FeatureFlag`** (clave, valor booleano, descripción), con valores por defecto definidos como única fuente de verdad en `src/lib/flags.ts` (`FLAG_DEFAULTS`) y sembrados:

   | Flag | Por defecto | Efecto |
   |---|---|---|
   | `tax_enabled` | off | Aplicar el IVA de Ajustes sobre los pedidos (ADR-006) |
   | `invoicing_enabled` | off | Habilitar el módulo de facturación interna numerada |
   | `variants_enabled` | off | Activar variantes (tamaño/sabor) en catálogo y pedidos |
   | `testimonials_enabled` | off | Mostrar el bloque de testimonios en la web pública |
   | `combos_enabled` | on | Activar el módulo de combos (creación y venta) |
   | `discounts_enabled` | on | Activar validación y aplicación de códigos de descuento |

2. **Edición desde el panel** (módulo "Flags", `PUT /api/admin/flags` con mapa parcial clave→booleano): surte efecto **en el siguiente request**; los handlers leen el flag por consulta (`getFlag`/`getFlags`), sin caché entre requests ni reinicio.
3. **Comportamiento de módulo apagado**: los endpoints afectados responden 409 `module-disabled` con código `FLAG_<flag>` y mensaje accionable (p. ej. facturación); los listados públicos degradan a lista vacía (combos) o bloque no renderizado (testimonios); el panel muestra los módulos dependientes con etiqueta "off" y un panel explicativo al entrar.
4. **Tolerancia a datos incompletos**: si falta una fila de flag (seed incompleto), se usa el default y se registra un aviso de configuración en el log.
5. Los flags son **datos operativos**, no variables de entorno: viven en la BD, se respaldan con ella y no aparecen en `.env.example`.

## Coste introducido

- **Una lectura de BD por consulta de flags**: cada listado/creación relevante hace `findMany` sobre la tabla de flags (tabla diminuta, lectura por clave primaria); se acepta porque elimina la invalidación manual de cachés.
- **Coherencia visual diferida**: la web pública refresca su bootstrap cada 60 s o al guardar en el panel; un flag cambiado puede verse "viejo" en una pestaña abierta hasta ese refresco (los endpoints, en cambio, responden al momento con el valor nuevo).
- **Aprendizaje del operador**: el panel explica el efecto de cada flag con su descripción sembrada; aún así es un lugar más donde equivocarse (encender facturación sin decidir la numeración; el aviso de que la facturación interna no sustituye la electrónica del SRI está en ADR-013).

## Alternativa descartada

**Variables de entorno** (`TAX_ENABLED=1`): reinicio obligatorio para cada cambio, archivos del servidor fuera del alcance del operador, y estados "fantasma" entre despliegues. También se descartó una solución de flags de mercado (p. ej. servicios de feature-flagging externos): introduce una dependencia externa que el requisito "funcionar sin servicios externos" prohíbe y que para seis switches es sobreingeniería.
