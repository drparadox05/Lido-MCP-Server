import { erc20Abi, formatEther, formatUnits } from 'viem';

import { STETH_ABI, WSTETH_ABI } from './abis.js';
import { getPublicClient, getQueryAddress } from './clients.js';
import { getNetworkConfig } from './networks.js';
import type { SupportedNetwork } from './types.js';

export async function getAccountOverview(network: SupportedNetwork, address?: string) {
  const config = getNetworkConfig(network);
  const publicClient = getPublicClient(network);
  const owner = getQueryAddress(address);

  const nativeBalancePromise = publicClient.getBalance({ address: owner });
  const stethBalancePromise = config.steth
    ? publicClient.readContract({
        address: config.steth,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      })
    : Promise.resolve(null);
  const sharesPromise = config.steth && config.supportsRewards
    ? publicClient.readContract({
        address: config.steth,
        abi: STETH_ABI,
        functionName: 'sharesOf',
        args: [owner],
      })
    : Promise.resolve(null);
  const wstethBalancePromise = config.wsteth
    ? publicClient.readContract({
        address: config.wsteth,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      })
    : Promise.resolve(null);

  const [nativeBalance, stethBalance, shares, wstethBalance] = await Promise.all([
    nativeBalancePromise,
    stethBalancePromise,
    sharesPromise,
    wstethBalancePromise,
  ]);

  let stEthPerToken: bigint | null = null;
  let tokensPerStEth: bigint | null = null;
  let wstethUnderlying: bigint | null = null;

  if (config.wsteth && config.supportsRewards) {
    [stEthPerToken, tokensPerStEth] = await Promise.all([
      publicClient.readContract({
        address: config.wsteth,
        abi: WSTETH_ABI,
        functionName: 'stEthPerToken',
      }),
      publicClient.readContract({
        address: config.wsteth,
        abi: WSTETH_ABI,
        functionName: 'tokensPerStEth',
      }),
    ]);

    if (wstethBalance !== null) {
      wstethUnderlying = await publicClient.readContract({
        address: config.wsteth,
        abi: WSTETH_ABI,
        functionName: 'getStETHByWstETH',
        args: [wstethBalance],
      });
    }
  }

  return {
    network,
    chain_id: config.chain.id,
    address: owner,
    native_balance: {
      raw: nativeBalance,
      formatted: formatEther(nativeBalance),
      symbol: config.chain.nativeCurrency.symbol,
    },
    steth_balance: stethBalance === null
      ? null
      : {
          raw: stethBalance,
          formatted: formatUnits(stethBalance, 18),
        },
    steth_shares: shares === null
      ? null
      : {
          raw: shares,
          formatted: formatUnits(shares, 18),
        },
    wsteth_balance: wstethBalance === null
      ? null
      : {
          raw: wstethBalance,
          formatted: formatUnits(wstethBalance, 18),
        },
    wsteth_underlying_steth: wstethUnderlying === null
      ? null
      : {
          raw: wstethUnderlying,
          formatted: formatUnits(wstethUnderlying, 18),
        },
    exchange_rate: stEthPerToken === null || tokensPerStEth === null
      ? null
      : {
          steth_per_wsteth: formatUnits(stEthPerToken, 18),
          wsteth_per_steth: formatUnits(tokensPerStEth, 18),
        },
    notes:
      network === 'ethereum'
        ? 'stETH is rebasing and wstETH is non-rebasing. Total stETH-equivalent exposure is stETH balance plus wstETH underlying.'
        : 'This network exposes bridged Lido tokens. Native staking, withdrawal queue actions, and governance voting execute on Ethereum.',
  };
}
