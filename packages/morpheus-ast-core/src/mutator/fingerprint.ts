/**
 * mutator/fingerprint.ts
 *
 * SHA-256 fingerprint of a text, used to prove that a rollback restored the exact original.
 * Uses globalThis.crypto.subtle, available in browsers and in Node 20 or later.
 */

/** SHA-256 of the UTF-8 encoding of `text`, as 64 lowercase hex characters. */
export async function fingerprintText(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
