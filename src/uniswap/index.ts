import { erc20Abi, formatUnits, getAddress, parseUnits, type Address, type Hex } from 'viem';

import { hasPrivateKeyConfigured } from '../config/env.js';
import { getAccount, getPublicClient, getWalletContext } from '../lido/clients.js';
import { getNetworkConfig } from '../lido/networks.js';
import type { SupportedNetwork } from '../lido/types.js';
import { checkUniswapApproval, createUniswapSwap, getUniswapBridgableTokens as fetchUniswapBridgableTokens, getUniswapQuote, getUniswapSwapStatus as fetchUniswapSwapStatus, getUniswapUniversalRouterVersion, hasUniswapApiKeyConfigured } from './api.js';
import { NATIVE_TOKEN_ADDRESS, describeTokenReference, resolveTokenReference } from './tokens.js';
import { EXECUTABLE_UNISWAP_ROUTINGS, type ExecuteUniswapRouteParams, type GetUniswapBridgableTokensParams, type GetUniswapRouteStatusParams, type PreflightUniswapRouteParams, type UniswapProtocol, type UniswapRouting } from './types.js';

function isNativeToken(address: Address): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

function getExecutionContext(swapper?: string) {
  let configuredAddress: Address | null = null;
  let walletError: string | null = null;

  if (hasPrivateKeyConfigured()) {
    try {
      configuredAddress = getAccount().address;
    } catch (error) {
      walletError = error instanceof Error ? error.message : String(error);
    }
  }

  const swapperAddress = swapper ? getAddress(swapper) : configuredAddress;
  return {
    wallet_configured: hasPrivateKeyConfigured(),
    configured_address: configuredAddress,
    wallet_error: walletError,
    swapper: swapperAddress,
    local_execution_available: Boolean(configuredAddress && swapperAddress && configuredAddress.toLowerCase() === swapperAddress.toLowerCase()),
  };
}

async function getTokenDecimals(network: SupportedNetwork, token: Address): Promise<number> {
  if (isNativeToken(token)) {
    return 18;
  }

  const publicClient = getPublicClient(network);
  return Number(
    await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  );
}

async function resolveTradeAmount(type: 'EXACT_INPUT' | 'EXACT_OUTPUT', tokenInChain: SupportedNetwork, tokenIn: Address, tokenOutChain: SupportedNetwork, tokenOut: Address, amount: string) {
  const amountTokenNetwork = type === 'EXACT_INPUT' ? tokenInChain : tokenOutChain;
  const amountTokenAddress = type === 'EXACT_INPUT' ? tokenIn : tokenOut;
  const decimals = await getTokenDecimals(amountTokenNetwork, amountTokenAddress);
  const raw = parseUnits(amount, decimals);

  return {
    specified_token: type === 'EXACT_INPUT' ? 'token_in' : 'token_out',
    decimals,
    raw,
    formatted: formatUnits(raw, decimals),
  };
}

function getDefaultProtocols(tokenInChain: SupportedNetwork, tokenOutChain: SupportedNetwork, protocols?: UniswapProtocol[]) {
  if (protocols && protocols.length > 0) {
    return protocols;
  }

  if (tokenInChain !== tokenOutChain) {
    return undefined;
  }

  return ['V4', 'V3', 'V2'] as UniswapProtocol[];
}

async function prepareUniswapRoute(params: PreflightUniswapRouteParams) {
  if (!hasUniswapApiKeyConfigured()) {
    throw new Error('No Uniswap API key configured. Set UNISWAP_API_KEY.');
  }

  const execution = getExecutionContext(params.swapper);
  if (!execution.swapper) {
    throw new Error('Provide swapper explicitly or configure a wallet private key before requesting a Uniswap route.');
  }

  const inputToken = describeTokenReference(params.tokenInChain, params.tokenIn);
  const outputToken = describeTokenReference(params.tokenOutChain, params.tokenOut);
  const amount = await resolveTradeAmount(
    params.type,
    params.tokenInChain,
    inputToken.resolved,
    params.tokenOutChain,
    outputToken.resolved,
    params.amount,
  );
  const protocols = getDefaultProtocols(params.tokenInChain, params.tokenOutChain, params.protocols);
  const quoteRequest = {
    type: params.type,
    amount: amount.raw.toString(),
    tokenInChainId: getNetworkConfig(params.tokenInChain).chain.id,
    tokenOutChainId: getNetworkConfig(params.tokenOutChain).chain.id,
    tokenIn: inputToken.resolved,
    tokenOut: outputToken.resolved,
    swapper: execution.swapper,
    routingPreference: params.routingPreference,
    urgency: params.urgency,
    ...(params.slippageTolerance !== undefined ? { slippageTolerance: params.slippageTolerance } : { autoSlippage: 'DEFAULT' }),
    ...(protocols ? { protocols } : {}),
  };
  const quote = await getUniswapQuote(quoteRequest);
  const routing = quote.routing as UniswapRouting;
  const quotedInputAmount = (quote.quote as any)?.input?.amount ?? amount.raw.toString();
  const approvalRequest = !isNativeToken(inputToken.resolved)
    ? {
        walletAddress: execution.swapper,
        token: inputToken.resolved,
        amount: quotedInputAmount,
        chainId: getNetworkConfig(params.tokenInChain).chain.id,
        urgency: params.urgency,
        includeGasInfo: true,
        tokenOut: outputToken.resolved,
        tokenOutChainId: getNetworkConfig(params.tokenOutChain).chain.id,
      }
    : null;
  const approval = approvalRequest ? await checkUniswapApproval(approvalRequest) : null;

  return {
    execution,
    inputToken,
    outputToken,
    amount,
    approvalRequest,
    approval,
    quoteRequest,
    quote,
    routing,
    executable_routing: EXECUTABLE_UNISWAP_ROUTINGS.includes(routing as any),
  };
}

