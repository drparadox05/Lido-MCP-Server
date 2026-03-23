import { erc20Abi, formatEther, formatUnits, type Address, type Hex } from 'viem';

import { WITHDRAWAL_QUEUE_ABI } from './abis.js';
import { getPublicClient, getQueryAddress, getWalletContext, normalizeAddress } from './clients.js';
import { getNetworkConfig } from './networks.js';
import type { ClaimWithdrawalsParams, RequestUnstakeParams, WritableNetwork } from './types.js';
import { ensureBalanceAtLeast, getAllowance, parseTokenAmount, toBigIntIds } from './utils.js';

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

export async function requestUnstake(params: RequestUnstakeParams) {
  const { network, token, amounts, owner, approveIfNeeded, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const parsedAmounts = amounts.map((amount) => parseTokenAmount(amount, token));
  const totalAmount = parsedAmounts.reduce((sum, value) => sum + value, 0n);
  const ownerAddress = owner ? normalizeAddress(owner) : account.address;
  const tokenAddress = token === 'steth' ? config.steth! : config.wsteth!;
  const functionName = token === 'steth' ? 'requestWithdrawals' : 'requestWithdrawalsWstETH';

  const [balance, allowance, requestsBefore] = await Promise.all([
    ensureBalanceAtLeast(publicClient, tokenAddress, account.address, totalAmount, token),
    getAllowance(publicClient, tokenAddress, account.address, config.withdrawalQueue!),
    publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'getWithdrawalRequests',
      args: [ownerAddress],
    }),
  ]);

  const needsApproval = allowance < totalAmount;
  if (needsApproval && !approveIfNeeded) {
    throw new Error(`${token} allowance is insufficient for the withdrawal queue and approve_if_needed is false.`);
  }

  let approvalPreview: { to: Address; amount: bigint } | null = null;
  if (needsApproval) {
    const approvalSimulation = await simulateApprove(network, tokenAddress, config.withdrawalQueue!, totalAmount, account.address);
    approvalPreview = {
      to: approvalSimulation.request.address,
      amount: totalAmount,
    };
  }

  if (dryRun) {
    let requestPreview: { to: Address; function: string; predicted_request_ids?: bigint[] } | null = null;
    if (!needsApproval) {
      const simulation = token === 'steth'
        ? await publicClient.simulateContract({
            account: account.address,
            address: config.withdrawalQueue!,
            abi: WITHDRAWAL_QUEUE_ABI,
            functionName: 'requestWithdrawals',
            args: [parsedAmounts, ownerAddress],
          })
        : await publicClient.simulateContract({
            account: account.address,
            address: config.withdrawalQueue!,
            abi: WITHDRAWAL_QUEUE_ABI,
            functionName: 'requestWithdrawalsWstETH',
            args: [parsedAmounts, ownerAddress],
          });

      requestPreview = {
        to: simulation.request.address,
        function: functionName,
        predicted_request_ids: Array.isArray(simulation.result) ? simulation.result : undefined,
      };
    }

    return {
      mode: 'dry_run',
      network,
      account: account.address,
      token,
      owner: ownerAddress,
      amounts,
      total_amount: formatUnits(totalAmount, 18),
      current_balance: formatUnits(balance, 18),
      current_allowance: formatUnits(allowance, 18),
      existing_request_ids: requestsBefore,
      needs_approval: needsApproval,
      approval_request: approvalPreview,
      unstake_request: requestPreview,
      notes: needsApproval
        ? 'An approval transaction must be mined before the withdrawal request can be simulated against current chain state.'
        : 'Withdrawal request is ready to execute. Final ETH becomes claimable only after queue finalization.',
    };
  }

  let approvalHash: Hex | null = null;
  if (needsApproval) {
    const approvalSimulation = await simulateApprove(network, tokenAddress, config.withdrawalQueue!, totalAmount, account.address);
    approvalHash = await walletClient.writeContract({ ...approvalSimulation.request, account });
    await publicClient.waitForTransactionReceipt({ hash: approvalHash });
  }

  const requestSimulation = token === 'steth'
    ? await publicClient.simulateContract({
        account: account.address,
        address: config.withdrawalQueue!,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: 'requestWithdrawals',
        args: [parsedAmounts, ownerAddress],
      })
    : await publicClient.simulateContract({
        account: account.address,
        address: config.withdrawalQueue!,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: 'requestWithdrawalsWstETH',
        args: [parsedAmounts, ownerAddress],
      });

  const unstakeHash = await walletClient.writeContract({ ...requestSimulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: unstakeHash });
  const requestsAfter = await publicClient.readContract({
    address: config.withdrawalQueue!,
    abi: WITHDRAWAL_QUEUE_ABI,
    functionName: 'getWithdrawalRequests',
    args: [ownerAddress],
  });
  const requestsBeforeSet = new Set(requestsBefore.map((id: bigint) => id.toString()));
  const newRequestIds = requestsAfter.filter((id: bigint) => !requestsBeforeSet.has(id.toString()));

  return {
    mode: 'executed',
    network,
    account: account.address,
    token,
    owner: ownerAddress,
    amounts,
    total_amount: formatUnits(totalAmount, 18),
    approval_transaction_hash: approvalHash,
    unstake_transaction_hash: unstakeHash,
    created_request_ids: newRequestIds,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}

