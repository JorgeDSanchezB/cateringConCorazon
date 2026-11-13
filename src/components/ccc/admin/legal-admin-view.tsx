"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileText, EyeOff, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { FormField, LoadingBlock, ErrorBlock, ViewHeader } from "./ui-bits";

/**
 * Editor de páginas legales (privacidad, cookies, términos, aviso legal).
 * - Disclaimer global visible (obligatorio antes de publicar).
 * - Cada página tiene su propio interruptor de activar/desactivar
 *   (PATCH /api/admin/legal/:slug): desactivada desaparece del pie y de
 *   la web pública; el contenido se conserva y sigue editable.
 * - Borrador asistido por IA (endpoint /api/admin/ai/draft con z-ai-web-dev-sdk,
 *   ejecutado 100% en backend) — el texto generado SIEMPRE se marca como
 *   borrador revisable; no sustituye asesoría legal.
 */

interface LegalListResponse {
  items: { slug: string; title: string; isActive: boolean; updatedAt: string }[];
}

interface LegalDetailResponse {
  page: { slug: string; title: string; content: string; isActive: boolean; updatedAt: string };
  disclaimer: string;
}

export default function LegalAdminView() {
  const queryClient = useQueryClient();
  const { datetime } = useSiteFormat();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const list = useQuery<LegalListResponse>({
    queryKey: ["/api/admin/legal"],
    queryFn: () => api<LegalListResponse>("/api/admin/legal"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedSlug && list.data?.items.length) {
      setSelectedSlug(list.data.items[0]!.slug);
    }
  }, [list.data, selectedSlug]);

  const detail = useQuery<LegalDetailResponse>({
    queryKey: [`/api/admin/legal/${selectedSlug}`],
    queryFn: () => api<LegalDetailResponse>(`/api/admin/legal/${selectedSlug}`),
    enabled: selectedSlug !== null,
    staleTime: 10_000,
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // Slug cuyo interruptor está en vuelo (evita toggles concurrentes).
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  // Sincroniza el editor cuando cambia la página seleccionada o el servidor.
  useEffect(() => {
    if (detail.data && detail.data.page.slug !== loadedSlug) {
      setTitle(detail.data.page.title);
      setContent(detail.data.page.content);
      setLoadedSlug(detail.data.page.slug);
    }
  }, [detail.data, loadedSlug]);

  /**
   * Activar/desactivar una página legal:
   * 1) cambio optimista en la caché de la lista (pinta al instante),
   * 2) PATCH al servidor, 3) rollback si falla (Regla 4: nunca dejar
   * un estado visual distinto del real).
   */
  async function handleToggle(slug: string, pageTitle: string, next: boolean) {
    if (togglingSlug !== null) return;
    setTogglingSlug(slug);
    const previous = queryClient.getQueryData<LegalListResponse>(["/api/admin/legal"]);
    queryClient.setQueryData<LegalListResponse>(["/api/admin/legal"], (old) =>
      old
        ? { items: old.items.map((it) => (it.slug === slug ? { ...it, isActive: next } : it)) }
        : old,
    );
    try {
      await api(`/api/admin/legal/${slug}`, {
        method: "PATCH",
        retry: false,
        body: { isActive: next },
      });
      toast.success(
        next
          ? `«${pageTitle}» publicada en la web pública.`
          : `«${pageTitle}» oculta para el público (el texto se conserva).`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/legal"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/admin/legal/${slug}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/public/legal/${slug}`] }),
        queryClient.invalidateQueries({ queryKey: ["public-bootstrap"] }),
      ]);
    } catch (err) {
      // Rollback: la caché vuelve al estado real del servidor.
      queryClient.setQueryData<LegalListResponse>(["/api/admin/legal"], previous ?? undefined);
      toast.error(apiErrorMessage(err));
    } finally {
      setTogglingSlug(null);
    }
  }

  async function handleSave() {
    if (!selectedSlug) return;
    setSaving(true);
    try {
      await api(`/api/admin/legal/${selectedSlug}`, {
        method: "PUT",
        retry: false,
        body: { title: title.trim(), content: content.trim() },
      });
      toast.success("Página legal guardada");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/legal"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/legal/${selectedSlug}`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/public/legal/${selectedSlug}`] });
      // Clave real del hook de bootstrap público (pie de página con títulos).
      await queryClient.invalidateQueries({ queryKey: ["public-bootstrap"] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDraft() {
    if (!selectedSlug) return;
    setDrafting(true);
    try {
      const result = await api<{ text: string }>("/api/admin/ai/draft", {
        method: "POST",
        retry: false,
        body: {
          kind: "legal",
          slug: selectedSlug,
          currentTitle: title.trim() || undefined,
        },
      });
      if (result.text.trim().length < 50) {
        throw new Error("El borrador generado es demasiado corto; revisa el prompt e inténtalo de nuevo.");
      }
      const confirmed = window.confirm(
        "Se reemplazará el contenido actual del editor con el borrador de la IA " +
          "(no se guarda en la base de datos hasta que pulses «Guardar página»). ¿Continuar?",
      );
      if (confirmed) {
        setContent(result.text);
        toast.success("Borrador cargado en el editor — revísalo antes de guardar.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Páginas legales"
        description="Plantillas completas editables de la web pública: privacidad, cookies, términos y aviso legal. Cada página se publica u oculta con su propio interruptor."
      />

      <aside
        role="note"
        className="flex gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-relaxed">
          {detail.data?.disclaimer ??
            "Las plantillas legales son borradores generados automáticamente y no constituyen asesoría legal. Revísalas con un abogado colegiado en Ecuador antes de publicar."}
        </p>
      </aside>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-3">
          <nav aria-label="Páginas legales" className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Interruptor = publicar u ocultar en la web (el contenido nunca se pierde).
            </p>
            {list.isLoading ? (
              <LoadingBlock label="Cargando páginas…" />
            ) : list.isError ? (
              <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
            ) : (
              list.data?.items.map((item) => {
                const selected = selectedSlug === item.slug;
                return (
                  <div
                    key={item.slug}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      selected
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    } ${item.isActive ? "" : "opacity-70"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlug(item.slug);
                        setLoadedSlug(null);
                      }}
                      aria-current={selected ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {item.isActive ? (
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">{item.title}</span>
                        <span
                          className={`text-[11px] ${
                            item.isActive ? "text-emerald-700" : "text-muted-foreground"
                          }`}
                        >
                          {item.isActive ? "Publicada" : "Oculta"}
                        </span>
                      </span>
                    </button>
                    <Switch
                      checked={item.isActive}
                      disabled={togglingSlug !== null}
                      onCheckedChange={(v) => void handleToggle(item.slug, item.title, v)}
                      aria-label={`Activar o desactivar la página legal «${item.title}»`}
                      title={item.isActive ? "Desactivar (ocultar de la web)" : "Activar (publicar en la web)"}
                    />
                  </div>
                );
              })
            )}
          </nav>
        </div>

        <section aria-label="Editor de la página legal" className="space-y-4">
          {detail.isLoading ? (
            <LoadingBlock label="Cargando editor…" />
          ) : detail.isError ? (
            <ErrorBlock message={apiErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
          ) : selectedSlug && loadedSlug === selectedSlug ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={detail.data?.page.isActive ? "default" : "outline"}
                    className="whitespace-nowrap"
                  >
                    {detail.data?.page.isActive ? "Publicada en la web" : "Oculta para el público"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Actualizada: {datetime(detail.data?.page.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleDraft} disabled={drafting}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    {drafting ? "Generando borrador…" : "Generar borrador con IA"}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="size-4" aria-hidden="true" />
                    {saving ? "Guardando…" : "Guardar página"}
                  </Button>
                </div>
              </div>

              <FormField label="Título" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </FormField>

              <div className="space-y-1.5">
                <Label htmlFor="legal-content" className="text-xs font-medium text-muted-foreground">
                  Contenido (Markdown: ## títulos, listas, **negritas**)
                </Label>
                <Textarea
                  id="legal-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={24}
                  className="font-mono text-xs leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">
                  {content.length} caracteres · mínimo 50 requeridos por el servidor.
                </p>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
