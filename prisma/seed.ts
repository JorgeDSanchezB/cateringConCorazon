import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * SEED idempotente de CATERING CON CORAZÓN.
 * Ejecutar: `bun prisma/seed.ts` (o `npx prisma db seed`).
 *
 * Idempotencia: todas las entidades usan claves únicas o ids deterministas
 * ("seed-*") con upsert → re-ejecutar no duplica nada.
 *
 * Contraseñas iniciales (cámbielas en producción — ver docs/runbook.md):
 *   admin@cateringconcorazon.ec    → CorazonAdmin2025!
 *   staff@cateringconcorazon.ec    → CorazonStaff2025!
 *   contador@cateringconcorazon.ec → CorazonContador2025!
 */

const db = new PrismaClient();

const DEFAULT_THEME = {
  background: "#FFF9F2",
  foreground: "#3B241A",
  card: "#FFFFFF",
  cardForeground: "#3B241A",
  primary: "#9E2B1E",
  primaryForeground: "#FFFFFF",
  accent: "#E8A33D",
  accentForeground: "#3B241A",
  muted: "#F6EBDD",
  mutedForeground: "#7A655C",
  border: "#E5D5C5",
  radiusLevel: "lg",
  shadowLevel: "md",
  fontHeading: "playfair",
  fontBody: "inter",
  logoUrl: null,
  faviconUrl: null,
};

const SETTINGS: Record<string, string> = {
  brand_name: "Catering con Corazón",
  hero_title: "Catering con corazón para eventos inolvidables",
  hero_subtitle:
    "Menús artesanales para fiestas y celebraciones: sándwiches de pollo, cubanos de alta calidad, dorilocos y bebidas naturales. Nos montamos en tu evento.",
  hero_cta_primary: "Ver el menú",
  hero_cta_secondary: "Reservar por WhatsApp",
  about_title: "Sobre nosotros",
  about_text:
    "Somos un catering ecuatoriano que prepara cada menú como si fuera para nuestra propia familia: ingredientes frescos, recetas artesanales y un servicio cálido que convierte cada celebración en un recuerdo.\n\nNos montamos en tu evento — fiestas, quinceañeras, celebraciones empresariales o reuniones donde la gente quiere bailar, comer y disfrutar. Sin entregas a domicilio: el sabor llega al evento.",
  seo_title: "Catering con Corazón — Catering para eventos privados en Ecuador",
  seo_description:
    "Catering para fiestas y eventos privados en Ecuador: sándwiches de pollo, cubanos de alta calidad, dorilocos y bebidas naturales. Reserva por WhatsApp.",
  currency: "USD",
  currency_symbol: "$",
  locale: "es-EC",
  timezone: "America/Guayaquil",
  tax_percent: "15",
  global_min_order_cents: "5000",
  order_prefix: "CCC-",
  invoice_prefix: "001-001-",
  invoice_padding: "9",
  legal_disclaimer:
    "Esta plantilla es un borrador generado automáticamente y no constituye asesoría legal. Revísala con un abogado colegiado en Ecuador antes de publicarla.",
  footer_text: "Hecho con corazón en Ecuador.",
};

const FLAGS: { key: string; value: boolean; description: string }[] = [
  { key: "tax_enabled", value: false, description: "Aplicar el IVA (%) configurado en Ajustes sobre los pedidos." },
  { key: "invoicing_enabled", value: false, description: "Habilitar el módulo de facturación interna numerada." },
  { key: "variants_enabled", value: false, description: "Activar variantes de producto (tamaño/sabor) en catálogo y pedidos." },
  { key: "testimonials_enabled", value: false, description: "Mostrar el bloque de testimonios en la página pública." },
  { key: "combos_enabled", value: true, description: "Activar el módulo de combos (creación y venta)." },
  { key: "discounts_enabled", value: true, description: "Activar la validación y aplicación de códigos de descuento." },
];

const ATTRIBUTE_SCHEMA_V1 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  title: "Atributos de producto v1",
  properties: {
    sinGluten: { type: "boolean", description: "Apto sin gluten" },
    vegetariano: { type: "boolean", description: "Apto vegetariano" },
    nivelPicante: { type: "string", enum: ["suave", "medio", "fuerte"] },
    notas: { type: "string", maxLength: 80, description: "Nota breve para la carta" },
  },
  additionalProperties: false,
};

