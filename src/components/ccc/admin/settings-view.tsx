"use client";

import { useState } from "react";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { useAdminMutation, useDetail } from "@/components/ccc/admin/data-hooks";
import {
  ErrorBlock,
  FormField,
  LoadingBlock,
  MoneyInput,
  ViewHeader,
} from "@/components/ccc/admin/ui-bits";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";

// Respuesta de GET /api/admin/settings.
interface SettingDef {
  key: string;
  label: string;
  group: string;
  value: string;
  default: string;
  type: "text" | "multiline" | "number" | "money";
}

interface SettingsResponse {
  defs: SettingDef[];
  values: Record<string, string | number>;
  problems: { key: string; message: string }[];
}

/** Orden y títulos de los grupos de ajustes. */
const GROUP_ORDER = ["marca", "hero", "seo", "negocio", "sistema", "legal"];
const GROUP_LABELS: Record<string, string> = {
  marca: "Marca",
  hero: "Portada (hero)",
  seo: "SEO",
  negocio: "Negocio",
  sistema: "Sistema",
  legal: "Legal",
};

function snakeToCamel(k: string): string {
  return k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

export default function SettingsView() {
  const fmt = useSiteFormat();
  const { data, isLoading, isError, error, refetch } = useDetail<SettingsResponse>("/api/admin/settings");

  // Inicializa el borrador con los valores EFECTIVOS (values, ya validados):
  // ajuste de estado DURANTE el render (patrón React sin efectos).
  const [draft, setDraft] = useState<Record<string, string | number | null> | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  if (data && draft === null) {
    const next: Record<string, string | number | null> = {};
    for (const def of data.defs) {
      const v = data.values[snakeToCamel(def.key)];
      if (def.type === "money") {
        next[def.key] = typeof v === "number" ? v : Number(v ?? 0);
      } else {
        next[def.key] = v === undefined || v === null ? "" : String(v);
      }
    }
    setDraft(next);
  }

  const saveSettings = useAdminMutation<SettingsResponse, Record<string, string | number>>(
    "PUT",
    "/api/admin/settings",
    {
      successMessage: "Ajustes guardados.",
      invalidate: [["public-bootstrap"], ["/api/admin/settings"]],
      onDone: () => setLocalErrors({}),
    },
  );

  if (isLoading) return <LoadingBlock label="Cargando ajustes…" />;
  if (isError || !data) {
    return (
      <ErrorBlock
        message={error instanceof Error ? error.message : "No se pudo cargar la configuración."}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!draft) return <LoadingBlock label="Preparando formulario…" />;

  /** Valor efectivo original del def (desde values, camelCase). */
  const originalValue = (def: SettingDef): string | number => {
    const v = data.values[snakeToCamel(def.key)];
    if (def.type === "money" || def.type === "number") {
      return typeof v === "number" ? v : Number(v ?? 0);
    }
    return v === undefined || v === null ? "" : String(v);
  };

  const isModified = (def: SettingDef): boolean => {
    const cur = draft[def.key];
    const orig = originalValue(def);
    if (def.type === "money") return typeof cur === "number" ? cur !== orig : true;
    return String(cur ?? "") !== String(orig ?? "");
  };

  const modifiedDefs = data.defs.filter(isModified);

  const setField = (key: string, value: string | number | null) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const submit = () => {
    const body: Record<string, string | number> = {};
    const invalid: Record<string, string> = {};
    for (const def of data.defs) {
      if (!isModified(def)) continue;
      const cur = draft[def.key];
      if (def.type === "money") {
        if (typeof cur === "number" && Number.isInteger(cur) && cur >= 0) {
          body[def.key] = cur;
        } else {
          invalid[def.key] = "Indique un monto válido en dólares.";
        }
      } else if (def.type === "number") {
        const n = Number(cur);
        if (String(cur ?? "").trim() !== "" && !Number.isNaN(n)) {
          body[def.key] = n;
        } else {
          invalid[def.key] = "Indique un número válido.";
        }
      } else {
        body[def.key] = String(cur ?? "");
      }
    }
    setLocalErrors(invalid);
    if (Object.keys(invalid).length === 0 && Object.keys(body).length > 0) {
      saveSettings.mutate(body);
    }
  };

  const fieldError = (def: SettingDef): string | null => {
    if (saveSettings.error instanceof ApiError) {
      const msg = saveSettings.error.fieldMessage(def.key);
      if (msg) return msg;
    }
    return localErrors[def.key] ?? null;
  };

  const defaultHint = (def: SettingDef): string =>
    def.type === "money"
      ? `Por defecto: ${fmt.money(Number(def.default) || 0)}`
      : `Por defecto: ${def.default}`;

  const groups = GROUP_ORDER.filter((g) => data.defs.some((d) => d.group === g));

  return (
    <div className="space-y-6 pb-2">
      <ViewHeader
        title="Ajustes del sitio"
        description="Textos públicos, SEO, moneda, impuestos y numeración. Se guardan solo los campos modificados."
      />

      {/* Problemas de configuración detectados en BD */}
      {data.problems.length > 0 ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle aria-hidden />
          <AlertTitle>Configuración con valores inválidos en BD</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            <ul className="list-disc pl-4">
              {data.problems.map((p) => (
                <li key={p.key}>{p.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Grupos de ajustes en dos columnas */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group} className={group === "marca" ? "lg:col-span-2" : ""}>
            <CardHeader>
              <CardTitle className="text-base">{GROUP_LABELS[group] ?? group}</CardTitle>
              <CardDescription>
                {data.defs.filter((d) => d.group === group).length} ajuste(s) del grupo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.defs
                .filter((d) => d.group === group)
                .map((def) => (
                  <FormField key={def.key} label={def.label} error={fieldError(def)} hint={defaultHint(def)}>
                    {def.type === "multiline" ? (
                      <Textarea
                        rows={4}
                        value={String(draft[def.key] ?? "")}
                        onChange={(e) => setField(def.key, e.target.value)}
                      />
                    ) : def.type === "money" ? (
                      <MoneyInput
                        cents={typeof draft[def.key] === "number" ? (draft[def.key] as number) : null}
                        onCentsChange={(cents) => setField(def.key, cents)}
                      />
                    ) : def.type === "number" ? (
                      <Input
                        type="number"
                        value={String(draft[def.key] ?? "")}
                        onChange={(e) => setField(def.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        value={String(draft[def.key] ?? "")}
                        onChange={(e) => setField(def.key, e.target.value)}
                      />
                    )}
                  </FormField>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Barra sticky de guardado */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {modifiedDefs.length === 0
            ? "Sin cambios pendientes."
            : `${modifiedDefs.length} campo(s) modificado(s): ${modifiedDefs.map((d) => d.label).join(", ")}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={saveSettings.isPending || modifiedDefs.length === 0}
            onClick={() => {
              const next: Record<string, string | number | null> = {};
              for (const def of data.defs) {
                const v = data.values[snakeToCamel(def.key)];
                if (def.type === "money") next[def.key] = typeof v === "number" ? v : Number(v ?? 0);
                else next[def.key] = v === undefined || v === null ? "" : String(v);
              }
              setDraft(next);
              setLocalErrors({});
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Descartar cambios
          </Button>
          <Button onClick={submit} disabled={saveSettings.isPending || modifiedDefs.length === 0}>
            <Save className="size-4" aria-hidden />
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
