import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const key = process.env.PUBLISHER_ENCRYPTION_KEY;
  if (!key) throw new Error("PUBLISHER_ENCRYPTION_KEY is not set");
  return Buffer.from(key, "hex");
}

interface EncryptedPayload {
  iv: string;
  data: string;
  tag: string;
}

export function encryptCredentials(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString("hex"),
    data: encrypted.toString("hex"),
    tag: tag.toString("hex"),
  };
  return JSON.stringify(payload);
}

export function decryptCredentials(ciphertext: string): string {
  const key = getKey();
  const { iv, data, tag } = JSON.parse(ciphertext) as EncryptedPayload;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
