"use client";

import { CalendarCheck, CalendarDays, MapPin, MessageCircle, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCursorList } from "@/components/ccc/admin/data-hooks";
import { useBootstrapData, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { apiErrorMessage } from "@/components/ccc/shared/api-client";
import { ErrorBlock, EmptyBlock } from "@/components/ccc/admin/ui-bits";
import { PageContainer, SectionHeading } from "./ui";

interface PublicEvent {
  id: string;
  name: string;
  eventDate: string;
  location: string;
}

/**
 * Eventos: explica el modelo de negocio (reserva previa + venta en evento)
 * y lista los próximos eventos públicos. El mínimo por evento viene de
 * SiteSetting (nunca hardcodeado).
 */
export function EventsView() {
  const bootstrap = useBootstrapData();
  const { money, date } = useSiteFormat();
  const settings = bootstrap?.settings;
  const wa = bootstrap?.whatsapp;
  const list = useCursorList<PublicEvent>("/api/public/events", { limit: 10 });

  return (
    <PageContainer>
      <div className="space-y-12">
        <header className="space-y-2 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Catering para tu evento
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Nos montamos donde celebras: fiestas, quinceañeras, reuniones
            empresariales y cualquier ocasión para bailar y comer. Sin entregas a
            domicilio — el sabor llega al evento.
          </p>
        </header>

        <section aria-labelledby="como-funciona">
          <SectionHeading
            id="como-funciona"
            title="Cómo funciona"
            description="Dos formas de disfrutar nuestro catering, pensadas para tu celebración."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <article className="space-y-3 rounded-xl border bg-card p-6 text-card-foreground theme-shadow">
              <CalendarCheck className="size-8 text-primary" aria-hidden="true" />
              <h3 className="font-heading text-lg font-semibold">Reserva previa</h3>
              <p className="text-sm text-muted-foreground">
                Arma tu pedido en la web, aplícalo con un código de descuento si
                tienes uno y envíalo por WhatsApp con el resumen completo.
                Confirmamos fecha, lugar y detalle por el mismo chat.
              </p>
              <p className="text-sm font-medium">
                Venta mínima por evento: {money(settings?.globalMinOrderCents ?? 0)}
              </p>
            </article>
            <article className="space-y-3 rounded-xl border bg-card p-6 text-card-foreground theme-shadow">
              <Store className="size-8 text-primary" aria-hidden="true" />
              <h3 className="font-heading text-lg font-semibold">Venta directa en el evento</h3>
              <p className="text-sm text-muted-foreground">
                El día del evento montamos la mesa de catering y nuestro staff
                atiende la venta en el sitio. ¿Se acaba algo? Lo reponemos desde
                el inventario en tiempo real.
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby="proximos-eventos">
          <SectionHeading
            id="proximos-eventos"
            title="Próximos eventos"
            description="Agenda pública de las fechas ya reservadas."
          />
          {list.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl border bg-muted/50" aria-hidden="true" />
              ))}
            </div>
          ) : list.isError ? (
            <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : list.items.length === 0 ? (
            <EmptyBlock message="No hay eventos próximos publicados. ¡El calendario está abierto!" />
          ) : (
            <ul className="space-y-3">
              {list.items.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground theme-shadow sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarDays className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-semibold">{event.name}</p>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                        {event.location}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-medium tabular-nums text-muted-foreground sm:text-right">
                    {date(event.eventDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="cta-reserva"
          className="rounded-2xl bg-primary p-8 text-center text-primary-foreground sm:p-10"
        >
          <h2 id="cta-reserva" className="font-heading text-2xl font-bold sm:text-3xl">
            ¿Tu fecha todavía está libre?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-primary-foreground/90 sm:text-base">
            Escríbenos por WhatsApp y coordinamos el menú perfecto para tu
            celebración.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {wa?.available && wa.waUrl ? (
              <Button
                asChild
                size="lg"
                className="bg-[#25D366] text-[#05231A] hover:bg-[#1eb759]"
              >
                <a href={wa.waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  {wa.buttonLabel}
                </a>
              </Button>
            ) : null}
            <Button asChild size="lg" variant="secondary" aria-label="Ir al catálogo para armar el pedido">
              <a href="#/catalogo">Armar mi pedido</a>
            </Button>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
