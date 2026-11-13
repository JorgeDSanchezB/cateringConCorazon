"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCursorList, useAdminMutation, useBodyMutation, useEndpointMutation } from "./data-hooks";
import { FormField, LoadMoreButton, LoadingBlock, ErrorBlock, ViewHeader } from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { ImageField, MediaPicker } from "./media-picker";

/**
 * Contenido editorial del sitio: carrusel de la portada (banners), testimonios
 * (flag) y FAQ. CRUD completo contra /api/admin/content/*, tablas virtualizadas
 * y claves estables por id.
 */

// ─────────────────────── Banners ───────────────────────

interface BannerRow {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
}

function BannersTab() {
  const list = useCursorList<BannerRow>("/api/admin/content/banners", { limit: 24 });
  const [editing, setEditing] = useState<BannerRow | "new" | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  const remove = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/content/banners/${id}`,
    {
      successMessage: "Banner eliminado.",
      invalidate: [["/api/admin/content/banners"], ["public-bootstrap"]],
    },
  );

  const columns: Column<BannerRow>[] = [
    {
      key: "title",
      header: "Título",
      render: (row) => <span className="font-medium">{row.title ?? "—"}</span>,
    },
    {
      key: "subtitle",
      header: "Subtítulo",
      render: (row) => <span className="text-muted-foreground">{row.subtitle ?? "—"}</span>,
    },
    {
      key: "image",
      header: "Imagen",
      width: "90px",
      align: "center",
      render: (row) =>
        row.imageUrl ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            Sí
          </Badge>
        ) : (
          <span className="text-muted-foreground">Sin imagen</span>
        ),
    },
    {
      key: "visible",
      header: "Visible",
      width: "90px",
      align: "center",
      render: (row) => (
        <Badge variant="outline" className={row.isVisible ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-zinc-100 text-zinc-700"}>
          {row.isVisible ? "Sí" : "No"}
        </Badge>
      ),
    },
    {
      key: "sortOrder",
      header: "Orden",
      width: "80px",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.sortOrder}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      width: "120px",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Editar banner" onClick={() => setEditing(row)}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                aria-label="Eliminar banner"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este banner?</AlertDialogTitle>
                <AlertDialogDescription>
                  «{row.title ?? "Sin título"}» desaparecerá del carrusel de la portada.
                  La eliminación es definitiva.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate(row.id)}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")} size="sm">
          <Plus className="size-4" aria-hidden /> Nueva imagen del carrusel
        </Button>
      </div>
      {list.isLoading ? (
        <LoadingBlock label="Cargando banners…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable rows={list.items} columns={columns} rowKey={(r) => r.id} emptyMessage="Sin banners todavía." />
          <LoadMoreButton onClick={list.loadMore} disabled={!list.hasMore} loading={list.isFetchingNextPage} />
        </>
      )}

      {editing !== null ? (
        <BannerDialog
          key={editing === "new" ? "new" : editing.id}
          banner={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function BannerDialog({ banner, onClose }: { banner: BannerRow | null; onClose: () => void }) {
  const [title, setTitle] = useState(banner?.title ?? "");
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(banner?.imageUrl ?? null);
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "#/catalogo");
  const [isVisible, setIsVisible] = useState(banner?.isVisible ?? true);
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [mediaOpen, setMediaOpen] = useState(false);

  const body = {
    title: title.trim() || null,
    subtitle: subtitle.trim() || null,
    imageUrl,
    linkUrl: linkUrl.trim() || null,
    isVisible,
    sortOrder: Number(sortOrder) || 0,
  };

  const create = useAdminMutation<BannerRow, typeof body>("POST", "/api/admin/content/banners", {
    successMessage: "Banner creado.",
    invalidate: [["/api/admin/content/banners"], ["public-bootstrap"]],
    onDone: onClose,
  });
  const update = useBodyMutation<BannerRow, { id: string; body: typeof body }>(
    "PATCH",
    (v) => `/api/admin/content/banners/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Banner actualizado.",
      invalidate: [["/api/admin/content/banners"], ["public-bootstrap"]],
      onDone: onClose,
    },
  );
  const mutation = banner ? update : create;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{banner ? "Editar banner" : "Nuevo banner"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Título">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Menú de temporada" />
          </FormField>
          <FormField label="Subtítulo">
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} />
          </FormField>
          <FormField label="Imagen" hint="Imagen de fondo de esta tarjeta del carrusel (portada, debajo del hero).">
            <ImageField url={imageUrl} onPick={setImageUrl} onOpen={() => setMediaOpen(true)} />
          </FormField>
          <FormField label="Enlace" hint="Ruta interna, ej: #/catalogo">
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={300} />
          </FormField>
          <div className="grid grid-cols-2 items-end gap-4">
            <FormField label="Orden">
              <Input type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="banner-visible" className="text-sm">Visible</Label>
              <Switch id="banner-visible" checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => (banner ? update.mutate({ id: banner.id, body }) : create.mutate(body))} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : banner ? "Guardar cambios" : "Crear banner"}
          </Button>
        </DialogFooter>
        <MediaPicker
          open={mediaOpen}
          onClose={() => setMediaOpen(false)}
          onPick={setImageUrl}
          currentUrl={imageUrl}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Testimonios ───────────────────────

