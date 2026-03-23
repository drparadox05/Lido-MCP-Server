function uint8ArrayToHex(value: Uint8Array): string {
  return `0x${Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

function normalizeJsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return uint8ArrayToHex(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)]),
    );
  }

  return value;
}

export function jsonResult(data: unknown) {
  const normalized = normalizeJsonValue(data);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(normalized, null, 2),
      },
    ],
    ...(normalized && typeof normalized === 'object' && !Array.isArray(normalized)
      ? { structuredContent: normalized as Record<string, unknown> }
      : {}),
  };
}