const LEGAL_PAGES: { slug: string; title: string; content: string }[] = [
  {
    slug: "privacidad",
    title: "Política de Privacidad",
    content: `## 1. Responsable del tratamiento
CATERING CON CORAZÓN (en adelante, "el negocio"), con domicilio de contacto publicado en este sitio, actúa como responsable del tratamiento de los datos personales recabados a través de esta página.

## 2. Datos que recabamos
- Nombre y teléfono del cliente que realiza una reserva.
- Detalles del evento (fecha, lugar, número de invitados, notas).
- Información de uso básica (navegación) cuando se utilizan cookies (ver Política de Cookies).

## 3. Finalidad
Los datos se utilizan exclusivamente para: atender y confirmar reservas de catering, preparar el servicio contratado y gestionar la relación comercial. No se ceden a terceros salvo obligación legal.

## 4. Conservación
Los datos se conservan durante la vigencia de la relación comercial y los plazos legales aplicables en Ecuador, y después solo bloqueados mientras existan deberes de conservación.

## 5. Derechos
Puede ejercer derechos de acceso, rectificación y eliminación escribiendo al canal de contacto publicado en este sitio (WhatsApp o correo indicado por el negocio).

## 6. Seguridad
Se aplican medidas técnicas razonables de protección. Las contraseñas del personal se almacenan cifradas (hash bcrypt).

## 7. Menores
No recabamos deliberadamente datos de menores. Las reservas de eventos con menores son realizadas por adultos responsables.

## 8. Cambios
Cualquier cambio material se publicará en esta misma página con fecha actualizada.`,
  },
  {
    slug: "cookies",
    title: "Política de Cookies",
    content: `## 1. Qué son
Las cookies son pequeños archivos o entradas de almacenamiento que el sitio guarda en su dispositivo.

## 2. Cookies que utiliza este sitio
- **Técnica de sesión (necesaria):** cookie "ccc_session" httpOnly que mantiene la sesión del panel de administración. Caduca al cerrar sesión o a las 12 horas.
- **Carrito (necesaria):** almacenamiento local "ccc-cart" para conservar su pedido mientras navega.

## 3. Sin cookies de terceros
Este sitio no incorpora cookies de publicidad ni de analítica de terceros.

## 4. Gestión
Puede borrar el almacenamiento local y las cookies desde la configuración de su navegador. Eliminar la cookie de sesión cerrará su sesión de administración.

## 5. Cambios
Las variaciones de esta política se publicarán en esta misma página.`,
  },
  {
    slug: "terminos",
    title: "Términos y Condiciones",
    content: `## 1. Objeto
Estos términos regulan la reserva y prestación de servicios de catering para eventos privados ofrecidos por CATERING CON CORAZÓN en Ecuador.

## 2. Naturaleza del servicio
El servicio se presta **en el lugar del evento** (montaje en sitio). NO se realizan entregas a domicilio ni envíos. El cliente garantiza el acceso al lugar en los horarios acordados.

## 3. Reservas y confirmación
Las reservas se realizan a través de WhatsApp. Un pedido queda CONFIRMADO solo cuando el negocio lo comunica expresamente por ese canal. La disponibilidad de fecha, menú y cantidades está sujeta a confirmación.

## 4. Precios e impuestos
Los precios se expresan en dólares estadounidenses (USD). Los impuestos aplicables (p. ej., IVA vigente en Ecuador) se aplican conforme a la configuración vigente del sitio en el momento del pedido, y se desglosan en el resumen del pedido.

## 5. Mínimo por evento
Existe un monto mínimo de pedido por evento, publicado en el sitio y aplicable al subtotal del pedido. Podrán existir mínimos específicos para eventos concretos.

## 6. Modificaciones y cancelaciones
Toda modificación o cancelación debe comunicarse por WhatsApp. Las cancelaciones con proximidad a la fecha del evento podrán conllevar retención de anticipos conforme acuerde el negocio con el cliente.

## 7. Pagos
La confirmación y forma de pago (efectivo, transferencia u otras) se acuerda por WhatsApp. El sitio no procesa pagos en línea.

## 8. Alergias e intolerancias
El cliente declara comunicar alergias o intolerancias por escrito antes de confirmar el pedido. El negocio tomará medidas razonables, sin garantizar entornos libres de trazas.

## 9. Responsabilidad
El negocio responde por la correcta prestación del servicio contratado y por la inocuidad de sus preparaciones conforme a la normativa ecuatoriana aplicable. No responde por incidencias del recinto, del equipamiento del recinto ni de terceros ajenos al servicio.

## 10. Ley aplicable
Estos términos se rigen por la legislación de la República del Ecuador. Cualquier controversia se someterá a los juzgados competentes del domicilio del negocio.`,
  },
  {
    slug: "aviso-legal",
    title: "Aviso Legal",
    content: `## 1. Identificación
Este sitio web es propiedad de CATERING CON CORAZÓN, negocio de catering para eventos privados con domicilio en Ecuador. Los datos completos de contacto (nombre legal, RUC y dirección) se publicarán en este apartado por el titular del negocio.

## 2. Objeto
El sitio ofrece información del catálogo, combos y servicios, y permite iniciar reservas que se confirman por WhatsApp.

## 3. Propiedad intelectual
Los contenidos, imágenes y marcas mostrados pertenecen a su titular o cuentan con licencia de uso. Se prohíbe su reproducción no autorizada.

## 4. Uso del panel de administración
El acceso al panel está restringido a personal autorizado. Cualquier uso no autorizado será perseguido conforme a la ley.

## 5. Facturación
La emisión de comprobantes internos por este sitio tiene carácter de registro interno y no sustituye a la facturación electrónica obligatoria ante el SRI, cuya integración no forma parte de este servicio.

## 6. Responsabilidad sobre contenidos
Los textos legales de este sitio son plantillas editables revisables por el titular, quien es el único responsable de su contenido definitivo publicado.`,
  },
];

