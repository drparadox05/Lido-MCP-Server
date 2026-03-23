import type { Address } from 'viem';
import { erc20Abi, formatUnits, getAddress, parseUnits } from 'viem';

export function parseTokenAmount(amount: string, symbol: string): bigint {
  try {
    return parseUnits(amount, 18);
  } catch {
    throw new Error(`Invalid ${symbol} amount: ${amount}`);
  }
}

export function toBigIntIds(ids: Array<number | string>): bigint[] {
  return ids.map((id) => {
    const asString = String(id);
    if (!/^\d+$/.test(asString)) {
      throw new Error(`Invalid numeric id: ${asString}`);
    }

    return BigInt(asString);
  });
}

export function formatPct(value: bigint): string {
  return (Number(value) / 1e16).toFixed(2);
}

export function mapVoterState(value: number | bigint): 'absent' | 'yea' | 'nay' {
  const state = Number(value);
  if (state === 1) {
    return 'yea';
  }

  if (state === 2) {
    return 'nay';
  }

  return 'absent';
}

export async function ensureBalanceAtLeast(
  publicClient: any,
  token: Address,
  owner: Address,
  required: bigint,
  symbol: string,
) {
  const balance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });

  if (balance < required) {
    throw new Error(`Insufficient ${symbol} balance. Required ${formatUnits(required, 18)}, current ${formatUnits(balance, 18)}.`);
  }

  return balance;
}

export async function getAllowance(publicClient: any, token: Address, owner: Address, spender: Address) {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

export function normalizeAddress(value: string): Address {
  return getAddress(value);
}
