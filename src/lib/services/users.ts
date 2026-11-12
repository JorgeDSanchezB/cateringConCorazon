import { randomBytes } from "node:crypto";

/** Contraseña temporal segura (solo se devuelve UNA vez al crearla). */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let pw = "";
  for (const b of bytes) pw += alphabet[b % alphabet.length];
  return `Ccc-${pw}1`;
}
