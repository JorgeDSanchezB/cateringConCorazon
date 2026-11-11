"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAdminMutation, useDetail } from "@/components/ccc/admin/data-hooks";
import { ImageField, MediaPicker } from "@/components/ccc/admin/media-picker";
import { ErrorBlock, LoadingBlock, ViewHeader } from "@/components/ccc/admin/ui-bits";
import { applyThemeCss } from "@/components/ccc/shared/theme-apply";
import { ApiError } from "@/components/ccc/shared/api-client";
import { checkThemeContrast, type ContrastPair } from "@/lib/wcag";
import { themeToCss, type ThemeData } from "@/lib/theme";

// Respuesta de GET /api/admin/theme.
interface FontOption {
  key: string;
  label: string;
}

interface ThemeResponse {
  theme: ThemeData;
  contrast: ContrastPair[];
  fonts: FontOption[];
  radiusLevels: string[];
  shadowLevels: string[];
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const RADIUS_LABELS: Record<string, string> = {
  none: "Recto (sin redondeo)",
  sm: "Suave (6px)",
  md: "Medio (10px)",
  lg: "Amplio (14px)",
  xl: "Muy amplio (20px)",
};

const SHADOW_LABELS: Record<string, string> = {
  none: "Sin sombra",
  sm: "Suave",
  md: "Media",
  lg: "Marcada",
};

type ColorKey =
  | "background"
  | "foreground"
  | "card"
  | "cardForeground"
  | "primary"
  | "primaryForeground"
  | "accent"
  | "accentForeground"
  | "muted"
  | "mutedForeground"
  | "border";

const COLOR_GROUPS: { title: string; description: string; fields: { key: ColorKey; label: string }[] }[] = [
  {
    title: "Fondo y texto",
    description: "Colores base de la página y de las tarjetas.",
    fields: [
      { key: "background", label: "Fondo general" },
      { key: "foreground", label: "Texto general" },
      { key: "card", label: "Fondo de tarjeta" },
      { key: "cardForeground", label: "Texto de tarjeta" },
    ],
  },
  {
    title: "Marca",
    description: "Botones y destacados de la marca.",
    fields: [
      { key: "primary", label: "Principal (botones)" },
      { key: "primaryForeground", label: "Texto sobre principal" },
      { key: "accent", label: "Acento (resaltados)" },
      { key: "accentForeground", label: "Texto sobre acento" },
    ],
  },
  {
    title: "Suave",
    description: "Zonas secundarias y texto atenuado.",
    fields: [
      { key: "muted", label: "Fondo suave" },
      { key: "mutedForeground", label: "Texto suave" },
    ],
  },
  {
    title: "Borde",
    description: "Líneas y separadores.",
    fields: [{ key: "border", label: "Color de borde" }],
  },
];

/** Campo de color: selector nativo + entrada hex sincronizadas. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const invalid = !HEX_RE.test(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={invalid ? "#000000" : value.toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label}: selector de color`}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
          className="font-mono uppercase"
          placeholder="#RRGGBB"
          aria-label={`${label}: valor hexadecimal`}
        />
      </div>
      {invalid ? (
        <p className="text-xs text-destructive" role="alert">
          Formato #RRGGBB requerido (ej: #9E2B1E).
        </p>
      ) : null}
    </div>
  );
}

export default function ThemeView() {
  const { data, isLoading, isError, error, refetch } = useDetail<ThemeResponse>("/api/admin/theme");
  const [candidate, setCandidate] = useState<ThemeData | null>(null);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);

  // Copia editable inicial desde el servidor (una sola vez por carga).
  useEffect(() => {
    if (data && candidate === null) setCandidate(data.theme);
  }, [data, candidate]);

  const pairs = useMemo<ContrastPair[]>(() => (candidate ? checkThemeContrast(candidate) : []), [candidate]);
  const anyFail = pairs.some((p) => !p.pass);
  const allColorsValid = candidate
    ? COLOR_GROUPS.flatMap((g) => g.fields).every((f) => HEX_RE.test(String(candidate[f.key])))
    : false;

  const saveTheme = useAdminMutation<{ theme: ThemeData; contrast: ContrastPair[] }, ThemeData>(
    "PUT",
    "/api/admin/theme",
    {
      successMessage: "Tema guardado: la web pública ya usa los nuevos colores.",
      invalidate: [["public-bootstrap"]],
      onDone: (res) => applyThemeCss(res.theme),
    },
  );

  // Errores del servidor (pares que fallan la validación WCAG duplicada).
  const serverMessages =
    saveTheme.error instanceof ApiError
      ? (saveTheme.error.problem.errors ?? []).map((e) => `${e.field === "theme" ? "" : `${e.field}: `}${e.message}`)
      : [];

  if (isLoading) return <LoadingBlock label="Cargando tema…" />;
  if (isError || !data) {
    return <ErrorBlock message={error instanceof Error ? error.message : "No se pudo cargar el tema."} onRetry={() => void refetch()} />;
  }
  if (!candidate) return <LoadingBlock label="Preparando editor…" />;

  const patch = (p: Partial<ThemeData>) => setCandidate((prev) => (prev ? { ...prev, ...p } : prev));

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Tema visual"
        description="Colores, tipografías y forma de la web pública. La validación de contraste WCAG AA es en vivo."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Columna izquierda: formulario */}
        <div className="space-y-6">
          {COLOR_GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className="text-base">{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <ColorField
                    key={f.key}
                    label={f.label}
                    value={String(candidate[f.key])}
                    onChange={(v) => patch({ [f.key]: v } as Partial<ThemeData>)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tipografía, forma e imagen</CardTitle>
              <CardDescription>
                Tipografías cargadas en el sistema, redondeo de esquinas, sombra y logotipo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Tipografía de títulos</Label>
                  <Select value={candidate.fontHeading} onValueChange={(v) => patch({ fontHeading: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elija una tipografía" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.fonts.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Tipografía de texto</Label>
                  <Select value={candidate.fontBody} onValueChange={(v) => patch({ fontBody: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elija una tipografía" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.fonts.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Redondeo de esquinas</Label>
                  <Select value={candidate.radiusLevel} onValueChange={(v) => patch({ radiusLevel: v as ThemeData["radiusLevel"] })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.radiusLevels.map((r) => (
                        <SelectItem key={r} value={r}>
                          {RADIUS_LABELS[r] ?? r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Sombra de tarjetas</Label>
                  <Select value={candidate.shadowLevel} onValueChange={(v) => patch({ shadowLevel: v as ThemeData["shadowLevel"] })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.shadowLevels.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SHADOW_LABELS[s] ?? s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Logotipo</Label>
                  <ImageField
                    url={candidate.logoUrl}
                    onPick={(url) => patch({ logoUrl: url })}
                    onOpen={() => setLogoPickerOpen(true)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Favicon</Label>
                  <ImageField
                    url={candidate.faviconUrl}
                    onPick={(url) => patch({ faviconUrl: url })}
                    onOpen={() => setFaviconPickerOpen(true)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: vista previa + contraste */}
        <div className="space-y-6 lg:sticky lg:top-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vista previa en vivo</CardTitle>
              <CardDescription>Así se verá la web pública con este tema.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Variables CSS del candidato aplicadas solo dentro del bloque de preview. */}
              <style>{themeToCss(candidate).replace(":root", ".theme-preview-scope")}</style>
              <div className="theme-preview-scope rounded-lg border-2 border-dashed p-4">
                <div className="bg-background text-foreground space-y-4 rounded-lg p-4">
                  <h3
                    className="text-xl font-bold leading-tight"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Catering con Corazón
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                    Menús artesanales para fiestas y celebraciones. Nos montamos en tu evento.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold">
                      Ver el menú
                    </span>
                    <span className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold">
                      Reservar
                    </span>
                  </div>
                  <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm">
                    Texto suave sobre fondo suave (nota informativa).
                  </div>
                  <div
                    className="bg-card text-card-foreground rounded-lg border p-3"
                    style={{ boxShadow: "var(--theme-shadow)" }}
                  >
                    <p className="text-sm font-semibold">Sándwiches de pollo</p>
                    <p className="text-sm text-muted-foreground">Delicioso, artesanal y para compartir.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contraste WCAG AA</CardTitle>
              <CardDescription>
                Mínimo 4.5:1 en cada par texto/fondo. El guardado se bloquea si algún par falla.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {pairs.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-2 border-b py-2 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="relative inline-flex size-4 shrink-0 rounded border"
                      style={{ background: p.background }}
                      aria-hidden
                    >
                      <span
                        className="absolute inset-0 m-auto size-1.5 rounded-full"
                        style={{ background: p.foreground }}
                      />
                    </span>
                    <span className="truncate text-sm">{p.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{p.ratio.toFixed(2)}:1</span>
                    <Badge
                      variant="outline"
                      className={
                        p.pass
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-rose-200 bg-rose-50 text-rose-900"
                      }
                    >
                      {p.pass ? "AA OK" : "Falla"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Errores del servidor al guardar (pares rechazados) */}
      {serverMessages.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>El servidor rechazó el tema</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {serverMessages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Barra de guardado */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {anyFail
            ? "Hay pares de contraste que fallan: corríjalos antes de guardar."
            : "Todos los pares de contraste cumplen AA. El tema se aplica sin reiniciar el servidor."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCandidate(data.theme)}
            disabled={saveTheme.isPending}
          >
            <RotateCcw className="size-4" aria-hidden />
            Restablecer
          </Button>
          <Button
            onClick={() => saveTheme.mutate(candidate)}
            disabled={saveTheme.isPending || anyFail || !allColorsValid}
          >
            <Save className="size-4" aria-hidden />
            Guardar tema
          </Button>
        </div>
      </div>

      {/* Selectores de imagen */}
      <MediaPicker
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        onPick={(url) => patch({ logoUrl: url })}
        currentUrl={candidate.logoUrl}
      />
      <MediaPicker
        open={faviconPickerOpen}
        onClose={() => setFaviconPickerOpen(false)}
        onPick={(url) => patch({ faviconUrl: url })}
        currentUrl={candidate.faviconUrl}
      />
    </div>
  );
}