const FAQS: { id: string; question: string; answer: string }[] = [
  {
    id: "seed-faq-1",
    question: "¿Cómo reservo el catering para mi evento?",
    answer:
      "Arma tu pedido en el carrito desde el menú, agrega tus datos del evento (fecha, lugar e invitados) y envíalo por WhatsApp. Confirmamos contigo por ese mismo canal en horario de atención.",
  },
  {
    id: "seed-faq-2",
    question: "¿Cuál es el monto mínimo por evento?",
    answer:
      "Hay un mínimo por evento configurable; el carrito te avisa si tu pedido aún no lo alcanza. Algunos eventos específicos pueden tener un mínimo distinto, informado en su momento.",
  },
  {
    id: "seed-faq-3",
    question: "¿Hacen entregas a domicilio?",
    answer:
      "No. El catering se monta en el lugar de tu evento: nosotros llegamos, montamos la mesa de servicio y atendemos durante la celebración.",
  },
  {
    id: "seed-faq-4",
    question: "¿Cómo funciona el pago?",
    answer:
      "El pago no se procesa en línea: se coordina por WhatsApp. Puedes aplicar un código de descuento en el carrito antes de enviar tu pedido.",
  },
  {
    id: "seed-faq-5",
    question: "¿Puedo modificar o cancelar mi reserva?",
    answer:
      "Sí, contáctanos por WhatsApp lo antes posible. Te explicaremos las condiciones según la cercanía de la fecha del evento.",
  },
  {
    id: "seed-faq-6",
    question: "¿Tienen opciones sin gluten o vegetarianas?",
    answer:
      "Cada producto puede mostrar sus atributos (sin gluten, vegetariano, nivel de picante) en su tarjeta del catálogo. Si tienes alergias, escríbenos por WhatsApp antes de confirmar.",
  },
];

const TESTIMONIALS: { id: string; customerName: string; text: string; rating: number }[] = [
  {
    id: "seed-testimonial-1",
    customerName: "María Fernanda G.",
    text: "Los cubanos fueron la estrella de los quince de mi hija. Llegaron puntuales, montaron todo y la mesa nunca se vio vacía.",
    rating: 5,
  },
  {
    id: "seed-testimonial-2",
    customerName: "Carlos Andrés M.",
    text: "Contratamos el combo para 80 personas y sobró justo lo correcto. El trato humano hizo la diferencia.",
    rating: 5,
  },
  {
    id: "seed-testimonial-3",
    customerName: "Lena P.",
    text: "La bebida de naranja natural y los dorilocos pidieron bis. Ya reservamos para el aniversario de la empresa.",
    rating: 4,
  },
];

