import { erc20Abi, formatUnits } from 'viem';

import { STETH_ABI, WSTETH_ABI } from './abis.js';
import { getPublicClient, getQueryAddress } from './clients.js';
import { getNetworkConfig, requireWritableNetwork } from './networks.js';
import type { SupportedNetwork } from './types.js';

export async function getRewards(network: SupportedNetwork, address?: string, fromBlock?: number) {
  const writableNetwork = requireWritableNetwork(network);
  const config = getNetworkConfig(writableNetwork);
  const publicClient = getPublicClient(writableNetwork);
  const owner = getQueryAddress(address);
  const latestBlock = await publicClient.getBlockNumber();

  const currentStethBalance = await publicClient.readContract({
    address: config.steth!,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
  const currentWstethBalance = await publicClient.readContract({
    address: config.wsteth!,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
  const [currentShares, currentRate] = await Promise.all([
    publicClient.readContract({
      address: config.steth!,
      abi: STETH_ABI,
      functionName: 'sharesOf',
      args: [owner],
    }),
    publicClient.readContract({
      address: config.wsteth!,
      abi: WSTETH_ABI,
      functionName: 'stEthPerToken',
    }),
  ]);
  const currentWstethUnderlying = await publicClient.readContract({
    address: config.wsteth!,
    abi: WSTETH_ABI,
    functionName: 'getStETHByWstETH',
    args: [currentWstethBalance],
  });
  const currentTotal = currentStethBalance + currentWstethUnderlying;

  if (fromBlock === undefined) {
    return {
      network,
      address: owner,
      latest_block: latestBlock,
      current_position: {
        steth_balance: formatUnits(currentStethBalance, 18),
        steth_shares: formatUnits(currentShares, 18),
        wsteth_balance: formatUnits(currentWstethBalance, 18),
        wsteth_underlying_steth: formatUnits(currentWstethUnderlying, 18),
        total_steth_equivalent: formatUnits(currentTotal, 18),
      },
      exchange_rate: {
        steth_per_wsteth: formatUnits(currentRate, 18),
      },
      notes:
        'To calculate a net on-chain delta across time, provide from_block. The delta is exact for the address balance path, but if the address transferred tokens in or out during the interval it is not pure staking reward.',
    };
  }

  const historicalBlock = BigInt(fromBlock);
  if (historicalBlock >= latestBlock) {
    throw new Error(`from_block must be less than the latest block (${latestBlock}).`);
  }

  let historicalStethBalance: bigint;
  let historicalWstethBalance: bigint;
  let historicalRate: bigint;

  try {
    [historicalStethBalance, historicalWstethBalance, historicalRate] = await Promise.all([
      publicClient.readContract({
        address: config.steth!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
        blockNumber: historicalBlock,
      }),
      publicClient.readContract({
        address: config.wsteth!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
        blockNumber: historicalBlock,
      }),
      publicClient.readContract({
        address: config.wsteth!,
        abi: WSTETH_ABI,
        functionName: 'stEthPerToken',
        blockNumber: historicalBlock,
      }),
    ]);
  } catch (error) {
    throw new Error(
      `Historical reward queries require an RPC provider that supports archive reads. Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const historicalWstethUnderlying = await publicClient.readContract({
    address: config.wsteth!,
    abi: WSTETH_ABI,
    functionName: 'getStETHByWstETH',
    args: [historicalWstethBalance],
    blockNumber: historicalBlock,
  });
  const historicalTotal = historicalStethBalance + historicalWstethUnderlying;

  const netPositionDelta = BigInt(currentTotal) - BigInt(historicalTotal);
  const exchangeRateDelta = BigInt(currentRate) - BigInt(historicalRate);

  return {
    network,
    address: owner,
    latest_block: latestBlock,
    from_block: historicalBlock,
    current_total_steth_equivalent: formatUnits(currentTotal, 18),
    historical_total_steth_equivalent: formatUnits(historicalTotal, 18),
    net_position_delta_steth: formatUnits(netPositionDelta, 18),
    wsteth_exchange_rate_delta_steth_per_token: formatUnits(exchangeRateDelta, 18),
    interpretation:
      'Treat net_position_delta_steth as rewards only if the address did not receive or send stETH/wstETH during the interval. Otherwise it is the net position change across the interval.',
  };
}
