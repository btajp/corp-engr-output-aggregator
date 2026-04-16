const encoder = new TextEncoder();

async function importHmacKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createOgpProxySignature(input: {
  secret: string;
  timestamp: string;
  targetUrl: string;
}) {
  const key = await importHmacKey(input.secret);
  const payload = `${input.timestamp}\n${input.targetUrl}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return toHex(signature);
}
