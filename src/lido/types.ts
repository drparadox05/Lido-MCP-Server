import type { Account, Address, Chain } from 'viem';

export const SUPPORTED_NETWORKS = ['ethereum', 'base', 'optimism', 'arbitrum'] as const;
export const WRITABLE_NETWORKS = ['ethereum'] as const;
export const WRITE_ACTIONS = [
  'stake',
  'wrap',
  'unwrap',
  'request_unstake',
  'claim_withdrawals',
  'vote_on_proposal',
  'execute_proposal',
] as const;

export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];
export type WritableNetwork = (typeof WRITABLE_NETWORKS)[number];
export type WriteAction = (typeof WRITE_ACTIONS)[number];

export type NetworkConfig = {
  key: SupportedNetwork;
  chain: Chain;
  rpcEnv: string;
  lido?: Address;
  steth?: Address;
  wsteth?: Address;
  withdrawalQueue?: Address;
  voting?: Address;
  ldo?: Address;
  supportsStake: boolean;
  supportsGovernance: boolean;
  supportsRewards: boolean;
};

export type WalletContext = {
  account: Account;
  publicClient: any;
  walletClient: any;
  config: NetworkConfig;
};

export type StakeEthParams = {
  network: WritableNetwork;
  amountEth: string;
  referral?: string;
  dryRun: boolean;
};

export type WrapStethParams = {
  network: WritableNetwork;
  amountSteth: string;
  approveIfNeeded: boolean;
  dryRun: boolean;
};

export type UnwrapWstethParams = {
  network: WritableNetwork;
  amountWsteth: string;
  dryRun: boolean;
};

export type RequestUnstakeParams = {
  network: WritableNetwork;
  token: 'steth' | 'wsteth';
  amounts: string[];
  owner?: string;
  approveIfNeeded: boolean;
  dryRun: boolean;
};

export type ClaimWithdrawalsParams = {
  network: WritableNetwork;
  requestIds: Array<number | string>;
  recipient?: string;
  dryRun: boolean;
};

export type GovernanceProposalsParams = {
  network: WritableNetwork;
  recentLimit: number;
  voter?: string;
};

export type CastGovernanceVoteParams = {
  network: WritableNetwork;
  voteId: number;
  support: boolean;
  executesIfDecided: boolean;
  dryRun: boolean;
};

export type ExecuteGovernanceVoteParams = {
  network: WritableNetwork;
  voteId: number;
  dryRun: boolean;
};

export type PreflightWriteActionParams = {
  network: WritableNetwork;
  action: WriteAction;
  amountEth?: string;
  amountSteth?: string;
  amountWsteth?: string;
  token?: 'steth' | 'wsteth';
  amounts?: string[];
  owner?: string;
  recipient?: string;
  requestIds?: Array<number | string>;
  voteId?: number;
  support?: boolean;
  executesIfDecided?: boolean;
  referral?: string;
  approveIfNeeded: boolean;
};

export type PortfolioSummaryParams = {
  address?: string;
  governanceRecentLimit: number;
};
