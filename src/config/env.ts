import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hex } from 'viem';

const PRIVATE_KEY_ENV_KEYS = ['LIDO_PRIVATE_KEY', 'WALLET_PRIVATE_KEY', 'PRIVATE_KEY'] as const;

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadDotEnvFile() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(currentDir, '../../.env');

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}

loadDotEnvFile();

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function hasPrivateKeyConfigured(): boolean {
  return PRIVATE_KEY_ENV_KEYS.some((name) => Boolean(getOptionalEnv(name)));
}

export function getPrivateKey(): Hex {
  const value = PRIVATE_KEY_ENV_KEYS.map((name) => getOptionalEnv(name)).find((candidate) => Boolean(candidate));

  if (!value) {
    throw new Error(`No private key configured. Set ${PRIVATE_KEY_ENV_KEYS.join(', ')}.`);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Configured private key is not a valid 32-byte hex string.');
  }

  return value as Hex;
}