const BANNERS: { id: string; title: string; subtitle: string; imageUrl: string | null; linkUrl: string }[] = [
  {
    id: "seed-banner-1",
    title: "Menú de temporada",
    subtitle: "Cubanos de alta calidad con pan artesanal del día.",
    imageUrl: "/images/cubano.jpg",
    linkUrl: "#/catalogo",
  },
  {
    id: "seed-banner-2",
    title: "Combos para celebrar",
    subtitle: "Precios especiales por combo: tu fiesta completa en un clic.",
    imageUrl: "/images/dorilocos.jpg",
    linkUrl: "#/catalogo",
  },
];

const PRODUCTS: {
  id: string;
  name: string;
  type: "PRODUCT" | "BEVERAGE";
  basePrice: number;
  categoryId: string | null;
  imageUrl: string;
  description: string;
  sortOrder: number;
  isFeatured: boolean;
  attributes: Record<string, unknown> | null;
}[] = [
  {
    id: "seed-product-sandwiches",
    name: "Sándwiches de pollo",
    type: "PRODUCT",
    basePrice: 350,
    categoryId: "seed-category-salados",
    imageUrl: "/images/sandwiches.jpg",
    description:
      "Sándwich artesanal de pollo marinado, con vegetales frescos y nuestra salsa de la casa. Ideal para toda clase de eventos.",
    sortOrder: 1,
    isFeatured: true,
    attributes: { sinGluten: false, vegetariano: false, nivelPicante: "suave" },
  },
  {
    id: "seed-product-cubanos",
    name: "Cubanos de alta calidad",
    type: "PRODUCT",
    basePrice: 500,
    categoryId: "seed-category-salados",
    imageUrl: "/images/cubano.jpg",
    description:
      "El clásico cubano llevado a otro nivel: pan cristalino, lechón ahumado, jamón de alta calidad, queso fundido y mostaza dijon.",
    sortOrder: 2,
    isFeatured: true,
    attributes: { sinGluten: false, vegetariano: false, nivelPicante: "medio" },
  },
  {
    id: "seed-product-dorilocos",
    name: "Dorilocos",
    type: "PRODUCT",
    basePrice: 300,
    categoryId: "seed-category-salados",
    imageUrl: "/images/dorilocos.jpg",
    description:
      "Nuestro dorilocos con todo: cueritos, maíz, salsas de la casa y limón. El antojo que no puede faltar en la fiesta.",
    sortOrder: 3,
    isFeatured: false,
    attributes: { sinGluten: true, vegetariano: true, nivelPicante: "fuerte" },
  },
  {
    id: "seed-product-naranja",
    name: "Bebida de naranja",
    type: "BEVERAGE",
    basePrice: 200,
    categoryId: "seed-category-bebidas",
    imageUrl: "/images/naranja.jpg",
    description:
      "Jugo natural de naranja servido frío, endulzado con un toque de panela. Refrescante y natural.",
    sortOrder: 10,
    isFeatured: false,
    attributes: { sinGluten: true, vegetariano: true },
  },
];

async function seedUsers() {
  const users = [
    { email: "admin@cateringconcorazon.ec", name: "Administrador", role: "ADMIN", password: "CorazonAdmin2025!" },
    { email: "staff@cateringconcorazon.ec", name: "Staff de Evento", role: "STAFF", password: "CorazonStaff2025!" },
    { email: "contador@cateringconcorazon.ec", name: "Contador", role: "CONTADOR", password: "CorazonContador2025!" },
  ];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await db.user.upsert({
      where: { email: u.email },
      update: {}, // no re-hashea en re-ejecuciones (contraseña gestionable desde admin)
      create: { email: u.email, name: u.name, role: u.role, passwordHash, isActive: true },
    });
  }
}

