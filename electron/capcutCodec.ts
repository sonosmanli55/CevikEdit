import { createDecipheriv } from "node:crypto";

export const CAPCUT_CODEC_MAX_BYTES = 20 * 1024 * 1024;
const embeddedOffsets = [0, 7, 20, 33, 40, 47, 59, 66, 76, 89, 99, 127];
const base64Characters = /^[A-Za-z0-9+/]*={0,2}$/;

export interface CapcutDecodedDraft {
  text: string;
  encoding: "json" | "embedded-aes-gcm";
}

function objectJson(text: string): string {
  const normalized = text.trim().replace(/^\uFEFF/, "").trim();
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    throw new Error("CapCut taslağı JSON'u ayrıştırılamıyor");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("CapCut taslağı bir JSON nesnesi olmalı");
  return normalized;
}

/**
 * Decode plain object JSON or the one independently verified local envelope.
 * The supported envelope carries 48 ASCII bytes in twelve four-character spans;
 * the remaining canonical Base64 is ciphertext followed by a 16-byte GCM tag.
 * This makes no claim about other versions, cloud formats or resource ciphers.
 * No native library execution, credential lookup, logging or file writes occur.
 */
export function decodeCapcutDraft(input: string): CapcutDecodedDraft {
  if (typeof input !== "string") throw new Error("CapCut taslağı metin girişi gerektiriyor");
  if (Buffer.byteLength(input, "utf8") > CAPCUT_CODEC_MAX_BYTES)
    throw new Error("CapCut taslağı 20 MiB okuma sınırını aşıyor");
  const source = input.trim().replace(/^\uFEFF/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    // A malformed short apparent JSON cannot fit the verified envelope. Longer
    // inputs still get format validation: embedded ASCII material could itself
    // begin with an opening brace, which is not evidence of plaintext JSON.
    if (
      (source.startsWith("{") || source.startsWith("[")) &&
      source.length < embeddedOffsets[embeddedOffsets.length - 1] + 4
    )
      return { text: objectJson(source), encoding: "json" };
    return decodeEmbedded(source);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("CapCut taslağı bir JSON nesnesi olmalı");
  return { text: source, encoding: "json" };
}

function decodeEmbedded(source: string): CapcutDecodedDraft {
  if (source.length < embeddedOffsets[embeddedOffsets.length - 1] + 4)
    throw new Error("CapCut taslağı opak bir taşıyıcı; biçim bilinmiyor veya uzunluk yetersiz");
  const material = Buffer.alloc(48);
  try {
    const bodyParts: string[] = [];
    let cursor = 0;
    for (let index = 0; index < embeddedOffsets.length; index++) {
      const offset = embeddedOffsets[index];
      bodyParts.push(source.slice(cursor, offset));
      for (let character = 0; character < 4; character++) {
        const code = source.charCodeAt(offset + character);
        if (!Number.isInteger(code) || code > 0x7f)
          throw new Error("CapCut taslağı opak bir taşıyıcı; gömülü ASCII biçimi tanınamadı");
        material[index * 4 + character] = code;
      }
      cursor = offset + 4;
    }
    bodyParts.push(source.slice(cursor));
    const body = bodyParts.join("");
    if (!body || body.length % 4 !== 0 || !base64Characters.test(body))
      throw new Error("CapCut taslağı opak bir taşıyıcı; Base64 biçimi tanınamadı");
    const bytes = Buffer.from(body, "base64");
    if (bytes.toString("base64") !== body || bytes.length < 16)
      throw new Error("CapCut taslağı opak bir taşıyıcı; Base64 taşıyıcısı eksik veya geçersiz");
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        material.subarray(0, 32),
        material.subarray(32, 48),
        { authTagLength: 16 },
      );
      decipher.setAuthTag(bytes.subarray(-16));
      plaintext = Buffer.concat([
        decipher.update(bytes.subarray(0, -16)),
        decipher.final(),
      ]);
    } catch {
      throw new Error(
        "CapCut taslağı kimlik doğrulaması başarısız; dosya bozuk olabilir veya bu CapCut sürümünün taslak biçimi henüz desteklenmiyor",
      );
    }
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        plaintext,
      );
    } catch {
      throw new Error("CapCut taslağının çözülen metni geçerli UTF-8 değil");
    }
    return { text: objectJson(decoded), encoding: "embedded-aes-gcm" };
  } finally {
    material.fill(0);
  }
}
