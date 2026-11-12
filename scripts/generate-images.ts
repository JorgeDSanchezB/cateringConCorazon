/**
 * Generador de imágenes base del catálogo (herramienta de desarrollo).
 * Uso: bun scripts/generate-images.ts
 *
 * Usa z-ai-web-dev-sdk (solo backend/CLI, nunca en cliente).
 * Tamaños válidos de la API: múltiplos de 32 entre 512 y 2880 px,
 * con un máximo de 2^22 píxeles por imagen.
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

interface AssetSpec {
  file: string;
  size: "1536x768" | "1024x1024";
  prompt: string;
}

const ASSETS: AssetSpec[] = [
  {
    file: "hero.png",
    size: "1536x768",
    prompt:
      "Elegant catering food spread for a private celebration in Ecuador, rustic wooden table with artisanal sandwiches and tropical finger food, natural orange juice in pitchers, warm terracotta and cream color palette, festive evening string lights bokeh in background, professional food photography, high quality, detailed",
  },
  {
    file: "sandwiches.png",
    size: "1024x1024",
    prompt:
      "Artisanal chicken sandwiches on rustic wooden board, fresh soft bread with filling, gourmet presentation, cream and terracotta tones, professional food photography, shallow depth of field, high quality",
  },
  {
    file: "cubano.png",
    size: "1024x1024",
    prompt:
      "Gourmet pressed Cuban sandwich cut diagonally showing melted cheese and ham layers, artisanal bread, rustic ceramic plate, warm lighting, professional food photography, high quality, detailed",
  },
  {
    file: "dorilocos.png",
    size: "1024x1024",
    prompt:
      "Ecuadorian dorilocos snack, corn chip cups topped with lime juice, hot sauce, melted cheese and colorful toppings, festive street food presentation on rustic table, professional food photography, high quality",
  },
  {
    file: "naranja.png",
    size: "1024x1024",
    prompt:
      "Fresh natural orange juice in glasses with orange slices and a glass pitcher, rustic wooden table, warm natural light, professional beverage photography, high quality, detailed",
  },
  {
    file: "combo-fiesta.png",
    size: "1024x1024",
    prompt:
      "Festive catering combo platter for a party, mini chicken sandwiches and glasses of natural orange juice arranged elegantly on cream tablecloth, warm celebratory lighting, professional food photography, high quality",
  },
  {
    file: "combo-noche.png",
    size: "1024x1024",
    prompt:
      "Evening party catering board with pressed Cuban sandwich halves and colorful Ecuadorian snack cups, moody warm lights, celebration atmosphere, professional food photography, high quality",
  },
  {
    file: "favicon-512.png",
    size: "1024x1024",
    prompt:
      "Minimal flat design app icon, heart shape combined with a small serving plate silhouette, terracotta red on cream background, centered, generous margins, simple vector style logo, high quality",
  },
];

async function main(): Promise<void> {
  const outDir = path.join(process.cwd(), "public", "images");
  fs.mkdirSync(outDir, { recursive: true });
  const zai = await ZAI.create();
  let ok = 0;
  for (const asset of ASSETS) {
    const outPath = path.join(outDir, asset.file);
    if (fs.existsSync(outPath)) {
      console.log(`· ya existe: ${asset.file}`);
      ok++;
      continue;
    }
    try {
      const response = await zai.images.generations.create({
        prompt: asset.prompt,
        // La API acepta cualquier múltiplo de 32 entre 512 y 2880 px; el tipo
        // del SDK es más restrictivo, por eso el cast documentado.
        size: asset.size as "1024x1024",
      });
      const base64 = response.data?.[0]?.base64;
      if (!base64) throw new Error("respuesta sin imagen");
      fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
      console.log(`✓ generado: ${asset.file}`);
      ok++;
    } catch (err) {
      console.error(`✗ falló ${asset.file}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log(`Listo: ${ok}/${ASSETS.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
