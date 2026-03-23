import { erc20Abi, formatUnits, type Address } from 'viem';

import { START_VOTE_EVENT, VOTING_ABI } from './abis.js';
import { getAccount, getPublicClient, getWalletContext, normalizeAddress } from './clients.js';
import { getNetworkConfig } from './networks.js';
import type {
  CastGovernanceVoteParams,
  ExecuteGovernanceVoteParams,
  GovernanceProposalsParams,
  WritableNetwork,
} from './types.js';
import { formatPct, mapVoterState } from './utils.js';

async function getMetadataForVote(
  network: WritableNetwork,
  voteId: bigint,
  snapshotBlock: bigint,
): Promise<{ creator?: Address; metadata?: string }> {
  const config = getNetworkConfig(network);
  const publicClient = getPublicClient(network);

  if (!config.voting) {
    return {};
  }

  const logs = await publicClient.getLogs({
    address: config.voting,
    event: START_VOTE_EVENT,
    args: { voteId },
    fromBlock: snapshotBlock + 1n,
    toBlock: snapshotBlock + 1n,
  });

  const match = logs.at(-1);
  if (!match) {
    return {};
  }

  return {
    creator: match.args.creator,
    metadata: match.args.metadata,
  };
}

export async function getGovernanceProposals(params: GovernanceProposalsParams) {
  const { network, recentLimit, voter } = params;
  const config = getNetworkConfig(network);
  const publicClient = getPublicClient(network);
  const votesLength = await publicClient.readContract({
    address: config.voting!,
    abi: VOTING_ABI,
    functionName: 'votesLength',
  });

  const voterAddress = voter
    ? normalizeAddress(voter)
    : (() => {
        try {
          return getAccount().address;
        } catch {
          return null;
        }
      })();

  const start = votesLength > BigInt(recentLimit) ? votesLength - BigInt(recentLimit) : 0n;
  const ids = Array.from({ length: Number(votesLength - start) }, (_, index) => start + BigInt(index)).reverse();

  const proposals = await Promise.all(
    ids.map(async (voteId) => {
      const [vote, canExecute, voterData, ldoBalance] = await Promise.all([
        publicClient.readContract({
          address: config.voting!,
          abi: VOTING_ABI,
          functionName: 'getVote',
          args: [voteId],
        }),
        publicClient.readContract({
          address: config.voting!,
          abi: VOTING_ABI,
          functionName: 'canExecute',
          args: [voteId],
        }),
        voterAddress
          ? Promise.all([
              publicClient.readContract({
                address: config.voting!,
                abi: VOTING_ABI,
                functionName: 'canVote',
                args: [voteId, voterAddress],
              }),
              publicClient.readContract({
                address: config.voting!,
                abi: VOTING_ABI,
                functionName: 'getVoterState',
                args: [voteId, voterAddress],
              }),
            ])
          : Promise.resolve(null),
        voterAddress && config.ldo
          ? publicClient.readContract({
              address: config.ldo,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [voterAddress],
            })
          : Promise.resolve(null),
      ]);

      const resolvedMetadata = await getMetadataForVote(network, voteId, BigInt(vote[3]));

      return {
        vote_id: voteId,
        open: vote[0],
        executed: vote[1],
        start_date_unix: vote[2],
        snapshot_block: vote[3],
        support_required_pct: formatPct(BigInt(vote[4])),
        min_accept_quorum_pct: formatPct(BigInt(vote[5])),
        yea: formatUnits(vote[6], 18),
        nay: formatUnits(vote[7], 18),
        voting_power: formatUnits(vote[8], 18),
        execution_script: vote[9],
        can_execute: canExecute,
        creator: resolvedMetadata.creator ?? null,
        metadata: resolvedMetadata.metadata ?? null,
        voter_context: voterAddress
          ? {
              voter: voterAddress,
              current_ldo_balance: ldoBalance === null ? null : formatUnits(ldoBalance, 18),
              can_vote: voterData ? voterData[0] : null,
              voter_state: voterData ? mapVoterState(voterData[1]) : null,
            }
          : null,
      };
    }),
  );

  return {
    network,
    votes_length: votesLength,
    returned: proposals.length,
    proposals,
  };
}

export async function castGovernanceVote(params: CastGovernanceVoteParams) {
  const { network, voteId, support, executesIfDecided, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const voteIdBigInt = BigInt(voteId);

  const [canVote, voterState] = await Promise.all([
    publicClient.readContract({
      address: config.voting!,
      abi: VOTING_ABI,
      functionName: 'canVote',
      args: [voteIdBigInt, account.address],
    }),
    publicClient.readContract({
      address: config.voting!,
      abi: VOTING_ABI,
      functionName: 'getVoterState',
      args: [voteIdBigInt, account.address],
    }),
  ]);

  if (!canVote) {
    throw new Error('The configured wallet cannot vote on this proposal at the current snapshot/state.');
  }

  const simulation = await publicClient.simulateContract({
    account: account.address,
    address: config.voting!,
    abi: VOTING_ABI,
    functionName: 'vote',
    args: [voteIdBigInt, support, executesIfDecided],
  });

  if (dryRun) {
    return {
      mode: 'dry_run',
      network,
      account: account.address,
      vote_id: voteIdBigInt,
      support,
      executes_if_decided: executesIfDecided,
      can_vote: canVote,
      current_voter_state: mapVoterState(voterState),
      request: {
        to: simulation.request.address,
        function: 'vote',
      },
    };
  }

  const hash = await walletClient.writeContract({ ...simulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    mode: 'executed',
    network,
    account: account.address,
    vote_id: voteIdBigInt,
    support,
    executes_if_decided: executesIfDecided,
    transaction_hash: hash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}

export async function executeGovernanceVote(params: ExecuteGovernanceVoteParams) {
  const { network, voteId, dryRun } = params;
  const { account, publicClient, walletClient, config } = getWalletContext(network);
  const voteIdBigInt = BigInt(voteId);

  const canExecute = await publicClient.readContract({
    address: config.voting!,
    abi: VOTING_ABI,
    functionName: 'canExecute',
    args: [voteIdBigInt],
  });

  if (!canExecute) {
    throw new Error('This vote is not executable right now.');
  }

  const simulation = await publicClient.simulateContract({
    account: account.address,
    address: config.voting!,
    abi: VOTING_ABI,
    functionName: 'executeVote',
    args: [voteIdBigInt],
  });

  if (dryRun) {
    return {
      mode: 'dry_run',
      network,
      account: account.address,
      vote_id: voteIdBigInt,
      can_execute: canExecute,
      request: {
        to: simulation.request.address,
        function: 'executeVote',
      },
    };
  }

  const hash = await walletClient.writeContract({ ...simulation.request, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    mode: 'executed',
    network,
    account: account.address,
    vote_id: voteIdBigInt,
    transaction_hash: hash,
    block_number: receipt.blockNumber,
    status: receipt.status,
  };
}
