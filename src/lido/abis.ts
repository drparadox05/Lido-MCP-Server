export const STETH_ABI = [
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'submit',
    inputs: [{ name: '_referral', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'sharesOf',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getPooledEthByShares',
    inputs: [{ name: '_sharesAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getSharesByPooledEth',
    inputs: [{ name: '_ethAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const WSTETH_ABI = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getWstETHByStETH',
    inputs: [{ name: '_stETHAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getStETHByWstETH',
    inputs: [{ name: '_wstETHAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'stEthPerToken',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'tokensPerStEth',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'wrap',
    inputs: [{ name: '_stETHAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'unwrap',
    inputs: [{ name: '_wstETHAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const WITHDRAWAL_QUEUE_ABI = [
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'requestWithdrawals',
    inputs: [
      { name: '_amounts', type: 'uint256[]' },
      { name: '_owner', type: 'address' },
    ],
    outputs: [{ name: 'requestIds', type: 'uint256[]' }],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'requestWithdrawalsWstETH',
    inputs: [
      { name: '_amounts', type: 'uint256[]' },
      { name: '_owner', type: 'address' },
    ],
    outputs: [{ name: 'requestIds', type: 'uint256[]' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getWithdrawalRequests',
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [{ name: 'requestsIds', type: 'uint256[]' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getWithdrawalStatus',
    inputs: [{ name: '_requestIds', type: 'uint256[]' }],
    outputs: [
      {
        name: 'statuses',
        type: 'tuple[]',
        components: [
          { name: 'amountOfStETH', type: 'uint256' },
          { name: 'amountOfShares', type: 'uint256' },
          { name: 'owner', type: 'address' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'isFinalized', type: 'bool' },
          { name: 'isClaimed', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getClaimableEther',
    inputs: [
      { name: '_requestIds', type: 'uint256[]' },
      { name: '_hints', type: 'uint256[]' },
    ],
    outputs: [{ name: 'claimableEthValues', type: 'uint256[]' }],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'claimWithdrawals',
    inputs: [
      { name: '_requestIds', type: 'uint256[]' },
      { name: '_hints', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'claimWithdrawalsTo',
    inputs: [
      { name: '_requestIds', type: 'uint256[]' },
      { name: '_hints', type: 'uint256[]' },
      { name: '_recipient', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'findCheckpointHints',
    inputs: [
      { name: '_requestIds', type: 'uint256[]' },
      { name: '_firstIndex', type: 'uint256' },
      { name: '_lastIndex', type: 'uint256' },
    ],
    outputs: [{ name: 'hintIds', type: 'uint256[]' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getLastCheckpointIndex',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'isBunkerModeActive',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const VOTING_ABI = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'votesLength',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getVote',
    inputs: [{ name: '_voteId', type: 'uint256' }],
    outputs: [
      { name: 'open', type: 'bool' },
      { name: 'executed', type: 'bool' },
      { name: 'startDate', type: 'uint64' },
      { name: 'snapshotBlock', type: 'uint64' },
      { name: 'supportRequired', type: 'uint64' },
      { name: 'minAcceptQuorum', type: 'uint64' },
      { name: 'yea', type: 'uint256' },
      { name: 'nay', type: 'uint256' },
      { name: 'votingPower', type: 'uint256' },
      { name: 'script', type: 'bytes' },
    ],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getVoterState',
    inputs: [
      { name: '_voteId', type: 'uint256' },
      { name: '_voter', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'canVote',
    inputs: [
      { name: '_voteId', type: 'uint256' },
      { name: '_voter', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'canExecute',
    inputs: [{ name: '_voteId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'vote',
    inputs: [
      { name: '_voteId', type: 'uint256' },
      { name: '_supports', type: 'bool' },
      { name: '_executesIfDecided', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'executeVote',
    inputs: [{ name: '_voteId', type: 'uint256' }],
    outputs: [],
  },
] as const;

export const START_VOTE_EVENT = {
  type: 'event',
  name: 'StartVote',
  anonymous: false,
  inputs: [
    { indexed: true, name: 'voteId', type: 'uint256' },
    { indexed: true, name: 'creator', type: 'address' },
    { indexed: false, name: 'metadata', type: 'string' },
  ],
} as const;
