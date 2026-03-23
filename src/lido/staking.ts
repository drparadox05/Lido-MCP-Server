import { erc20Abi, formatUnits, parseEther, type Address, type Hex, zeroAddress } from 'viem';

import { STETH_ABI, WSTETH_ABI } from './abis.js';
import { getWalletContext, normalizeAddress } from './clients.js';
import type { StakeEthParams, UnwrapWstethParams, WrapStethParams, WritableNetwork } from './types.js';
import { ensureBalanceAtLeast, getAllowance, parseTokenAmount } from './utils.js';

async function simulateApprove(
  network: WritableNetwork,
  token: Address,
  spender: Address,
  amount: bigint,
  account: Address,
) {
  const { publicClient } = getWalletContext(network);
  return publicClient.simulateContract({
    account,
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
  });
}

export async function stakeEth(params: StakeEthParams) {
  const { network, amountEth, referral, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const value = parseEther(amountEth);
  const referralAddress = referral ? normalizeAddress(referral) : zeroAddress;

  const simulation = await publicClient.simulateContract({
    account: account.address,
    address: config.lido!,
    abi: STETH_ABI,
    functionName: 'submit',
    args: [referralAddress],
    value,
  });

  if (dryRun) {
    return {
      mode: 'dry_run',
      network,
      account: account.address,
      contract: config.lido,
      function: 'submit',
      amount_eth: amountEth,
      referral: referralAddress,
      request: {
        to: simulation.request.address,
        value: simulation.request.value,
      },
    };
  }

  const hash = await walletClient.writeContract({ ...simulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    mode: 'executed',
    network,
    account: account.address,
    amount_eth: amountEth,
    transaction_hash: hash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}

export async function wrapSteth(params: WrapStethParams) {
  const { network, amountSteth, approveIfNeeded, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const amount = parseTokenAmount(amountSteth, 'stETH');

  const [balance, allowance, expectedWstethOut] = await Promise.all([
    ensureBalanceAtLeast(publicClient, config.steth!, account.address, amount, 'stETH'),
    getAllowance(publicClient, config.steth!, account.address, config.wsteth!),
    publicClient.readContract({
      address: config.wsteth!,
      abi: WSTETH_ABI,
      functionName: 'getWstETHByStETH',
      args: [amount],
    }),
  ]);

  const needsApproval = allowance < amount;
  if (needsApproval && !approveIfNeeded) {
    throw new Error('stETH allowance is insufficient for wrapping and approve_if_needed is false.');
  }

  let approvalPreview: { to: Address; amount: bigint } | null = null;
  if (needsApproval) {
    const approvalSimulation = await simulateApprove(network, config.steth!, config.wsteth!, amount, account.address);
    approvalPreview = {
      to: approvalSimulation.request.address,
      amount,
    };
  }

  if (dryRun) {
    const wrapRequest = !needsApproval
      ? await publicClient.simulateContract({
          account: account.address,
          address: config.wsteth!,
          abi: WSTETH_ABI,
          functionName: 'wrap',
          args: [amount],
        })
      : null;

    return {
      mode: 'dry_run',
      network,
      account: account.address,
      amount_steth: amountSteth,
      expected_wsteth_out: formatUnits(expectedWstethOut, 18),
      current_steth_balance: formatUnits(balance, 18),
      current_allowance: formatUnits(allowance, 18),
      needs_approval: needsApproval,
      approval_request: approvalPreview,
      wrap_request: wrapRequest
        ? {
            to: wrapRequest.request.address,
            function: 'wrap',
          }
        : null,
      notes: needsApproval
        ? 'An approval transaction must be mined before the wrap call can be simulated against current chain state.'
        : 'Wrap call is ready to execute.',
    };
  }

  let approvalHash: Hex | null = null;
  if (needsApproval) {
    const approvalSimulation = await simulateApprove(network, config.steth!, config.wsteth!, amount, account.address);
    approvalHash = await walletClient.writeContract({ ...approvalSimulation.request, account });
    await publicClient.waitForTransactionReceipt({ hash: approvalHash });
  }

  const wrapSimulation = await publicClient.simulateContract({
    account: account.address,
    address: config.wsteth!,
    abi: WSTETH_ABI,
    functionName: 'wrap',
    args: [amount],
  });
  const wrapHash = await walletClient.writeContract({ ...wrapSimulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: wrapHash });

  return {
    mode: 'executed',
    network,
    account: account.address,
    amount_steth: amountSteth,
    expected_wsteth_out: formatUnits(expectedWstethOut, 18),
    approval_transaction_hash: approvalHash,
    wrap_transaction_hash: wrapHash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}

export async function unwrapWsteth(params: UnwrapWstethParams) {
  const { network, amountWsteth, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const amount = parseTokenAmount(amountWsteth, 'wstETH');

  const [balance, expectedStethOut] = await Promise.all([
    ensureBalanceAtLeast(publicClient, config.wsteth!, account.address, amount, 'wstETH'),
    publicClient.readContract({
      address: config.wsteth!,
      abi: WSTETH_ABI,
      functionName: 'getStETHByWstETH',
      args: [amount],
    }),
  ]);

  const simulation = await publicClient.simulateContract({
    account: account.address,
    address: config.wsteth!,
    abi: WSTETH_ABI,
    functionName: 'unwrap',
    args: [amount],
  });

  if (dryRun) {
    return {
      mode: 'dry_run',
      network,
      account: account.address,
      amount_wsteth: amountWsteth,
      current_wsteth_balance: formatUnits(balance, 18),
      expected_steth_out: formatUnits(expectedStethOut, 18),
      request: {
        to: simulation.request.address,
        function: 'unwrap',
      },
    };
  }

  const hash = await walletClient.writeContract({ ...simulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    mode: 'executed',
    network,
    account: account.address,
    amount_wsteth: amountWsteth,
    expected_steth_out: formatUnits(expectedStethOut, 18),
    transaction_hash: hash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}
