# ADR-003 — Atributos de producto como JSON validado con JSON Schema versionado (ajv)

- **Estado**: aceptada.
- **Fecha**: 2025.

## Contexto

El catálogo necesita atributos que varían por producto y que el negocio quiere cambiar sin desplegar código: `sinGluten`, `vegetariano`, `nivelPicante`, notas breves para la carta; mañana quizá `sabor`, `presentacion`, picante numérico o etiquetas nuevas. En SQLite no existe columna JSONB nativa (ADR-001), y la alternativa clásica es EAV (tabla de pares entidad-atributo-valor).

Además, los atributos se muestran en tarjetas del catálogo (`ProductCard` renderiza `AttributeChips` sin conocer las claves), por lo que el contrato debe ser "objeto arbitrario pero validado y acotado".

## Decisión

1. **`Product.attributes` es un String JSON** (equivalente funcional a JSONB al migrar a PostgreSQL) acompañado de `Product.attributeSchemaVersion Int?`.
2. **Validación con JSON Schema + ajv versionada**: la tabla `ProductAttributeSchema` guarda versiones del esquema (draft-07). Solo una fila puede estar activa. El seed crea la **versión 1**: `{sinGluten: boolean, vegetariano: boolean, nivelPicante: enum [suave, medio, fuerte], notas: string<=80}` con `additionalProperties: false`.
3. **Mundo cerrado forzado**: al guardar un esquema nuevo desde el panel (módulo "Esquemas"), el backend normaliza el esquema con `additionalProperties: false` (`hardenSchema` en `src/lib/domain/attributes.ts`); una clave no declarada en el esquema produce 422 en el alta/edición del producto.
4. **Límites técnicos configurables** (`src/lib/config.ts`, overrideables por entorno):
   - `ATTRIBUTES_MAX_BYTES` (por defecto 16384 = 16 KB de JSON serializado en UTF-8);
   - `ATTRIBUTES_MAX_DEPTH` (por defecto 2: plano o un nivel anidado, nada más);
   - `ATTRIBUTES_MAX_KEYS` (por defecto 32 claves).
5. **Claves peligrosas bloqueadas** en el shape (Zod, antes de ajv): `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`, `length`. Los valores permitidos son primitivos (string/number/boolean/null) o un registro plano de primitivos.
6. **Versionado por producto, no global**: al editar un producto se valida contra la versión que el propio producto declara (`attributeSchemaVersion`), no contra la activa; los productos viejos siguen siendo válidos aunque se publique un esquema v2 (compatibilidad hacia atrás). Crear un producto nuevo usa el esquema activo vigente.
7. **Lectura tolerante para render**: JSON corrupto en BD no rompe la web pública; se parsea con degradación a `{}` y aviso en el log (`parseAttributesForRender`).
8. **Extensión documentada end-to-end** (ver README, sección de extensibilidad): para añadir `sabor` o ampliar cualquier atributo se crea la versión 2 del esquema desde el módulo admin "Esquemas" y se editan los productos que deban llevarlo; ni `ProductCard` ni el pipeline cambian.

## Coste introducido

- **Sin consultas SQL por atributo**: al no haber JSONB/indexación en SQLite, "filtrar productos con sinGluten=true en SQL" no existe; el filtrado por atributos, si algún día se exige, debe hacerse en aplicación o esperar a PostgreSQL con JSONB.
- **Un artefacto más que operar**: el esquema activo y sus versiones viven en BD y el panel los gestiona; una edición descuidada del esquema puede rechazar productos existentes en su próxima edición (no en su lectura, que es tolerante).
- **Complejidad de doble validación** (Zod para shape/límites + ajv para contrato semántico), aceptada porque cada capa protege algo distinto.

## Alternativa descartada

**EAV** (tablas `Attribute`, `AttributeValue`): habría dado tipado y filtrado SQL por atributo, pero a costa de joins N-ary por producto en cada tarjeta del catálogo, una administración de catálogo mucho más compleja para el operador, y la misma necesidad de un contrato de tipos editable. Para un catálogo de decenas de productos con atributos de presentación, el JSON validado es más simple y suficiente; EAV se descartó por sobreingeniería.
