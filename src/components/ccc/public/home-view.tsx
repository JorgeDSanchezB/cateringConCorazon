"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  MessageCircle,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useBootstrapData, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { useCursorList } from "@/components/ccc/admin/data-hooks";
import { hashHref } from "@/components/ccc/shared/hash-router";
import { ProductCard, type PublicProduct } from "./product-card";
import { ComboCard, type PublicCombo } from "./combo-card";
import { PageContainer, SectionHeading, StarRating } from "./ui";

 

const BANNER_INTERVAL_MS = 6000;

function HeroBanner({
  imageUrl,
  title,
  subtitle,
}: {
  imageUrl: string | null;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-primary/30" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-2xl space-y-5"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-card/15 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
            <UtensilsCrossed className="size-4" aria-hidden="true" />
            Catering para eventos privados
          </span>
          <h1 className="font-heading text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="max-w-xl text-base text-white/90 sm:text-lg">{subtitle}</p>
        </motion.div>
      </div>
    </section>
  );
}

function BannerCarousel({
  banners,
}: {
  banners: { id: string; title: string | null; subtitle: string | null; imageUrl: string | null; linkUrl: string | null }[];
}) {
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), BANNER_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count]);

  if (count === 0) return null;
  const banner = banners[index]!;

  return (
    <section aria-label="Novedades del catering" className="relative isolate overflow-hidden rounded-2xl border theme-shadow">
      <div className="relative aspect-[21/9] w-full sm:aspect-[21/7]">
        {banners.map((b, i) => (
          <div
            key={b.id}
            className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
            aria-hidden={i !== index}
          >
            {b.imageUrl ? (
              <img src={b.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="size-full bg-muted" />
            )}
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/25 to-transparent" />
        <AnimatePresence mode="wait">
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 p-5 sm:p-7"
          >
            {banner.title ? (
              <p className="font-heading text-xl font-bold text-white sm:text-2xl">{banner.title}</p>
            ) : null}
            {banner.subtitle ? (
              <p className="max-w-xl text-sm text-white/90 sm:text-base">{banner.subtitle}</p>
            ) : null}
            {banner.linkUrl ? (
              <a
                href={banner.linkUrl}
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-4 hover:underline"
              >
                Ver más <ChevronRight className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
      {count > 1 ? (
        <div className="absolute right-4 top-4 flex gap-1.5" role="tablist" aria-label="Seleccionar banner">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Banner ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`size-2 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/50"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function HomeView({ navigate }: { navigate: (to: string) => void }) {
  const bootstrap = useBootstrapData();
  const { money } = useSiteFormat();
  const settings = bootstrap?.settings;
  const flags = bootstrap?.flags;

  const featured = useCursorList<PublicProduct>("/api/public/catalog", {
    featured: "true",
    limit: 8,
  });
  const combos = useCursorList<PublicCombo>("/api/public/combos", { limit: 6 });

  const wa = bootstrap?.whatsapp;
  const minOrder = settings?.globalMinOrderCents ?? 0;
  const aboutParagraphs = (settings?.aboutText ?? "").split("\n\n").filter((p) => p.trim() !== "");
  const faqPreview = (bootstrap?.faqs ?? []).slice(0, 4);

  return (
    <>
      <HeroBanner
        imageUrl="/images/hero.png"
        title={settings?.heroTitle ?? ""}
        subtitle={settings?.heroSubtitle ?? ""}
      />

      <PageContainer>
        <div className="space-y-16">
          {bootstrap?.banners?.length ? <BannerCarousel banners={bootstrap.banners} /> : null}

          {/* Destacados */}
          {featured.items.length > 0 ? (
            <section aria-labelledby="destacados">
              <SectionHeading
                id="destacados"
                title="Los favoritos de la casa"
                description="Nuestros imperdibles, preparados el mismo día de tu evento con ingredientes frescos."
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <div className="mt-6 text-center">
                <Button asChild variant="outline" size="lg">
                  <a href={hashHref("catalogo")} onClick={(e) => { e.preventDefault(); navigate("catalogo"); }}>
                    {settings?.heroCtaPrimary ?? "Ver el menú"}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </section>
          ) : null}

          {/* Combos (módulo conmutado por flag) */}
          {flags?.combos_enabled && combos.items.length > 0 ? (
            <section aria-labelledby="combos">
              <SectionHeading
                id="combos"
                title="Combos para celebrar"
                description="Precios especiales por combo: tu fiesta completa en un clic."
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {combos.items.map((combo) => (
                  <ComboCard key={combo.id} combo={combo} />
                ))}
              </div>
              <div className="mt-6 text-center">
                <Button asChild variant="ghost">
                  <a href={hashHref("combos")} onClick={(e) => { e.preventDefault(); navigate("combos"); }}>
                    Ver todos los combos <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </section>
          ) : null}

          {/* Sobre nosotros */}
          <section aria-labelledby="nosotros" className="grid items-center gap-8 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border theme-shadow">
              <img
                src="/images/combo-fiesta.png"
                alt={`Mesa de catering de ${settings?.brandName ?? "catering"}`}
                className="aspect-[4/3] size-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="space-y-4">
              <h2 id="nosotros" className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                {settings?.aboutTitle ?? ""}
              </h2>
              {aboutParagraphs.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {paragraph}
                </p>
              ))}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild>
                  <a href={hashHref("eventos")} onClick={(e) => { e.preventDefault(); navigate("eventos"); }}>
                    <CalendarCheck className="size-4" aria-hidden="true" />
                    Cómo reservar
                  </a>
                </Button>
                {wa?.available && wa.waUrl ? (
                  <Button asChild variant="outline" className="border-[#25D366] text-[#128C46] hover:bg-[#25D366]/10">
                    <a href={wa.waUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-4" aria-hidden="true" />
                      {wa.buttonLabel}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          {/* Testimonios (flag testimonials_enabled) */}
          {flags?.testimonials_enabled && (bootstrap?.testimonials?.length ?? 0) > 0 ? (
            <section aria-labelledby="testimonios">
              <SectionHeading
                id="testimonios"
                title="Lo que dicen nuestros clientes"
                description="Celebraciones que confiaron en nuestro catering."
              />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(bootstrap?.testimonials ?? []).map((t) => (
                  <figure
                    key={t.id}
                    className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground theme-shadow"
                  >
                    <StarRating rating={t.rating} label={`Valoración de ${t.customerName}`} />
                    <blockquote className="text-sm leading-relaxed text-muted-foreground">
                      “{t.text}”
                    </blockquote>
                    <figcaption className="mt-auto text-sm font-semibold">{t.customerName}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {/* FAQ resumen */}
          {faqPreview.length > 0 ? (
            <section aria-labelledby="faq-preview">
              <SectionHeading
                id="faq-preview"
                title="Preguntas frecuentes"
                description="Las dudas más comunes al contratar el catering."
              />
              <Accordion type="single" collapsible className="mx-auto max-w-3xl">
                {faqPreview.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id}>
                    <AccordionTrigger className="text-left text-sm font-medium sm:text-base">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="mt-6 text-center">
                <Button asChild variant="ghost">
                  <a href={hashHref("faq")} onClick={(e) => { e.preventDefault(); navigate("faq"); }}>
                    Ver todas las preguntas <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </section>
          ) : null}

          {/* Banda CTA de eventos */}
          <section
            aria-labelledby="cta-evento"
            className="overflow-hidden rounded-2xl bg-primary p-8 text-primary-foreground sm:p-12"
          >
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl space-y-2">
                <h2 id="cta-evento" className="font-heading text-2xl font-bold sm:text-3xl">
                  ¿Organizas un evento?
                </h2>
                <p className="text-sm text-primary-foreground/90 sm:text-base">
                  Reserva por WhatsApp para tu fecha y lugar; nos montamos en tu evento.
                  Venta mínima por evento: {money(minOrder)}.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-primary-foreground/85">
                  <span className="inline-flex items-center gap-2">
                    <CalendarCheck className="size-4" aria-hidden="true" />
                    Reserva previa por WhatsApp
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Store className="size-4" aria-hidden="true" />
                    Venta directa en el evento
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:min-w-48">
                <Button asChild variant="secondary" size="lg">
                  <a href={hashHref("eventos")} onClick={(e) => { e.preventDefault(); navigate("eventos"); }}>
                    Cómo funciona
                  </a>
                </Button>
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
              </div>
            </div>
          </section>
        </div>
      </PageContainer>
    </>
  );
}
