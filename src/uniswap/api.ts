import { getOptionalEnv } from '../config/env.js';

const UNISWAP_API_BASE_URL = 'https://trade-api.gateway.uniswap.org/v1';

function getUniswapApiKey(): string {
  const value = getOptionalEnv('UNISWAP_API_KEY');
  if (!value) {
    throw new Error('No Uniswap API key configured. Set UNISWAP_API_KEY.');
  }

  return value;
}

export function hasUniswapApiKeyConfigured(): boolean {
  return Boolean(getOptionalEnv('UNISWAP_API_KEY'));
}

export function getUniswapUniversalRouterVersion(): '1.2' | '2.0' {
  return getOptionalEnv('UNISWAP_UNIVERSAL_ROUTER_VERSION') === '1.2' ? '1.2' : '2.0';
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildHeaders(includeRouterHeader: boolean, includePermitHeader: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-api-key': getUniswapApiKey(),
  };

  if (includeRouterHeader) {
    headers['x-universal-router-version'] = getUniswapUniversalRouterVersion();
  }

  if (includePermitHeader) {
    headers['x-permit2-disabled'] = 'true';
  }

  return headers;
}

async function requestJson(path: string, init: RequestInit, includeRouterHeader: boolean, includePermitHeader: boolean) {
  const response = await fetch(`${UNISWAP_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(includeRouterHeader, includePermitHeader),
      ...(init.headers ?? {}),
    },
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail = typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object'
        ? JSON.stringify(payload)
        : response.statusText;
    throw new Error(`Uniswap API ${response.status} ${response.statusText}: ${detail}`);
  }

  return payload;
}

export async function postUniswapApi(path: string, body: unknown, options?: { includeRouterHeader?: boolean; includePermitHeader?: boolean }) {
  return requestJson(
    path,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    options?.includeRouterHeader ?? false,
    options?.includePermitHeader ?? true,
  );
}

export async function getUniswapApi(path: string, params: Record<string, string>, options?: { includeRouterHeader?: boolean; includePermitHeader?: boolean }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }

  return requestJson(
    `${path}?${query.toString()}`,
    {
      method: 'GET',
    },
    options?.includeRouterHeader ?? false,
    options?.includePermitHeader ?? false,
  );
}

export async function checkUniswapApproval(body: unknown) {
  return postUniswapApi('/check_approval', body, {
    includePermitHeader: true,
  });
}

export async function getUniswapQuote(body: unknown) {
  return postUniswapApi('/quote', body, {
    includeRouterHeader: true,
    includePermitHeader: true,
  });
}

export async function createUniswapSwap(body: unknown) {
  return postUniswapApi('/swap', body, {
    includeRouterHeader: true,
    includePermitHeader: true,
  });
}

export async function getUniswapSwapStatus(chainId: number, txHashes: string[]) {
  return getUniswapApi('/swaps', {
    chainId: String(chainId),
    txHashes: txHashes.join(','),
  });
}

export async function getUniswapBridgableTokens(tokenInChainId: number, tokenIn: string) {
  return getUniswapApi('/swappable_tokens', {
    tokenInChainId: String(tokenInChainId),
    tokenIn,
  });
}
