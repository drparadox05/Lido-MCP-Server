import { arbitrum, base, mainnet, optimism } from 'viem/chains';

import { getOptionalEnv } from '../config/env.js';
import type { NetworkConfig, SupportedNetwork, WritableNetwork } from './types.js';

const NETWORKS: Record<SupportedNetwork, NetworkConfig> = {
  ethereum: {
    key: 'ethereum',
    chain: mainnet,
    rpcEnv: 'ETHEREUM_RPC_URL',
    lido: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    steth: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    wsteth: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    withdrawalQueue: '0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1',
    voting: '0x2e59A20f205bB85a89C53f1936454680651E618e',
    ldo: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    supportsStake: true,
    supportsGovernance: true,
    supportsRewards: true,
  },
  base: {
    key: 'base',
    chain: base,
    rpcEnv: 'BASE_RPC_URL',
    wsteth: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    supportsStake: false,
    supportsGovernance: false,
    supportsRewards: false,
  },
  optimism: {
    key: 'optimism',
    chain: optimism,
    rpcEnv: 'OPTIMISM_RPC_URL',
    steth: '0x76A50b8c7349cCDDb7578c6627e79b5d99D24138',
    wsteth: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
    ldo: '0xFdb794692724153d1488CcdBE0C56c252596735F',
    supportsStake: false,
    supportsGovernance: false,
    supportsRewards: false,
  },
  arbitrum: {
    key: 'arbitrum',
    chain: arbitrum,
    rpcEnv: 'ARBITRUM_RPC_URL',
    wsteth: '0x5979D7b546E38E414F7E9822514be443A4800529',
    ldo: '0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',
    supportsStake: false,
    supportsGovernance: false,
    supportsRewards: false,
  },
};

export function getNetworkConfig(network: SupportedNetwork): NetworkConfig {
  return NETWORKS[network];
}

export function getRpcUrl(network: SupportedNetwork): string {
  const config = getNetworkConfig(network);
  const configured = getOptionalEnv(config.rpcEnv);
  if (configured) {
    return configured;
  }

  const fallback = config.chain.rpcUrls.default.http[0];
  if (fallback) {
    return fallback;
  }

  throw new Error(`No RPC URL configured for ${network}. Set ${config.rpcEnv}.`);
}

export function getSupportedNetworkByChainId(chainId: number): SupportedNetwork {
  const match = Object.values(NETWORKS).find((config) => config.chain.id === chainId);
  if (!match) {
    throw new Error(`Chain id ${chainId} is not supported by this server.`);
  }

  return match.key;
}

export function requireWritableNetwork(network: SupportedNetwork): WritableNetwork {
  if (network !== 'ethereum') {
    throw new Error(`Network ${network} is read-only for Lido core actions. Use ethereum.`);
  }

  return network;
}