interface TestimonialRow {
  id: string;
  customerName: string;
  text: string;
  rating: number;
  isVisible: boolean;
  sortOrder: number;
}

function TestimonialsTab() {
  const bootstrap = useBootstrapData();
  const testimonialsEnabled = bootstrap?.flags.testimonials_enabled ?? false;
  const list = useCursorList<TestimonialRow>("/api/admin/content/testimonials", { limit: 24 });
  const [editing, setEditing] = useState<TestimonialRow | "new" | null>(null);

  const remove = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/content/testimonials/${id}`,
    {
      successMessage: "Testimonio eliminado.",
      invalidate: [["/api/admin/content/testimonials"], ["public-bootstrap"]],
    },
  );

  const columns: Column<TestimonialRow>[] = [
    {
      key: "customerName",
      header: "Cliente",
      render: (row) => <span className="font-medium">{row.customerName}</span>,
    },
    {
      key: "text",
      header: "Testimonio",
      render: (row) => <span className="text-muted-foreground">{row.text}</span>,
    },
    {
      key: "rating",
      header: "Valoración",
      width: "100px",
      align: "center",
      render: (row) => (
        <Badge variant="outline">{row.rating} ★</Badge>
      ),
    },
    {
      key: "visible",
      header: "Visible",
      width: "90px",
      align: "center",
      render: (row) => (
        <Badge variant="outline" className={row.isVisible ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-zinc-100 text-zinc-700"}>
          {row.isVisible ? "Sí" : "No"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      width: "120px",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Editar testimonio" onClick={() => setEditing(row)}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Eliminar testimonio">
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar el testimonio de {row.customerName}?</AlertDialogTitle>
                <AlertDialogDescription>La eliminación es definitiva.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate(row.id)}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {!testimonialsEnabled ? (
        <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          Los testimonios están gestionados aquí, pero el bloque de la portada está
          apagado (flag <code>testimonials_enabled</code> en el módulo Flags).
        </p>
      ) : null}

      {list.isLoading ? (
        <LoadingBlock label="Cargando testimonios…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable rows={list.items} columns={columns} rowKey={(r) => r.id} emptyMessage="Sin testimonios todavía." />
          <LoadMoreButton onClick={list.loadMore} disabled={!list.hasMore} loading={list.isFetchingNextPage} />
        </>
      )}

      {editing !== null ? (
        <TestimonialDialog
          key={editing === "new" ? "new" : editing.id}
          testimonial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TestimonialDialog({ testimonial, onClose }: { testimonial: TestimonialRow | null; onClose: () => void }) {
  const [customerName, setCustomerName] = useState(testimonial?.customerName ?? "");
  const [text, setText] = useState(testimonial?.text ?? "");
  const [rating, setRating] = useState(String(testimonial?.rating ?? 5));
  const [isVisible, setIsVisible] = useState(testimonial?.isVisible ?? true);
  const [sortOrder, setSortOrder] = useState(String(testimonial?.sortOrder ?? 0));

  const body = {
    customerName: customerName.trim(),
    text: text.trim(),
    rating: Number(rating) || 5,
    isVisible,
    sortOrder: Number(sortOrder) || 0,
  };

  const create = useAdminMutation<TestimonialRow, typeof body>("POST", "/api/admin/content/testimonials", {
    successMessage: "Testimonio creado.",
    invalidate: [["/api/admin/content/testimonials"], ["public-bootstrap"]],
    onDone: onClose,
  });
  const update = useBodyMutation<TestimonialRow, { id: string; body: typeof body }>(
    "PATCH",
    (v) => `/api/admin/content/testimonials/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Testimonio actualizado.",
      invalidate: [["/api/admin/content/testimonials"], ["public-bootstrap"]],
      onDone: onClose,
    },
  );
  const mutation = testimonial ? update : create;

  function fieldError(field: string): string | null {
    return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{testimonial ? `Editar testimonio de ${testimonial.customerName}` : "Nuevo testimonio"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Nombre del cliente" required error={fieldError("customerName")}>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80} />
          </FormField>
          <FormField label="Testimonio" required error={fieldError("text")} hint="Entre 10 y 600 caracteres.">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={4} />
          </FormField>
          <div className="grid grid-cols-3 items-end gap-4">
            <FormField label="Valoración" error={fieldError("rating")}>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger aria-label="Valoración">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <SelectItem key={value} value={String(value)}>{value} estrella(s)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Orden">
              <Input type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="testimonial-visible" className="text-sm">Visible</Label>
              <Switch id="testimonial-visible" checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => (testimonial ? update.mutate({ id: testimonial.id, body }) : create.mutate(body))}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Guardando…" : testimonial ? "Guardar cambios" : "Crear testimonio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── FAQ ───────────────────────

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  isVisible: boolean;
  sortOrder: number;
}