function getQuoteSummary(prepared: Awaited<ReturnType<typeof prepareUniswapRoute>>) {
  const quote = prepared.quote.quote as any;
  return {
    request_id: prepared.quote.requestId,
    routing: prepared.routing,
    executable_via_swap_endpoint: prepared.executable_routing,
    quote_id: quote.quoteId ?? null,
    route_string: quote.routeString ?? null,
    tx_failure_reasons: quote.txFailureReasons ?? [],
    price_impact_pct: quote.priceImpact ?? null,
    input: {
      token: prepared.inputToken.resolved,
      amount_raw: quote.input?.amount ?? (prepared.amount.specified_token === 'token_in' ? prepared.amount.raw.toString() : null),
      amount_formatted: prepared.amount.specified_token === 'token_in' ? prepared.amount.formatted : null,
    },
    output: {
      token: prepared.outputToken.resolved,
      amount_raw: quote.output?.amount ?? null,
      recipient: quote.output?.recipient ?? prepared.execution.swapper,
    },
    gas: {
      gas_fee: quote.gasFee ?? null,
      gas_fee_quote: quote.gasFeeQuote ?? null,
      gas_fee_usd: quote.gasFeeUSD ?? null,
      gas_use_estimate: quote.gasUseEstimate ?? null,
      gas_price: quote.gasPrice ?? null,
      max_fee_per_gas: quote.maxFeePerGas ?? null,
      max_priority_fee_per_gas: quote.maxPriorityFeePerGas ?? null,
    },
  };
}

function createSwapRequest(prepared: Awaited<ReturnType<typeof prepareUniswapRoute>>, deadline?: number) {
  const request: Record<string, unknown> = {
    quote: prepared.quote.quote,
    refreshGasPrice: true,
    simulateTransaction: true,
    safetyMode: 'SAFE',
    urgency: prepared.quoteRequest.urgency,
    deadline: deadline ?? Math.floor(Date.now() / 1000) + 1800,
  };

  if (prepared.quote.permitData) {
    request.permitData = prepared.quote.permitData;
  }

  return request;
}

