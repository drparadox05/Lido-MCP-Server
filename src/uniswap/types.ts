import type { SupportedNetwork } from '../lido/types.js';

export const UNISWAP_PROTOCOLS = ['V2', 'V3', 'V4', 'UNISWAPX', 'UNISWAPX_V2', 'UNISWAPX_V3'] as const;
export const UNISWAP_ROUTING_PREFERENCES = ['BEST_PRICE', 'FASTEST'] as const;
export const UNISWAP_ROUTINGS = ['CLASSIC', 'DUTCH_LIMIT', 'DUTCH_V2', 'DUTCH_V3', 'BRIDGE', 'LIMIT_ORDER', 'PRIORITY', 'WRAP', 'UNWRAP', 'CHAINED'] as const;
export const EXECUTABLE_UNISWAP_ROUTINGS = ['CLASSIC', 'BRIDGE', 'WRAP', 'UNWRAP'] as const;
export const UNISWAP_URGENCIES = ['normal', 'fast', 'urgent'] as const;
export const UNISWAP_TRADE_TYPES = ['EXACT_INPUT', 'EXACT_OUTPUT'] as const;

export type UniswapProtocol = (typeof UNISWAP_PROTOCOLS)[number];
export type UniswapRoutingPreference = (typeof UNISWAP_ROUTING_PREFERENCES)[number];
export type UniswapRouting = (typeof UNISWAP_ROUTINGS)[number];
export type ExecutableUniswapRouting = (typeof EXECUTABLE_UNISWAP_ROUTINGS)[number];
export type UniswapUrgency = (typeof UNISWAP_URGENCIES)[number];
export type UniswapTradeType = (typeof UNISWAP_TRADE_TYPES)[number];

export type PreflightUniswapRouteParams = {
  tokenInChain: SupportedNetwork;
  tokenOutChain: SupportedNetwork;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  type: UniswapTradeType;
  swapper?: string;
  slippageTolerance?: number;
  routingPreference: UniswapRoutingPreference;
  protocols?: UniswapProtocol[];
  urgency: UniswapUrgency;
  approveIfNeeded: boolean;
};

export type ExecuteUniswapRouteParams = PreflightUniswapRouteParams & {
  deadline?: number;
  dryRun: boolean;
};

export type GetUniswapRouteStatusParams = {
  chain: SupportedNetwork;
  txHashes: string[];
};

export type GetUniswapBridgableTokensParams = {
  tokenInChain: SupportedNetwork;
  tokenIn: string;
};
