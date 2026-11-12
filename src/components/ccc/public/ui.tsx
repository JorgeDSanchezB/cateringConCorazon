"use client";

import type { ReactNode } from "react";
import { UtensilsCrossed, Star } from "lucide-react";
import {
  prettyAttributeLabel,
  renderableAttributeValue,
} from "@/lib/domain/attributes-render";

 

/**
 * Piezas visuales compartidas del sitio público.
 * Reglas de tolerancia (Fase 5):
 * - Campo ausente (null/undefined) → no se renderiza el bloque.
 * - Valor nulo dentro de atributos → no se pinta el chip (no aporta).
 * - Datos desconocidos (objetos/anidados) → se ignoran con degradación segura.
 */

export function SectionHeading({
  title,
  description,
  id,
  align = "center",
}: {
  title: string;
  description?: string | null;
  id?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={`mb-8 space-y-2 ${align === "center" ? "text-center" : "text-left"}`}>
      <h2 id={id} className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}

/** Imagen con degradación segura: sin URL → placeholder decorativo. */
export function ProductImage({
  src,
  alt,
  className = "",
  ratio = "aspect-[4/3]",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  ratio?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted ${ratio} ${className}`}
        aria-hidden="true"
      >
        <UtensilsCrossed className="size-10 text-muted-foreground/50" />
      </div>
    );
  }
  return (
    <div className={`overflow-hidden ${ratio} ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="size-full object-cover transition-transform duration-300 motion-safe:hover:scale-[1.04]"
      />
    </div>
  );
}

export function StarRating({ rating, label }: { rating: number; label: string }) {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${label}: ${clamped} de 5 estrellas`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`size-4 ${i < clamped ? "fill-[#E8A33D] text-[#E8A33D]" : "text-border"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/**
 * Chips de atributos dinámicos (la extensibilidad visible del sistema):
 * se iteran las claves presentes sin conocerlas por adelatado.
 * Añadir `sinGluten` o `sabor` mañana NO modifica esta función.
 */
export function AttributeChips({
  attributes,
}: {
  attributes: Record<string, unknown> | null | undefined;
}) {
  if (!attributes) return null; // Campo ausente → sin bloque
  const chips: string[] = [];
  for (const [key, raw] of Object.entries(attributes)) {
    const value = renderableAttributeValue(raw);
    if (value === null) continue; // Valor nulo → no aporta, no se pinta
    if (typeof value === "boolean") {
      if (value) chips.push(prettyAttributeLabel(key));
      // false → no se anuncia lo que NO es (ruido visual)
      continue;
    }
    if (typeof value === "string" || typeof value === "number") {
      if (String(value).trim() === "") continue;
      chips.push(`${prettyAttributeLabel(key)}: ${value}`);
      continue;
    }
    // Objetos/anidados → degradación segura: ignorados en la card
  }
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Características del producto">
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

/** Contenedor de página pública con ancho consistente. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>;
}
