import { type Address, createPublicClient, createWalletClient, getAddress, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKey } from '../config/env.js';
import { getNetworkConfig, getRpcUrl } from './networks.js';
import type { SupportedNetwork, WalletContext } from './types.js';

export function getPublicClient(network: SupportedNetwork): any {
  const config = getNetworkConfig(network);
  return createPublicClient({
    chain: config.chain,
    transport: http(getRpcUrl(network)),
  });
}

export function getAccount() {
  return privateKeyToAccount(getPrivateKey());
}

export function getWalletContext(network: SupportedNetwork): WalletContext {
  const config = getNetworkConfig(network);
  const account = getAccount();
  const publicClient = getPublicClient(network);
  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(getRpcUrl(network)),
  });

  return { account, publicClient, walletClient, config };
}

export function normalizeAddress(value: string): Address {
  return getAddress(value);
}

export function getQueryAddress(address?: string): Address {
  if (address) {
    return normalizeAddress(address);
  }

  return getAccount().address;
}
