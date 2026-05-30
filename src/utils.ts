export function decodeRawBodyBase64(rawBodyBase64: string): Uint8Array {
  const binary = globalThis.atob(rawBodyBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function decodeRawBodyText(rawBodyBase64: string, encoding = "utf-8"): string {
  return new TextDecoder(encoding).decode(decodeRawBodyBase64(rawBodyBase64));
}

export function firstHeader(
  headers: Record<string, string[]>,
  headerName: string,
): string | undefined {
  const normalizedName = headerName.toLowerCase();

  for (const [name, values] of Object.entries(headers)) {
    if (name.toLowerCase() === normalizedName) {
      return values[0];
    }
  }

  return undefined;
}
