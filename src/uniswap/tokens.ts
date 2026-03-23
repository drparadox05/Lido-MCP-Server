import { getAddress, zeroAddress, type Address } from 'viem';

import { getNetworkConfig } from '../lido/networks.js';
import type { SupportedNetwork } from '../lido/types.js';

export const NATIVE_TOKEN_ADDRESS = zeroAddress;

const TOKEN_ALIASES = ['native', 'eth', 'steth', 'wsteth', 'ldo'] as const;

export function isAddressLike(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{40}$/.test(value);
}

export function resolveTokenReference(network: SupportedNetwork, value: string): Address {
  if (isAddressLike(value)) {
    return getAddress(value);
  }

  const normalized = value.trim().toLowerCase();
  const config = getNetworkConfig(network);

  if (normalized === 'native' || normalized === 'eth') {
    return NATIVE_TOKEN_ADDRESS;
  }

  if (normalized === 'steth') {
    if (!config.steth) {
      throw new Error(`Token alias steth is not available on ${network}. Use a token address instead.`);
    }

    return getAddress(config.steth);
  }

  if (normalized === 'wsteth') {
    if (!config.wsteth) {
      throw new Error(`Token alias wsteth is not available on ${network}. Use a token address instead.`);
    }

    return getAddress(config.wsteth);
  }

  if (normalized === 'ldo') {
    if (!config.ldo) {
      throw new Error(`Token alias ldo is not available on ${network}. Use a token address instead.`);
    }

    return getAddress(config.ldo);
  }

  throw new Error(
    `Unsupported token reference ${value}. Use one of ${TOKEN_ALIASES.join(', ')} or provide an explicit token address.`,
  );
}

export function describeTokenReference(network: SupportedNetwork, value: string): { input: string; resolved: Address; kind: 'native' | 'erc20' } {
  const resolved = resolveTokenReference(network, value);
  return {
    input: value,
    resolved,
    kind: resolved.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ? 'native' : 'erc20',
  };
}