export async function getWithdrawalRequests(network: WritableNetwork, owner?: string) {
  const config = getNetworkConfig(network);
  const publicClient = getPublicClient(network);
  const resolvedOwner = getQueryAddress(owner);

  const [requestIds, bunkerModeActive, lastCheckpointIndex] = await Promise.all([
    publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'getWithdrawalRequests',
      args: [resolvedOwner],
    }),
    publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'isBunkerModeActive',
    }),
    publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'getLastCheckpointIndex',
    }),
  ]);

  if (requestIds.length === 0) {
    return {
      network,
      owner: resolvedOwner,
      bunker_mode_active: bunkerModeActive,
      last_checkpoint_index: lastCheckpointIndex,
      requests: [],
    };
  }

  const sortedIds = [...requestIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const statuses = await publicClient.readContract({
    address: config.withdrawalQueue!,
    abi: WITHDRAWAL_QUEUE_ABI,
    functionName: 'getWithdrawalStatus',
    args: [sortedIds],
  });

  const hints = await publicClient.readContract({
    address: config.withdrawalQueue!,
    abi: WITHDRAWAL_QUEUE_ABI,
    functionName: 'findCheckpointHints',
    args: [sortedIds, 1n, lastCheckpointIndex],
  });

  const claimable = await publicClient.readContract({
    address: config.withdrawalQueue!,
    abi: WITHDRAWAL_QUEUE_ABI,
    functionName: 'getClaimableEther',
    args: [sortedIds, hints],
  });

  return {
    network,
    owner: resolvedOwner,
    bunker_mode_active: bunkerModeActive,
    last_checkpoint_index: lastCheckpointIndex,
    requests: sortedIds.map((requestId, index) => ({
      request_id: requestId,
      owner: statuses[index].owner,
      amount_steth: formatUnits(statuses[index].amountOfStETH, 18),
      amount_shares: formatUnits(statuses[index].amountOfShares, 18),
      created_at_unix: statuses[index].timestamp,
      is_finalized: statuses[index].isFinalized,
      is_claimed: statuses[index].isClaimed,
      claimable_eth: formatEther(claimable[index]),
      hint: hints[index],
    })),
  };
}

export async function claimWithdrawals(params: ClaimWithdrawalsParams) {
  const { network, requestIds, recipient, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const sortedIds = toBigIntIds(requestIds).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const recipientAddress = recipient ? normalizeAddress(recipient) : null;

  const lastCheckpointIndex = await publicClient.readContract({
    address: config.withdrawalQueue!,
    abi: WITHDRAWAL_QUEUE_ABI,
    functionName: 'getLastCheckpointIndex',
  });

  if (lastCheckpointIndex === 0n) {
    throw new Error('No finalized withdrawal checkpoints exist yet. Nothing can be claimed.');
  }

  const hints = await publicClient.readContract({
    address: config.withdrawalQueue!,
    abi: WITHDRAWAL_QUEUE_ABI,
    functionName: 'findCheckpointHints',
    args: [sortedIds, 1n, lastCheckpointIndex],
  });

  const [statuses, claimable] = await Promise.all([
    publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'getWithdrawalStatus',
      args: [sortedIds],
    }),
    publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'getClaimableEther',
      args: [sortedIds, hints],
    }),
  ]);

  const totalClaimable = claimable.reduce((sum: bigint, value: bigint) => sum + value, 0n);
  if (totalClaimable === 0n) {
    throw new Error('None of the provided request ids are currently claimable.');
  }

  const invalidOwners = statuses.filter(
    (status: { owner: Address }) => status.owner.toLowerCase() !== account.address.toLowerCase(),
  );
  if (invalidOwners.length > 0) {
    throw new Error('The configured wallet is not the owner of all provided withdrawal requests.');
  }

  const simulation = recipientAddress
    ? await publicClient.simulateContract({
        account: account.address,
        address: config.withdrawalQueue!,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: 'claimWithdrawalsTo',
        args: [sortedIds, hints, recipientAddress],
      })
    : await publicClient.simulateContract({
        account: account.address,
        address: config.withdrawalQueue!,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: 'claimWithdrawals',
        args: [sortedIds, hints],
      });

  if (dryRun) {
    return {
      mode: 'dry_run',
      network,
      account: account.address,
      request_ids: sortedIds,
      recipient: recipientAddress ?? account.address,
      total_claimable_eth: formatEther(totalClaimable),
      requests: sortedIds.map((requestId, index) => ({
        request_id: requestId,
        owner: statuses[index].owner,
        is_finalized: statuses[index].isFinalized,
        is_claimed: statuses[index].isClaimed,
        claimable_eth: formatEther(claimable[index]),
        hint: hints[index],
      })),
      request: {
        to: simulation.request.address,
        function: recipientAddress ? 'claimWithdrawalsTo' : 'claimWithdrawals',
      },
    };
  }

  const hash = await walletClient.writeContract({ ...simulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    mode: 'executed',
    network,
    account: account.address,
    recipient: recipientAddress ?? account.address,
    request_ids: sortedIds,
    total_claimable_eth: formatEther(totalClaimable),
    transaction_hash: hash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}
