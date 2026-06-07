let seq = 0;

export function tempId(prefix: string): string {
  seq += 1;
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  return `${prefix}-${Date.now()}-${seq}`;
}
