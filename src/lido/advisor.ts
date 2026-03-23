import { erc20Abi, formatEther, formatUnits, parseEther, type Address } from 'viem';

import { hasPrivateKeyConfigured } from '../config/env.js';
import { VOTING_ABI, WSTETH_ABI, WITHDRAWAL_QUEUE_ABI } from './abis.js';
import { getAccountOverview } from './account.js';
import { getAccount, getPublicClient, normalizeAddress } from './clients.js';
import { getGovernanceProposals } from './governance.js';
import { getNetworkConfig } from './networks.js';
import type { PortfolioSummaryParams, PreflightWriteActionParams, WritableNetwork } from './types.js';
import { parseTokenAmount, toBigIntIds } from './utils.js';
import type { WriteAction } from './types.js';
import { getWithdrawalRequests } from './withdrawals.js';

type CheckStatus = 'pass' | 'fail' | 'warn';

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
};

function getSignerContext() {
  if (!hasPrivateKeyConfigured()) {
    return {
      configured: false,
      address: null,
      error: 'No private key configured. Set LIDO_PRIVATE_KEY, WALLET_PRIVATE_KEY, or PRIVATE_KEY.',
    };
  }

  try {
    return {
      configured: true,
      address: getAccount().address,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      address: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function requireSummaryAddress(address?: string): Address {
  if (address) {
    return normalizeAddress(address);
  }

  const signer = getSignerContext();
  if (!signer.address) {
    throw new Error('Provide address explicitly or configure a wallet private key before requesting a portfolio summary.');
  }

  return signer.address;
}

function pushCheck(checks: Check[], blockers: string[], name: string, status: CheckStatus, detail: string) {
  checks.push({ name, status, detail });
  if (status === 'fail') {
    blockers.push(detail);
  }
}

function finalizePreflight(action: WriteAction, network: WritableNetwork, signer: ReturnType<typeof getSignerContext>, checks: Check[], blockers: string[], details: Record<string, unknown>, nextSteps: string[]) {
  return {
    network,
    action,
    wallet: signer,
    ready: blockers.length === 0,
    checks,
    blockers,
    next_steps: nextSteps,
    details,
  };
}

export async function preflightWriteAction(params: PreflightWriteActionParams) {
  const {
    network,
    action,
    amountEth,
    amountSteth,
    amountWsteth,
    token,
    amounts,
    owner,
    recipient,
    requestIds,
    voteId,
    support,
    executesIfDecided,
    referral,
    approveIfNeeded,
  } = params;

  const signer = getSignerContext();
  const checks: Check[] = [];
  const blockers: string[] = [];
  const nextSteps: string[] = [];
  const config = getNetworkConfig(network);
  const publicClient = getPublicClient(network);

  pushCheck(
    checks,
    blockers,
    'wallet_configured',
    signer.address ? 'pass' : 'fail',
    signer.address ? `Signer ${signer.address} is available for write preflight.` : signer.error ?? 'No signer is configured.',
  );

  if (action === 'stake') {
    if (!amountEth) {
      pushCheck(checks, blockers, 'amount_eth', 'fail', 'Provide amount_eth for stake preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    if (!signer.address) {
      return finalizePreflight(action, network, signer, checks, blockers, { amount_eth: amountEth }, nextSteps);
    }

    let value: bigint;
    try {
      value = parseEther(amountEth);
      pushCheck(checks, blockers, 'amount_eth', 'pass', `Stake amount ${amountEth} ETH is valid.`);
    } catch {
      pushCheck(checks, blockers, 'amount_eth', 'fail', `Invalid ETH amount: ${amountEth}.`);
      return finalizePreflight(action, network, signer, checks, blockers, { amount_eth: amountEth }, nextSteps);
    }

    const balance = await publicClient.getBalance({ address: signer.address });
    pushCheck(
      checks,
      blockers,
      'eth_balance',
      balance >= value ? 'pass' : 'fail',
      balance >= value
        ? `Wallet has enough ETH for the requested stake amount (${formatEther(balance)} ETH available).`
        : `Insufficient ETH balance. Need ${amountEth} ETH plus gas, current balance is ${formatEther(balance)} ETH.`,
    );
    nextSteps.push('Run lido_stake_eth with dry_run=true to inspect the final transaction request.');

    return finalizePreflight(action, network, signer, checks, blockers, {
      amount_eth: amountEth,
      referral: referral ?? null,
      available_eth: formatEther(balance),
    }, nextSteps);
  }

  if (action === 'wrap') {
    if (!amountSteth) {
      pushCheck(checks, blockers, 'amount_steth', 'fail', 'Provide amount_steth for wrap preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    if (!signer.address) {
      return finalizePreflight(action, network, signer, checks, blockers, { amount_steth: amountSteth }, nextSteps);
    }

    let amount: bigint;
    try {
      amount = parseTokenAmount(amountSteth, 'stETH');
      pushCheck(checks, blockers, 'amount_steth', 'pass', `Wrap amount ${amountSteth} stETH is valid.`);
    } catch {
      pushCheck(checks, blockers, 'amount_steth', 'fail', `Invalid stETH amount: ${amountSteth}.`);
      return finalizePreflight(action, network, signer, checks, blockers, { amount_steth: amountSteth }, nextSteps);
    }

    const [balance, allowance, expectedOut] = await Promise.all([
      publicClient.readContract({ address: config.steth!, abi: erc20Abi, functionName: 'balanceOf', args: [signer.address] }),
      publicClient.readContract({
        address: config.steth!,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [signer.address, config.wsteth!],
      }),
      publicClient.readContract({
        address: config.wsteth!,
        abi: WSTETH_ABI,
        functionName: 'getWstETHByStETH',
        args: [amount],
      }),
    ]);

    pushCheck(
      checks,
      blockers,
      'steth_balance',
      balance >= amount ? 'pass' : 'fail',
      balance >= amount
        ? `Wallet has enough stETH (${formatUnits(balance, 18)} available).`
        : `Insufficient stETH balance. Need ${amountSteth}, current balance is ${formatUnits(balance, 18)}.`,
    );

    const approvalStatus: CheckStatus = allowance >= amount ? 'pass' : approveIfNeeded ? 'warn' : 'fail';
    const approvalDetail = allowance >= amount
      ? `Allowance is already sufficient (${formatUnits(allowance, 18)} approved).`
      : approveIfNeeded
        ? 'Allowance is insufficient, but approve_if_needed=true so the live path can send approval first.'
        : 'Allowance is insufficient and approve_if_needed=false.';
    pushCheck(checks, blockers, 'allowance', approvalStatus, approvalDetail);
    if (allowance < amount) {
      nextSteps.push('Run lido_wrap_steth with approve_if_needed=true and dry_run=true to inspect the approval-plus-wrap path.');
    } else {
      nextSteps.push('Run lido_wrap_steth with dry_run=true to inspect the wrap transaction request.');
    }

    return finalizePreflight(action, network, signer, checks, blockers, {
      amount_steth: amountSteth,
      current_steth_balance: formatUnits(balance, 18),
      current_allowance: formatUnits(allowance, 18),
      expected_wsteth_out: formatUnits(expectedOut, 18),
      approval_required: allowance < amount,
    }, nextSteps);
  }

  if (action === 'unwrap') {
    if (!amountWsteth) {
      pushCheck(checks, blockers, 'amount_wsteth', 'fail', 'Provide amount_wsteth for unwrap preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    if (!signer.address) {
      return finalizePreflight(action, network, signer, checks, blockers, { amount_wsteth: amountWsteth }, nextSteps);
    }

    let amount: bigint;
    try {
      amount = parseTokenAmount(amountWsteth, 'wstETH');
      pushCheck(checks, blockers, 'amount_wsteth', 'pass', `Unwrap amount ${amountWsteth} wstETH is valid.`);
    } catch {
      pushCheck(checks, blockers, 'amount_wsteth', 'fail', `Invalid wstETH amount: ${amountWsteth}.`);
      return finalizePreflight(action, network, signer, checks, blockers, { amount_wsteth: amountWsteth }, nextSteps);
    }

    const [balance, expectedOut] = await Promise.all([
      publicClient.readContract({ address: config.wsteth!, abi: erc20Abi, functionName: 'balanceOf', args: [signer.address] }),
      publicClient.readContract({
        address: config.wsteth!,
        abi: WSTETH_ABI,
        functionName: 'getStETHByWstETH',
        args: [amount],
      }),
    ]);

    pushCheck(
      checks,
      blockers,
      'wsteth_balance',
      balance >= amount ? 'pass' : 'fail',
      balance >= amount
        ? `Wallet has enough wstETH (${formatUnits(balance, 18)} available).`
        : `Insufficient wstETH balance. Need ${amountWsteth}, current balance is ${formatUnits(balance, 18)}.`,
    );
    nextSteps.push('Run lido_unwrap_wsteth with dry_run=true to inspect the unwrap transaction request.');

    return finalizePreflight(action, network, signer, checks, blockers, {
      amount_wsteth: amountWsteth,
      current_wsteth_balance: formatUnits(balance, 18),
      expected_steth_out: formatUnits(expectedOut, 18),
    }, nextSteps);
  }

  if (action === 'request_unstake') {
    if (!token || !amounts || amounts.length === 0) {
      pushCheck(checks, blockers, 'amounts', 'fail', 'Provide token plus at least one amount for request_unstake preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    if (!signer.address) {
      return finalizePreflight(action, network, signer, checks, blockers, { token, amounts }, nextSteps);
    }

    let parsedAmounts: bigint[];
    try {
      parsedAmounts = amounts.map((value) => parseTokenAmount(value, token));
      pushCheck(checks, blockers, 'amounts', 'pass', `Validated ${amounts.length} withdrawal request amount(s).`);
    } catch {
      pushCheck(checks, blockers, 'amounts', 'fail', 'One or more unstake amounts are invalid.');
      return finalizePreflight(action, network, signer, checks, blockers, { token, amounts }, nextSteps);
    }

    const totalAmount = parsedAmounts.reduce((sum, value) => sum + value, 0n);
    const tokenAddress = token === 'steth' ? config.steth! : config.wsteth!;
    const ownerAddress = owner ? normalizeAddress(owner) : signer.address;
    const [balance, allowance, existingRequests] = await Promise.all([
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [signer.address] }),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [signer.address, config.withdrawalQueue!],
      }),
      publicClient.readContract({
        address: config.withdrawalQueue!,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: 'getWithdrawalRequests',
        args: [ownerAddress],
      }),
    ]);

    pushCheck(
      checks,
      blockers,
      `${token}_balance`,
      balance >= totalAmount ? 'pass' : 'fail',
      balance >= totalAmount
        ? `Wallet has enough ${token} (${formatUnits(balance, 18)} available).`
        : `Insufficient ${token} balance. Need ${formatUnits(totalAmount, 18)}, current balance is ${formatUnits(balance, 18)}.`,
    );
    const approvalStatus: CheckStatus = allowance >= totalAmount ? 'pass' : approveIfNeeded ? 'warn' : 'fail';
    pushCheck(
      checks,
      blockers,
      'allowance',
      approvalStatus,
      allowance >= totalAmount
        ? `Allowance is already sufficient (${formatUnits(allowance, 18)} approved).`
        : approveIfNeeded
          ? 'Allowance is insufficient, but approve_if_needed=true so the live path can send approval first.'
          : 'Allowance is insufficient and approve_if_needed=false.',
    );
    nextSteps.push('Run lido_request_unstake with dry_run=true to inspect the queue request path.');

    return finalizePreflight(action, network, signer, checks, blockers, {
      token,
      amounts,
      total_amount: formatUnits(totalAmount, 18),
      owner: ownerAddress,
      current_balance: formatUnits(balance, 18),
      current_allowance: formatUnits(allowance, 18),
      existing_request_count: existingRequests.length,
      approval_required: allowance < totalAmount,
    }, nextSteps);
  }

  if (action === 'claim_withdrawals') {
    if (!requestIds || requestIds.length === 0) {
      pushCheck(checks, blockers, 'request_ids', 'fail', 'Provide request_ids for claim_withdrawals preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    const sortedIds = toBigIntIds(requestIds).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const recipientAddress = recipient ? normalizeAddress(recipient) : null;
    const lastCheckpointIndex = await publicClient.readContract({
      address: config.withdrawalQueue!,
      abi: WITHDRAWAL_QUEUE_ABI,
      functionName: 'getLastCheckpointIndex',
    });

    pushCheck(
      checks,
      blockers,
      'finalized_checkpoints',
      lastCheckpointIndex > 0n ? 'pass' : 'fail',
      lastCheckpointIndex > 0n
        ? `Withdrawal queue has finalized checkpoints up to index ${lastCheckpointIndex}.`
        : 'No finalized withdrawal checkpoints exist yet.',
    );

    if (lastCheckpointIndex === 0n) {
      return finalizePreflight(action, network, signer, checks, blockers, { request_ids: sortedIds }, nextSteps);
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
    pushCheck(
      checks,
      blockers,
      'claimable_eth',
      totalClaimable > 0n ? 'pass' : 'fail',
      totalClaimable > 0n
        ? `${formatEther(totalClaimable)} ETH is currently claimable for the provided request ids.`
        : 'None of the provided request ids are currently claimable.',
    );

    if (!signer.address) {
      nextSteps.push('Configure a wallet private key so ownership checks and the actual claim can be performed.');
      return finalizePreflight(action, network, signer, checks, blockers, {
        request_ids: sortedIds,
        recipient: recipientAddress,
        total_claimable_eth: formatEther(totalClaimable),
      }, nextSteps);
    }

    const wrongOwnerCount = statuses.filter((status: { owner: Address }) => status.owner.toLowerCase() !== signer.address!.toLowerCase()).length;
    pushCheck(
      checks,
      blockers,
      'request_ownership',
      wrongOwnerCount === 0 ? 'pass' : 'fail',
      wrongOwnerCount === 0
        ? 'Configured wallet owns all provided withdrawal requests.'
        : 'Configured wallet does not own all provided withdrawal requests.',
    );
    nextSteps.push('Run lido_claim_withdrawals with dry_run=true to inspect the claim transaction request.');

    return finalizePreflight(action, network, signer, checks, blockers, {
      request_ids: sortedIds,
      recipient: recipientAddress ?? signer.address,
      total_claimable_eth: formatEther(totalClaimable),
      requests: sortedIds.map((requestId, index) => ({
        request_id: requestId,
        owner: statuses[index].owner,
        is_finalized: statuses[index].isFinalized,
        is_claimed: statuses[index].isClaimed,
        claimable_eth: formatEther(claimable[index]),
      })),
    }, nextSteps);
  }

  if (action === 'vote_on_proposal') {
    if (voteId === undefined) {
      pushCheck(checks, blockers, 'vote_id', 'fail', 'Provide vote_id for vote_on_proposal preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    if (support === undefined) {
      pushCheck(checks, blockers, 'support', 'fail', 'Provide support=true or support=false for vote_on_proposal preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, { vote_id: voteId }, nextSteps);
    }

    const voteIdBigInt = BigInt(voteId);
    const vote = await publicClient.readContract({
      address: config.voting!,
      abi: VOTING_ABI,
      functionName: 'getVote',
      args: [voteIdBigInt],
    });
    pushCheck(
      checks,
      blockers,
      'vote_open',
      vote[0] ? 'pass' : 'fail',
      vote[0] ? 'Proposal is currently open for voting.' : 'Proposal is not currently open for voting.',
    );

    if (!signer.address) {
      nextSteps.push('Configure a wallet private key so voter eligibility can be checked.');
      return finalizePreflight(action, network, signer, checks, blockers, {
        vote_id: voteIdBigInt,
        support,
        executes_if_decided: executesIfDecided ?? false,
      }, nextSteps);
    }

    const [canVote, voterState, ldoBalance] = await Promise.all([
      publicClient.readContract({
        address: config.voting!,
        abi: VOTING_ABI,
        functionName: 'canVote',
        args: [voteIdBigInt, signer.address],
      }),
      publicClient.readContract({
        address: config.voting!,
        abi: VOTING_ABI,
        functionName: 'getVoterState',
        args: [voteIdBigInt, signer.address],
      }),
      publicClient.readContract({
        address: config.ldo!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [signer.address],
      }),
    ]);
    pushCheck(
      checks,
      blockers,
      'voter_eligibility',
      canVote ? 'pass' : 'fail',
      canVote ? 'Configured wallet can vote on this proposal.' : 'Configured wallet cannot vote on this proposal at the current snapshot/state.',
    );
    nextSteps.push('Run lido_vote_on_proposal with dry_run=true to inspect the governance vote transaction request.');

    return finalizePreflight(action, network, signer, checks, blockers, {
      vote_id: voteIdBigInt,
      support,
      executes_if_decided: executesIfDecided ?? false,
      current_ldo_balance: formatUnits(ldoBalance, 18),
      current_voter_state: Number(voterState),
      proposal_open: vote[0],
    }, nextSteps);
  }

  if (action === 'execute_proposal') {
    if (voteId === undefined) {
      pushCheck(checks, blockers, 'vote_id', 'fail', 'Provide vote_id for execute_proposal preflight.');
      return finalizePreflight(action, network, signer, checks, blockers, {}, nextSteps);
    }

    const voteIdBigInt = BigInt(voteId);
    const canExecute = await publicClient.readContract({
      address: config.voting!,
      abi: VOTING_ABI,
      functionName: 'canExecute',
      args: [voteIdBigInt],
    });
    pushCheck(
      checks,
      blockers,
      'proposal_executable',
      canExecute ? 'pass' : 'fail',
      canExecute ? 'Proposal is executable right now.' : 'Proposal is not executable right now.',
    );
    if (!signer.address) {
      nextSteps.push('Configure a wallet private key before attempting live proposal execution.');
      return finalizePreflight(action, network, signer, checks, blockers, { vote_id: voteIdBigInt }, nextSteps);
    }
    nextSteps.push('Run lido_execute_proposal with dry_run=true to inspect the execution transaction request.');
    return finalizePreflight(action, network, signer, checks, blockers, { vote_id: voteIdBigInt }, nextSteps);
  }

  return finalizePreflight(action, network, signer, checks, ['Unsupported write action.'], {}, nextSteps);
}

export async function getPortfolioSummary(params: PortfolioSummaryParams) {
  const owner = requireSummaryAddress(params.address);
  const ethereumConfig = getNetworkConfig('ethereum');
  const ethereumClient = getPublicClient('ethereum');

  const [ethereumOverview, baseOverview, optimismOverview, arbitrumOverview, withdrawals, proposals, ldoBalance] = await Promise.all([
    getAccountOverview('ethereum', owner),
    getAccountOverview('base', owner),
    getAccountOverview('optimism', owner),
    getAccountOverview('arbitrum', owner),
    getWithdrawalRequests('ethereum', owner),
    getGovernanceProposals({ network: 'ethereum', recentLimit: params.governanceRecentLimit, voter: owner }),
    ethereumClient.readContract({
      address: ethereumConfig.ldo!,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    }),
  ]);

  const perNetwork = [ethereumOverview, baseOverview, optimismOverview, arbitrumOverview];
  const totalStethRaw = perNetwork.reduce((sum, overview) => sum + (overview.steth_balance?.raw ?? 0n), 0n);
  const totalWstethRaw = perNetwork.reduce((sum, overview) => sum + (overview.wsteth_balance?.raw ?? 0n), 0n);
  const totalWstethUnderlying = totalWstethRaw > 0n
    ? await ethereumClient.readContract({
        address: ethereumConfig.wsteth!,
        abi: WSTETH_ABI,
        functionName: 'getStETHByWstETH',
        args: [totalWstethRaw],
      })
    : 0n;
  const totalExposure = totalStethRaw + totalWstethUnderlying;
  const withdrawalRequests = withdrawals.requests ?? [];
  const totalClaimableEth = withdrawalRequests.reduce(
    (sum: bigint, request: { claimable_eth: string }) => sum + parseEther(request.claimable_eth),
    0n,
  );
  const actionableProposals = proposals.proposals.filter(
    (proposal: { open: boolean; can_execute: boolean; voter_context: { can_vote: boolean | null } | null }) =>
      proposal.can_execute || proposal.voter_context?.can_vote === true || proposal.open,
  );

  const recommendations: string[] = [];
  if (totalClaimableEth > 0n) {
    recommendations.push('Claim finalized withdrawals on Ethereum because claimable ETH is available now.');
  }
  if ((ethereumOverview.steth_balance?.raw ?? 0n) > 0n) {
    recommendations.push('If you want non-rebasing exposure or DeFi composability, consider wrapping some Ethereum stETH into wstETH.');
  }
  if (actionableProposals.some((proposal: { voter_context: { can_vote: boolean | null } | null }) => proposal.voter_context?.can_vote)) {
    recommendations.push('You have at least one recent governance proposal where the configured or provided wallet can vote.');
  }
  if (recommendations.length === 0) {
    recommendations.push('No immediate action is required based on balances, claimable withdrawals, and recent governance context.');
  }

  return {
    address: owner,
    balance_overview: {
      ethereum: ethereumOverview,
      base: baseOverview,
      optimism: optimismOverview,
      arbitrum: arbitrumOverview,
    },
    aggregated_exposure: {
      total_steth_raw: totalStethRaw,
      total_steth_formatted: formatUnits(totalStethRaw, 18),
      total_wsteth_raw: totalWstethRaw,
      total_wsteth_formatted: formatUnits(totalWstethRaw, 18),
      total_wsteth_underlying_steth_raw: totalWstethUnderlying,
      total_wsteth_underlying_steth_formatted: formatUnits(totalWstethUnderlying, 18),
      total_steth_equivalent_raw: totalExposure,
      total_steth_equivalent_formatted: formatUnits(totalExposure, 18),
    },
    withdrawals: {
      request_count: withdrawalRequests.length,
      finalized_count: withdrawalRequests.filter((request: { is_finalized: boolean }) => request.is_finalized).length,
      claimable_count: withdrawalRequests.filter((request: { claimable_eth: string }) => parseEther(request.claimable_eth) > 0n).length,
      total_claimable_eth_raw: totalClaimableEth,
      total_claimable_eth_formatted: formatEther(totalClaimableEth),
      requests: withdrawalRequests,
    },
    governance: {
      ldo_balance_raw: ldoBalance,
      ldo_balance_formatted: formatUnits(ldoBalance, 18),
      recent_limit: params.governanceRecentLimit,
      returned: proposals.returned,
      actionable_count: actionableProposals.length,
      proposals: proposals.proposals,
    },
    recommendations,
  };
}
