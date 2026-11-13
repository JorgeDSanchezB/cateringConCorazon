#!/usr/bin/env bun
/**
 * Orquestador de despliegue de la base de datos a NEON (PostgreSQL serverless).
 *
 * Uso:
 *   NEON_DATABASE_URL="postgresql://…direct…" bun scripts/neon-deploy.ts push
 *   NEON_DATABASE_URL="postgresql://…direct…" bun scripts/neon-deploy.ts migrate
 *   NEON_DATABASE_URL="postgresql://…direct…" bun scripts/neon-deploy.ts seed
 *   NEON_DATABASE_URL="postgresql://…direct…" bun scripts/neon-deploy.ts all
 *
 * - push     → crea/actualiza las tablas en Neon (prisma db push).
 * - migrate  → copia TODOS los datos del SQLite local (productos, pedidos,
 *              banners, usuarios, ajustes…) a Neon. Re-ejecutarlo vuelve a
 *              sincronizar desde cero (borra y reinserta): es destructivo
 *              con lo que haya en Neon, no con el SQLite de origen.
 * - seed     → aplica el seed idempotente de demostración sobre Neon (en vez
 *              de migrar los datos reales).
 * - all      → push + migrate (recomendado para el primer despliegue).
 *
 * Importante:
 * - Usa la cadena de conexión DIRECTA (sin -pooler-) para DDL/migración;
 *   la POOLED se configura luego como DATABASE_URL en Vercel.
 * - El cliente SQLite local (node_modules por defecto) NO se toca en push/
 *   migrate: el cliente Postgres se genera en prisma/generated-pg (exclusivo
 *   de este script). En `seed` se intercambia temporalmente y se restaura.
 * - Siempre deja el entorno local como estaba.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const MODES = ["push", "migrate", "seed", "all"] as const;
type Mode = (typeof MODES)[number];

const HELP = `Uso: NEON_DATABASE_URL="postgresql://usuario:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require" bun scripts/neon-deploy.ts <push|migrate|seed|all>

  push     Crea/actualiza las tablas en Neon (prisma db push).
  migrate  Copia TODOS los datos del SQLite local a Neon (re-sincroniza desde cero).
  seed     Aplica el seed idempotente de demostración sobre Neon.
  all      push + migrate (primer despliegue recomendado).

Usa la cadena DIRECTA (sin "-pooler-") de Neon; la POOLED se configura en
Vercel como DATABASE_URL. Documentación completa: docs/deploy-vercel-neon.md`;

const mode = process.argv[2] as Mode | undefined;
const url = process.env.NEON_DATABASE_URL;

if (!mode || !MODES.includes(mode)) {
  console.error(HELP);
  process.exit(1);
}
if (!url) {
  console.error("[neon-deploy] Falta NEON_DATABASE_URL en el entorno.\n\n" + HELP);
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("[neon-deploy] NEON_DATABASE_URL debe empezar por postgresql:// (cópiala del dashboard de Neon).");
  process.exit(1);
}
if (url.includes("-pooler.") && (mode === "push" || mode === "migrate" || mode === "all")) {
  // prisma db push (DDL) y createMany masivo funcionan mejor por la conexión
  // directa; el pooler (PgBouncer en modo transacción) puede romper DDL.
  console.warn(
    "[neon-deploy] AVISO: estás usando la cadena POOLED (-pooler-) para DDL/migración.\n" +
      "          Recomendado: cadena directa para este script; pooled solo para Vercel.",
  );
}

function run(command: string, env: Record<string, string> = {}): void {
  execSync(command, { stdio: "inherit", env: { ...process.env, ...env } });
}

function prisma(args: string, env: Record<string, string> = {}): void {
  // bunx resuelve el binario local de node_modules/.bin (prisma CLI).
  run(`bunx prisma ${args}`, env);
}

// ─────────────────────── push: crear tablas ───────────────────────
function push(): void {
  run("bun scripts/make-pg-schema.ts migrate");
  prisma("db push --schema prisma/schema.pg-migrate.prisma --accept-data-loss", {
    DATABASE_URL: url,
  });
}

// ─────────────────── migrate: copiar datos reales ───────────────────
async function migrate(): Promise<void> {
  run("bun scripts/make-pg-schema.ts migrate");
  prisma("generate --schema prisma/schema.pg-migrate.prisma");
  if (!existsSync("prisma/generated-pg/index.js")) {
    console.error("[neon-deploy] No se generó el cliente Postgres (prisma/generated-pg).");
    process.exit(1);
  }

  // Clientes simultáneos: origen SQLite (por defecto, intacto) + destino
  // Postgres (salida propia). El destino recibe la URL por `datasources`.
  const { PrismaClient: SqliteClient, Prisma: SqliteDmmf } = await import("@prisma/client");
  const pgModule = (await import("../prisma/generated-pg")) as typeof import("@prisma/client");
  const source = new SqliteClient();
  const target = new pgModule.PrismaClient({ datasources: { db: { url } } });

  // Orden topológico por FK: en el DMMF runtime, los campos de relación con
  // relationFromFields no vacío son columnas de clave foránea en ESTE modelo
  // (depende del modelo apuntado).
  const models = SqliteDmmf.dmmf.datamodel.models;
  const deps = new Map<string, Set<string>>();
  const names = models.map((m) => m.name);
  for (const m of models) {
    deps.set(m.name, new Set());
    for (const f of m.fields) {
      const fk = (f as { relationFromFields?: string[] }).relationFromFields;
      if (fk && fk.length > 0 && f.type !== m.name && names.includes(f.type)) {
        deps.get(m.name)!.add(f.type);
      }
    }
  }

  // Kahn: procesa primero los modelos sin dependencias.
  const ordered: string[] = [];
  const pending = new Set(names);
  while (pending.size > 0) {
    const ready = [...pending]
      .filter((n) => [...deps.get(n)!].every((d) => !pending.has(d)))
      .sort();
    if (ready.length === 0) {
      // Ciclo (no existe en este esquema): procesar alfabético para no bloquear.
      console.warn("[neon-deploy] Ciclo de FK detectado; se inserta en orden alfabético.");
      ordered.push(...[...pending].sort());
      break;
    }
    for (const n of ready) {
      ordered.push(n);
      pending.delete(n);
    }
  }

  const src = source as unknown as Record<string, { findMany: () => Promise<Record<string, unknown>[]> }>;
  const dst = target as unknown as Record<
    string,
    { deleteMany: () => Promise<unknown>; createMany: (a: { data: unknown[] }) => Promise<{ count: number }> }
  >;

  console.log("\n[neon-deploy] Migrando datos (SQLite → Neon)…");
  // Limpieza en orden INVERSO (hijas primero; los DELETE con FK no chocan).
  for (const name of [...ordered].reverse()) {
    await dst[name].deleteMany();
  }
  let total = 0;
  for (const name of ordered) {
    const rows = await src[name].findMany();
    if (rows.length === 0) continue;
    const r = await dst[name].createMany({ data: rows });
    total += r.count;
    console.log(`  ${name}: ${r.count} filas`);
  }
  console.log(`[neon-deploy] Total migrado: ${total} filas en ${ordered.length} modelos.\n`);

  await target.$disconnect();
  await source.$disconnect();
}

// ─────────────────────── seed: datos demo ───────────────────────
function seed(): void {
  run("bun scripts/make-pg-schema.ts default");
  try {
    // El seed importa @prisma/client (salida por defecto): se intercambia
    // temporalmente por el cliente Postgres y se restaura al terminar.
    prisma("generate --schema prisma/schema.pg.prisma");
    run("bun prisma/seed.ts", { DATABASE_URL: url });
  } finally {
    prisma("generate");
  }
}

// ─────────────────────── orquestación ───────────────────────
if (mode === "push" || mode === "all") push();
if (mode === "migrate" || mode === "all") await migrate();
if (mode === "seed") seed();

console.log("[neon-deploy] Listo. Siguiente paso: configurar Vercel (docs/deploy-vercel-neon.md).");
