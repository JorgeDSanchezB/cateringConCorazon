import { NextRequest } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { requireUser } from "@/lib/auth";
import { CriticalError, ValidationError } from "@/lib/errors";
import { apiHandler, jsonOk, parseBody } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { config } from "@/lib/config";

/**
 * POST /api/admin/ai/draft  (ADMIN)
 * Genera borradores de texto (páginas legales) con z-ai-web-dev-sdk en el
 * BACKEND (nunca en cliente). Clasificación de fallos:
 * - Body inválido → 422 (ValidationError).
 * - SDK/IA no disponible o respuesta vacía → 500 (CriticalError con mensaje
 *   claro y log): es una dependencia de servicio, no un fallo del negocio;
 *   el editor sigue usable a mano.
 * - Rate limit → 429 (protección de coste).
 */

const LEGAL_KINDS = {
  privacidad:
    "Política de Privacidad conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP)",
  cookies: "Política de Cookies",
  terminos: "Términos y Condiciones del servicio de catering para eventos privados",
  "aviso-legal": "Aviso Legal con identificación del responsable",
} as const;

const draftSchema = z
  .object({
    kind: z.literal("legal"),
    /** Slug de la página legal objetivo (whitelist arriba). */
    slug: z.enum(["privacidad", "cookies", "terminos", "aviso-legal"]),
    currentTitle: z.string().trim().max(120).optional(),
    /** Notas del administrador para guiar el borrador. */
    notes: z.string().max(600).optional(),
  })
  .strict();

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser(req, { roles: ["ADMIN"] });
  rateLimit("ai-draft", clientIp(req), config.AI_DRAFT_MAX_PER_MINUTE);

  const body = await parseBody(req, draftSchema);
  const kindLabel = LEGAL_KINDS[body.slug];

  // Título por defecto derivado de la whitelist (sin textos sueltos en código
  // de negocio: la estructura del documento es la PLANTILLA, no un dato).
  const title = body.currentTitle ?? kindLabel;

  const zai = await ZAI.create().catch(() => {
    console.error("[AI] z-ai-web-dev-sdk no pudo inicializarse (borrador legal).");
    throw new CriticalError(
      "El servicio de IA no está disponible ahora mismo. El editor manual sigue funcionando; inténtalo más tarde.",
    );
  });

  const completion = await zai.chat.completions
    .create({
      messages: [
        {
          role: "assistant",
          content:
            "Eres un redactor legal ecuatoriano. Elaboras borradores de documentos legales en español de Ecuador, " +
            "estructurados en Markdown (## secciones numeradas), completos pero concisos, con lenguaje claro. " +
            "Cada borrador DEBE terminar con una sección final de aviso indicando que es una plantilla generada " +
            "automáticamente que no sustituye asesoría legal profesional.",
        },
        {
          role: "user",
          content:
            `Redacta un borrador completo de: ${title}.\n\n` +
            `Contexto del negocio: "Catering con Corazón", catering para eventos privados en Ecuador ` +
            `(reservas por WhatsApp, sin pagos en línea, sin entregas a domicilio, venta con IVA configurable). ` +
            `Formato: Markdown con secciones numeradas (## 1. …), 700–1500 palabras, incluye datos del responsable ` +
            `como [NOMBRE DEL RESPONSABLE], [CIUDAD], [EMAIL] entre corchetes para que el administrador los rellene.` +
            (body.notes ? `\n\nNotas del administrador: ${body.notes}` : ""),
        },
      ],
      thinking: { type: "disabled" },
    })
    .catch((err: unknown) => {
      console.error("[AI] fallo generando borrador legal:", (err as Error).message);
      throw new CriticalError(
        "No se pudo generar el borrador. Revisa tu conexión e inténtalo de nuevo; el editor manual sigue disponible.",
      );
    });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (text.length < 50) {
    // Respuesta vacía/corrupta del modelo → no se devuelve basura al admin.
    console.error("[AI] respuesta vacía o demasiado corta al generar borrador legal.");
    throw new ValidationError([
      { field: "kind", message: "La IA devolvió un borrador vacío; inténtalo de nuevo." },
    ]);
  }

  return jsonOk({ text, title });
});