async function main() {
  console.log("→ Usuarios");
  await seedUsers();

  console.log("→ Categorías");
  await db.category.upsert({
    where: { id: "seed-category-salados" },
    update: { name: "Salados", slug: "salados" },
    create: { id: "seed-category-salados", name: "Salados", slug: "salados", sortOrder: 1, isActive: true },
  });
  await db.category.upsert({
    where: { id: "seed-category-bebidas" },
    update: { name: "Bebidas", slug: "bebidas" },
    create: { id: "seed-category-bebidas", name: "Bebidas", slug: "bebidas", sortOrder: 2, isActive: true },
  });

  console.log("→ Esquema de atributos v1");
  await db.productAttributeSchema.upsert({
    where: { version: 1 },
    update: { schemaJson: JSON.stringify(ATTRIBUTE_SCHEMA_V1), isActive: true },
    create: {
      version: 1,
      schemaJson: JSON.stringify(ATTRIBUTE_SCHEMA_V1),
      description: "Esquema inicial: sinGluten, vegetariano, nivelPicante, notas.",
      isActive: true,
    },
  });

  console.log("→ Productos + inventario + medios");
  for (const p of PRODUCTS) {
    await db.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        type: p.type,
        basePrice: p.basePrice,
        categoryId: p.categoryId,
        imageUrl: p.imageUrl,
        description: p.description,
        sortOrder: p.sortOrder,
        isFeatured: p.isFeatured,
        isVisible: true,
        isArchived: false,
        attributes: p.attributes ? JSON.stringify(p.attributes) : null,
        attributeSchemaVersion: p.attributes ? 1 : null,
      },
      create: {
        id: p.id,
        name: p.name,
        type: p.type,
        basePrice: p.basePrice,
        categoryId: p.categoryId,
        imageUrl: p.imageUrl,
        description: p.description,
        sortOrder: p.sortOrder,
        isFeatured: p.isFeatured,
        isVisible: true,
        isArchived: false,
        attributes: p.attributes ? JSON.stringify(p.attributes) : null,
        attributeSchemaVersion: p.attributes ? 1 : null,
      },
    });
    // Inventario inicial idempotente: solo crea la fila si no existe.
    const existingStock = await db.inventoryStock.findUnique({ where: { productId: p.id } });
    if (!existingStock) {
      await db.inventoryStock.create({ data: { productId: p.id, quantity: 200, lowStockThreshold: 20 } });
      await db.inventoryMovement.create({
        data: { productId: p.id, delta: 200, reason: "Ajuste inicial de inventario (seed)" },
      });
    }
    await db.mediaAsset.upsert({
      where: { id: `media-${p.id}` },
      update: { url: p.imageUrl, filename: p.imageUrl.split("/").pop() ?? "", mimeType: "image/jpeg" },
      create: {
        id: `media-${p.id}`,
        url: p.imageUrl,
        filename: p.imageUrl.split("/").pop() ?? "",
        mimeType: "image/jpeg",
        sizeBytes: 0,
        alt: p.name,
      },
    });
  }

  console.log("→ Combos");
  await db.combo.upsert({
    where: { id: "seed-combo-fiesta" },
    update: {
      name: "Combo Fiesta con Corazón",
      description:
        "El favorito de las celebraciones: 2 sándwiches de pollo + 2 bebidas de naranja por persona, a precio de combo.",
      pricingMode: "FIXED_PRICE",
      fixedPrice: 950,
      isVisible: true,
      isFeatured: true,
      sortOrder: 1,
      items: {
        deleteMany: {},
        create: [
          { productId: "seed-product-sandwiches", quantity: 2 },
          { productId: "seed-product-naranja", quantity: 2 },
        ],
      },
    },
    create: {
      id: "seed-combo-fiesta",
      name: "Combo Fiesta con Corazón",
      description:
        "El favorito de las celebraciones: 2 sándwiches de pollo + 2 bebidas de naranja por persona, a precio de combo.",
      pricingMode: "FIXED_PRICE",
      fixedPrice: 950,
      isVisible: true,
      isFeatured: true,
      sortOrder: 1,
      items: {
        create: [
          { productId: "seed-product-sandwiches", quantity: 2 },
          { productId: "seed-product-naranja", quantity: 2 },
        ],
      },
    },
  });
  await db.combo.upsert({
    where: { id: "seed-combo-fin-de-semana" },
    update: {
      name: "Combo Noche de Fiesta",
      description: "2 cubanos de alta calidad + 2 dorilocos: 10% de descuento sobre la suma de los productos.",
      pricingMode: "PERCENT_DISCOUNT",
      discountPercent: 10,
      isVisible: true,
      isFeatured: false,
      sortOrder: 2,
      items: {
        deleteMany: {},
        create: [
          { productId: "seed-product-cubanos", quantity: 2 },
          { productId: "seed-product-dorilocos", quantity: 2 },
        ],
      },
    },
    create: {
      id: "seed-combo-fin-de-semana",
      name: "Combo Noche de Fiesta",
      description: "2 cubanos de alta calidad + 2 dorilocos: 10% de descuento sobre la suma de los productos.",
      pricingMode: "PERCENT_DISCOUNT",
      discountPercent: 10,
      isVisible: true,
      isFeatured: false,
      sortOrder: 2,
      items: {
        create: [
          { productId: "seed-product-cubanos", quantity: 2 },
          { productId: "seed-product-dorilocos", quantity: 2 },
        ],
      },
    },
  });

  console.log("→ Flags, settings, tema y WhatsApp");
  for (const f of FLAGS) {
    await db.featureFlag.upsert({
      where: { key: f.key },
      update: { value: f.value, description: f.description },
      create: { key: f.key, value: f.value, description: f.description },
    });
  }
  for (const [key, value] of Object.entries(SETTINGS)) {
    await db.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  await db.themeSetting.upsert({
    where: { id: "theme" },
    update: {}, // el tema es editable desde admin; el seed solo lo crea la 1ª vez
    create: { id: "theme", ...DEFAULT_THEME },
  });
  await db.whatsAppSetting.upsert({
    where: { id: "whatsapp" },
    update: {},
    create: {
      id: "whatsapp",
      phoneNumber: "+593000000000",
      defaultMessage:
        "¡Hola {BRAND}! Quiero reservar el catering para mi evento.\n\n" +
        "Pedido {ORDER_CODE}\n" +
        "Nombre: {CUSTOMER_NAME}\n" +
        "Fecha del evento: {EVENT_DATE}\n" +
        "Lugar: {EVENT_LOCATION}\n" +
        "Invitados: {GUESTS}\n\n" +
        "Detalle:\n{ITEMS}\n" +
        "Subtotal: {SUBTOTAL}\n" +
        "Descuento: {DISCOUNT}\n" +
        "IVA: {TAX}\n" +
        "Total: {TOTAL}\n" +
        "Notas: {NOTES}\n\n" +
        "¡Gracias! Quedo pendiente de la confirmación.",
      buttonLabel: "Reservar por WhatsApp",
    },
  });

  console.log("→ Páginas legales");
  for (const page of LEGAL_PAGES) {
    await db.legalPage.upsert({
      where: { slug: page.slug },
      update: { title: page.title, content: page.content },
      create: { slug: page.slug, title: page.title, content: page.content },
    });
  }

  console.log("→ FAQ, banners y testimonios");
  for (const f of FAQS) {
    await db.faq.upsert({
      where: { id: f.id },
      update: { question: f.question, answer: f.answer, isVisible: true },
      create: { id: f.id, question: f.question, answer: f.answer, isVisible: true, sortOrder: FAQS.indexOf(f) + 1 },
    });
  }
  for (const b of BANNERS) {
    await db.banner.upsert({
      where: { id: b.id },
      update: { title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, linkUrl: b.linkUrl, isVisible: true },
      create: { ...b, isVisible: true, sortOrder: BANNERS.indexOf(b) + 1 },
    });
  }
  for (const t of TESTIMONIALS) {
    await db.testimonial.upsert({
      where: { id: t.id },
      update: { customerName: t.customerName, text: t.text, rating: t.rating, isVisible: true },
      create: { ...t, isVisible: true, sortOrder: TESTIMONIALS.indexOf(t) + 1 },
    });
  }

  console.log("→ Contadores");
  await db.counter.upsert({ where: { key: "order" }, update: {}, create: { key: "order", value: 0 } });
  await db.counter.upsert({ where: { key: "invoice" }, update: {}, create: { key: "invoice", value: 0 } });

  console.log("✔ Seed completo (idempotente).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
