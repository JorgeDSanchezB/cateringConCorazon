#!/usr/bin/env bun
/**
 * Genera el esquema PostgreSQL a partir de prisma/schema.prisma (SQLite).
 *
 * El esquema está diseñado para ser idéntico salvo el datasource (ver
 * docs/decisions/001-stack.md): los tipos son prisma-abstractos (String/Int/
 * Boolean/DateTime), los enums viven como String validados con Zod y
 * Product.attributes es String JSON. Por eso basta sustituir el provider.
 *
 * Variantes (argumento):
 *   default  → prisma/schema.pg.prisma        (salida estándar; para el build
 *              de Vercel: `prisma generate --schema` sobrescribe el cliente
 *              por defecto que usa la app en producción).
 *   migrate  → prisma/schema.pg-migrate.prisma (generator con output propio
 *              en prisma/generated-pg; permite migrar datos manteniendo BOTH
 *              clientes a la vez: el SQLite por defecto queda intacto para
 *              el dev local).
 *
 * El archivo generado NO se versiona en git (ver .gitignore): siempre se
 * regenera a partir de la fuente única prisma/schema.prisma.
 */
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "default";
if (mode !== "default" && mode !== "migrate") {
  console.error("Uso: bun scripts/make-pg-schema.ts [default|migrate]");
  process.exit(1);
}

const source = readFileSync("prisma/schema.prisma", "utf8");

if (!/provider\s*=\s*"sqlite"/.test(source)) {
  console.error(
    "[make-pg-schema] prisma/schema.prisma ya no declara provider=\"sqlite\". " +
      "Revisa este script: la migración SQLite→Postgres puede haberse completado.",
  );
  process.exit(1);
}

let out = source.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');

if (mode === "migrate") {
  // Cliente con salida propia para convivir con el cliente SQLite local.
  const generatorRe = /generator client \{\s*\n\s*provider = "prisma-client-js"/;
  if (!generatorRe.test(out)) {
    console.error("[make-pg-schema] No se encontró el bloque generator client esperado.");
    process.exit(1);
  }
  out = out.replace(
    generatorRe,
    'generator client {\n  provider = "prisma-client-js"\n  output   = "../prisma/generated-pg"',
  );
}

const target = mode === "migrate" ? "prisma/schema.pg-migrate.prisma" : "prisma/schema.pg.prisma";
writeFileSync(target, out);
console.log(`[make-pg-schema] ${target} generado (provider=postgresql${mode === "migrate" ? ", output=prisma/generated-pg" : ""}).`);
