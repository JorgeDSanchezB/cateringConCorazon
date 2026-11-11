import type { Prisma, ThemeSetting } from "@prisma/client";
import { db } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { rowToTheme, themeUpdateSchema, type ThemeData, type ThemeUpdate } from "../theme";
import { themeContrastProblems } from "../wcag";

/** Lee el singleton de tema; fila ausente → DEFAULT_THEME + warn de config. */
export async function getTheme(): Promise<ThemeData> {
  const row = await db.themeSetting.findUnique({ where: { id: "theme" } });
  if (!row) {
    console.warn("[CONFIG] ThemeSetting ausente → se usa el tema por defecto (ejecute el seed).");
    return rowToTheme(null);
  }
  return rowToTheme(row);
}

/**
 * Guarda el tema con VALIDACIÓN DE CONTRASTE WCAG AA en servidor.
 * Pares que no cumplen 4.5:1 → 422 con detalle; no se persisten temas ilegibles.
 */
export async function updateTheme(input: ThemeUpdate): Promise<ThemeData> {
  const parsed = themeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(raíz)", message: i.message })),
    );
  }
  const candidate: ThemeData = {
    ...parsed.data,
    logoUrl: parsed.data.logoUrl ?? null,
    faviconUrl: parsed.data.faviconUrl ?? null,
  };
  const contrastProblems = themeContrastProblems(candidate);
  if (contrastProblems.length > 0) {
    throw new ValidationError(
      contrastProblems.map((p) => ({
        field: "theme",
        message: `${p.message} Corrija los colores indicados.`,
      })),
    );
  }
  const data: Prisma.ThemeSettingUncheckedCreateInput = {
    id: "theme",
    ...candidate,
    radiusLevel: candidate.radiusLevel,
    shadowLevel: candidate.shadowLevel,
  };
  const row = await db.themeSetting.upsert({
    where: { id: "theme" },
    update: data,
    create: data,
  });
  return rowToTheme(row as ThemeSetting);
}
