"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Upload, Trash2, Check, ImageIcon } from "lucide-react";
import { api, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useCursorList, useEndpointMutation } from "./data-hooks";
import { EmptyBlock, LoadingBlock } from "./ui-bits";

interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  alt: string | null;
}

/**
 * Selector de imagen para formularios admin:
 * galería paginada por cursor + subida local (public/uploads) + URL manual.
 * Devuelve la URL elegida (ruta relativa /uploads/... o /images/...).
 */
export function MediaPicker({
  open,
  onClose,
  onPick,
  currentUrl,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string | null) => void;
  currentUrl?: string | null;
}) {
  const queryClient = useQueryClient();
  const [manualUrl, setManualUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const list = useCursorList<MediaAsset>("/api/admin/media");
  const remove = useEndpointMutation<{ ok: boolean }, string>("DELETE", (id) => `/api/admin/media/${id}`, {
    successMessage: "Medio eliminado.",
    invalidate: [["/api/admin/media"]],
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const asset = await api<MediaAsset>("/api/admin/media", { method: "POST", body: form, retry: false });
      toast.success("Imagen subida.");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/media"] });
      onPick(asset.url);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seleccionar imagen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="media-upload" className="sr-only">
              Subir imagen
            </Label>
            <input
              id="media-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("media-upload")?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              Subir imagen (PNG/JPG/WebP, máx 5 MB)
            </Button>
            {currentUrl ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onPick(null);
                  onClose();
                }}
              >
                Quitar imagen
              </Button>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">O pegue una URL de imagen</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://… o /images/foto.jpg"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={manualUrl.trim() === ""}
                onClick={() => {
                  onPick(manualUrl.trim());
                  onClose();
                }}
              >
                <Check className="size-4" aria-hidden /> Usar
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Galería</p>
            {list.isLoading ? (
              <LoadingBlock />
            ) : list.isError ? (
              <EmptyBlock message="No se pudo cargar la galería." />
            ) : list.items.length === 0 ? (
              <EmptyBlock message="Todavía no hay imágenes subidas." />
            ) : (
              <ScrollArea className="h-64 rounded-lg border p-2">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {list.items.map((asset) => (
                    <div key={asset.id} className="group relative overflow-hidden rounded-md border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.alt ?? asset.filename}
                        className="aspect-square w-full cursor-pointer object-cover transition group-hover:scale-105"
                        onClick={() => {
                          onPick(asset.url);
                          onClose();
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Eliminar ${asset.filename}`}
                        className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => remove.mutate(asset.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                {list.hasMore ? (
                  <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={list.loadMore}>
                    Cargar más
                  </Button>
                ) : null}
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Miniatura con acción de cambiar/quitar para formularios. */
export function ImageField({
  url,
  onPick,
  onOpen,
}: {
  url: string | null;
  onPick: (url: string | null) => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/40 transition hover:border-primary"
        aria-label="Cambiar imagen"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Imagen seleccionada" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
        )}
      </button>
      <div className="flex flex-col gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          Elegir imagen
        </Button>
        {url ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
