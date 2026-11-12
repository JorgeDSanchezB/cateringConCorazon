"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { EmptyBlock } from "@/components/ccc/admin/ui-bits";
import { PageContainer } from "./ui";

/**
 * Preguntas frecuentes (contenido 100% editable desde el admin; claves
 * estables = faq.id, nunca índice).
 */
export function FaqView() {
  const bootstrap = useBootstrapData();
  const faqs = bootstrap?.faqs ?? [];

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Preguntas frecuentes
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Todo lo que necesitas saber antes de reservar tu catering.
          </p>
        </header>

        {faqs.length === 0 ? (
          <EmptyBlock message="Aún no hay preguntas publicadas." />
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="text-left text-sm font-medium sm:text-base">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </PageContainer>
  );
}