async function submitUniswapTransaction(network: SupportedNetwork, transaction: any) {
  const { account, publicClient, walletClient } = getWalletContext(network);
  const hash = await walletClient.sendTransaction({
    account,
    to: getAddress(transaction.to),
    data: transaction.data as Hex,
    value: BigInt(transaction.value ?? '0'),
    ...(transaction.gasLimit ? { gas: BigInt(transaction.gasLimit) } : {}),
    ...(transaction.gasPrice ? { gasPrice: BigInt(transaction.gasPrice) } : {}),
    ...(transaction.maxFeePerGas ? { maxFeePerGas: BigInt(transaction.maxFeePerGas) } : {}),
    ...(transaction.maxPriorityFeePerGas ? { maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas) } : {}),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    transaction_hash: hash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}

export function getUniswapSetupSummary() {
  return {
    api_key_configured: hasUniswapApiKeyConfigured(),
    universal_router_version: getUniswapUniversalRouterVersion(),
    supported_networks: ['ethereum', 'base', 'optimism', 'arbitrum'],
    supported_routing_execution_modes: [...EXECUTABLE_UNISWAP_ROUTINGS],
    notes: [
      'This server uses x-permit2-disabled=true and follows a direct approval-then-swap flow.',
      'Uniswap API execution requires UNISWAP_API_KEY.',
      'Live execution is currently limited to routes returned as CLASSIC, BRIDGE, WRAP, or UNWRAP.',
    ],
  };
}

export async function preflightUniswapRoute(params: PreflightUniswapRouteParams) {
  try {
    const prepared = await prepareUniswapRoute(params);
    const blockers: string[] = [];
    const warnings: string[] = [];
    const nextSteps: string[] = [];

    if (prepared.approval?.cancel) {
      warnings.push('Token approval likely needs a reset transaction before the new approval can be sent.');
    }
    if (prepared.approval?.approval && !params.approveIfNeeded) {
      blockers.push('Approval is required but approve_if_needed=false.');
    }
    if (!prepared.executable_routing) {
      blockers.push(`Returned routing ${prepared.routing} is not currently executable through this server's gasful /swap flow.`);
      warnings.push('This usually means the route prefers UniswapX or a chained plan instead of a direct protocol swap or bridge transaction.');
    }
    if (!prepared.execution.local_execution_available) {
      warnings.push('The server can preflight this route, but live execution requires the configured wallet to match the swapper address.');
    }
    if ((prepared.quote.quote as any).txFailureReasons?.length) {
      warnings.push('The quote contains transaction failure reasons from Uniswap simulation output. Review them before execution.');
    }

    nextSteps.push('Run lido_execute_uniswap_route with dry_run=true to inspect the approval and swap transactions.');
    if (!blockers.length) {
      nextSteps.push('If the dry run matches intent, rerun lido_execute_uniswap_route with dry_run=false to broadcast the transaction(s).');
    }

    return {
      ready: blockers.length === 0,
      wallet: prepared.execution,
      amount: {
        specified_token: prepared.amount.specified_token,
        raw: prepared.amount.raw,
        formatted: prepared.amount.formatted,
        decimals: prepared.amount.decimals,
      },
      token_in: prepared.inputToken,
      token_out: prepared.outputToken,
      approval: prepared.approval,
      quote_request: prepared.quoteRequest,
      quote_summary: getQuoteSummary(prepared),
      blockers,
      warnings,
      next_steps: nextSteps,
    };
  } catch (error) {
    return {
      ready: false,
      blockers: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      next_steps: ['Fix the reported configuration or routing issue and rerun the preflight.'],
    };
  }
}

export async function executeUniswapRoute(params: ExecuteUniswapRouteParams) {
  const prepared = await prepareUniswapRoute(params);
  if (!prepared.executable_routing) {
    throw new Error(`Returned routing ${prepared.routing} is not currently executable by this server. Supported live routings: ${EXECUTABLE_UNISWAP_ROUTINGS.join(', ')}.`);
  }

  if (params.dryRun) {
    const swapRequest = createSwapRequest(prepared, params.deadline);
    const swap = await createUniswapSwap(swapRequest);
    return {
      mode: 'dry_run',
      wallet: prepared.execution,
      token_in: prepared.inputToken,
      token_out: prepared.outputToken,
      approval: prepared.approval,
      quote_summary: getQuoteSummary(prepared),
      swap_request: swap,
      notes: prepared.approval?.approval
        ? 'Approval is required before the swap or bridge transaction can succeed onchain.'
        : 'Swap or bridge transaction is ready for execution.',
    };
  }

  if (!prepared.execution.local_execution_available || !prepared.execution.configured_address) {
    throw new Error('Live execution requires a configured wallet whose address matches the swapper parameter.');
  }

  if (prepared.approval?.approval && !params.approveIfNeeded) {
    throw new Error('Approval is required but approve_if_needed=false.');
  }

  const sourceNetwork = params.tokenInChain;
  const executedApprovals: Array<Record<string, unknown>> = [];
  if (prepared.approval?.cancel) {
    executedApprovals.push({
      step: 'cancel_approval',
      ...(await submitUniswapTransaction(sourceNetwork, prepared.approval.cancel)),
    });
  }
  if (prepared.approval?.approval) {
    executedApprovals.push({
      step: 'approve',
      ...(await submitUniswapTransaction(sourceNetwork, prepared.approval.approval)),
    });
  }

  const refreshed = await prepareUniswapRoute(params);
  if (!refreshed.executable_routing) {
    throw new Error(`Refreshed routing ${refreshed.routing} is not currently executable by this server. Re-run preflight and review the new route.`);
  }

  const refreshedSwapRequest = createSwapRequest(refreshed, params.deadline);
  const refreshedSwap = await createUniswapSwap(refreshedSwapRequest);
  const swapExecution = await submitUniswapTransaction(sourceNetwork, refreshedSwap.swap);
  return {
    mode: 'executed',
    routing: refreshed.routing,
    source_network: sourceNetwork,
    destination_network: params.tokenOutChain,
    approvals: executedApprovals,
    swap_request_id: refreshedSwap.requestId,
    gas_fee: refreshedSwap.gasFee ?? null,
    swap: swapExecution,
    next_steps: refreshed.routing === 'BRIDGE'
      ? ['Use lido_get_uniswap_route_status with the source chain and returned transaction hash to monitor bridge progress.']
      : ['The route transaction has been broadcast and mined on the source chain.'],
  };
}

export async function getUniswapRouteStatus(params: GetUniswapRouteStatusParams) {
  const chainId = getNetworkConfig(params.chain).chain.id;
  return fetchUniswapSwapStatus(chainId, params.txHashes);
}

export async function getUniswapBridgableTokens(params: GetUniswapBridgableTokensParams) {
  const token = resolveTokenReference(params.tokenInChain, params.tokenIn);
  const chainId = getNetworkConfig(params.tokenInChain).chain.id;
  return fetchUniswapBridgableTokens(chainId, token);
}
