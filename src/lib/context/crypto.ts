import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

function getEncryptionKey() {
  const encoded = process.env.CONTEXT_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("CONTEXT_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      "CONTEXT_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return key;
}

/** Encrypt a small JSON credential payload with AES-256-GCM. */
export function encryptContextCredentials(value: unknown) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decrypt a payload written by encryptContextCredentials. */
export function decryptContextCredentials<T>(encrypted: string): T {
  const [version, ivPart, tagPart, ciphertextPart] = encrypted.split(".");
  if (
    version !== VERSION ||
    !ivPart ||
    !tagPart ||
    ciphertextPart === undefined
  ) {
    throw new Error("Invalid encrypted context credential payload");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}