function FaqsTab() {
  const list = useCursorList<FaqRow>("/api/admin/content/faqs", { limit: 30 });
  const [editing, setEditing] = useState<FaqRow | "new" | null>(null);

  const remove = useEndpointMutation<{ ok: boolean }, string>(
    "DELETE",
    (id) => `/api/admin/content/faqs/${id}`,
    {
      successMessage: "Pregunta eliminada.",
      invalidate: [["/api/admin/content/faqs"], ["public-bootstrap"]],
    },
  );

  const columns: Column<FaqRow>[] = [
    {
      key: "question",
      header: "Pregunta",
      render: (row) => <span className="font-medium">{row.question}</span>,
    },
    {
      key: "answer",
      header: "Respuesta",
      render: (row) => <span className="text-muted-foreground">{row.answer.slice(0, 80)}{row.answer.length > 80 ? "…" : ""}</span>,
    },
    {
      key: "visible",
      header: "Visible",
      width: "90px",
      align: "center",
      render: (row) => (
        <Badge variant="outline" className={row.isVisible ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-zinc-100 text-zinc-700"}>
          {row.isVisible ? "Sí" : "No"}
        </Badge>
      ),
    },
    {
      key: "sortOrder",
      header: "Orden",
      width: "80px",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.sortOrder}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      width: "120px",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Editar pregunta" onClick={() => setEditing(row)}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Eliminar pregunta">
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta pregunta?</AlertDialogTitle>
                <AlertDialogDescription>«{row.question}» dejará de mostrarse en la web.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate(row.id)}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {list.isLoading ? (
        <LoadingBlock label="Cargando preguntas…" />
      ) : list.isError ? (
        <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <VirtualTable rows={list.items} columns={columns} rowKey={(r) => r.id} emptyMessage="Sin preguntas todavía." />
          <LoadMoreButton onClick={list.loadMore} disabled={!list.hasMore} loading={list.isFetchingNextPage} />
        </>
      )}

      {editing !== null ? (
        <FaqDialog
          key={editing === "new" ? "new" : editing.id}
          faq={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function FaqDialog({ faq, onClose }: { faq: FaqRow | null; onClose: () => void }) {
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [isVisible, setIsVisible] = useState(faq?.isVisible ?? true);
  const [sortOrder, setSortOrder] = useState(String(faq?.sortOrder ?? 0));

  const body = {
    question: question.trim(),
    answer: answer.trim(),
    isVisible,
    sortOrder: Number(sortOrder) || 0,
  };

  const create = useAdminMutation<FaqRow, typeof body>("POST", "/api/admin/content/faqs", {
    successMessage: "Pregunta creada.",
    invalidate: [["/api/admin/content/faqs"], ["public-bootstrap"]],
    onDone: onClose,
  });
  const update = useBodyMutation<FaqRow, { id: string; body: typeof body }>(
    "PATCH",
    (v) => `/api/admin/content/faqs/${v.id}`,
    (v) => v.body,
    {
      successMessage: "Pregunta actualizada.",
      invalidate: [["/api/admin/content/faqs"], ["public-bootstrap"]],
      onDone: onClose,
    },
  );
  const mutation = faq ? update : create;

  function fieldError(field: string): string | null {
    return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{faq ? "Editar pregunta" : "Nueva pregunta frecuente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Pregunta" required error={fieldError("question")}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} />
          </FormField>
          <FormField label="Respuesta" required error={fieldError("answer")}>
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1500} rows={4} />
          </FormField>
          <div className="grid grid-cols-2 items-end gap-4">
            <FormField label="Orden">
              <Input type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </FormField>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="faq-visible" className="text-sm">Visible</Label>
              <Switch id="faq-visible" checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => (faq ? update.mutate({ id: faq.id, body }) : create.mutate(body))} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : faq ? "Guardar cambios" : "Crear pregunta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Vista con pestañas ───────────────────────

export default function ContentView() {
  const [tab, setTab] = useState("banners");

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Contenido"
        description="Carrusel de imágenes de la portada (la sección que rota debajo del hero), testimonios (flag) y preguntas frecuentes. Todo editable sin tocar código."
      />

      <Tabs value={tab} onValueChange={setTab} aria-label="Tipo de contenido">
        <TabsList>
          <TabsTrigger value="banners">Carrusel de portada</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonios</TabsTrigger>
          <TabsTrigger value="faqs">Preguntas frecuentes</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "banners" ? <BannersTab /> : tab === "testimonials" ? <TestimonialsTab /> : <FaqsTab />}
    </div>
  );
}
