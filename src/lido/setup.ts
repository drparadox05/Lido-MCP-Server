import type { Address } from 'viem';

import { getOptionalEnv, hasPrivateKeyConfigured } from '../config/env.js';
import { getUniswapSetupSummary } from '../uniswap/index.js';
import { getAccount } from './clients.js';
import { getNetworkConfig } from './networks.js';
import { SUPPORTED_NETWORKS, WRITE_ACTIONS } from './types.js';

export const GUIDE_TOPICS = ['overview', 'portfolio', 'stake', 'wrap', 'unstake', 'claim', 'rewards', 'governance', 'swap', 'bridge'] as const;

type GuideTopic = (typeof GUIDE_TOPICS)[number];

const QUICKSTART_PROMPTS = [
  'Show my Lido MCP setup status.',
  'Show the Lido agent guide for staking.',
  'Show my aggregated Lido portfolio summary.',
  'Preflight a Uniswap route from ETH on Ethereum into wstETH on Base.',
  'Preflight staking 0.01 ETH on Ethereum.',
  'Dry run wrapping 0.1 stETH into wstETH on Ethereum.',
  'Show my withdrawal requests and claimable ETH on Ethereum.',
  'Show the 5 most recent Lido governance proposals and whether my wallet can vote.',
] as const;

const SAFE_OPERATING_SEQUENCE = [
  'Call lido_get_setup to confirm wallet and RPC configuration.',
  'Call lido_get_agent_guide if you need the Lido mental model or tool-selection help for a goal.',
  'Call lido_get_portfolio_summary or lido_get_account_overview to inspect balances before acting.',
  'Call lido_preflight_write_action before any write so blockers, approvals, and ownership issues are explicit.',
  'Call the write tool with dry_run=true before any live transaction.',
  'Only call the same write tool with dry_run=false after explicit human confirmation.',
] as const;

const TOOL_MAP = {
  discovery: [
    {
      tool: 'lido_get_setup',
      when_to_use: 'First call for any new session or when diagnosing environment problems.',
      returns: 'Wallet status, RPC coverage, safety defaults, and recommended prompts.',
    },
    {
      tool: 'lido_get_agent_guide',
      when_to_use: 'When an agent needs the Lido mental model, workflow guidance, or tool-selection help.',
      returns: 'Goal-specific guidance, safe workflows, pitfalls, and example prompts.',
    },
  ],
  reads: [
    {
      tool: 'lido_get_account_overview',
      when_to_use: 'Inspect one wallet on one network.',
      returns: 'Native balance, stETH, wstETH, and exchange-rate context.',
    },
    {
      tool: 'lido_get_portfolio_summary',
      when_to_use: 'Get the highest-signal cross-network overview for a wallet.',
      returns: 'Balances, withdrawals, governance context, and recommendations.',
    },
    {
      tool: 'lido_get_rewards',
      when_to_use: 'Explain rebasing and reward-aware position changes on Ethereum.',
      returns: 'Current reward context or historical net position delta from a block.',
    },
    {
      tool: 'lido_get_withdrawal_requests',
      when_to_use: 'Inspect queue requests, finalization, and claimability.',
      returns: 'Withdrawal NFTs, claimable ETH, and checkpoint hints.',
    },
    {
      tool: 'lido_get_governance_proposals',
      when_to_use: 'Inspect recent DAO votes and optional voter eligibility.',
      returns: 'Recent proposals, execution state, and voter context.',
    },
    {
      tool: 'lido_get_uniswap_route_status',
      when_to_use: 'Track the status of a source-chain swap or bridge transaction after submission.',
      returns: 'Uniswap-reported status for one or more source-chain transaction hashes.',
    },
    {
      tool: 'lido_get_uniswap_bridgable_tokens',
      when_to_use: 'Discover bridge-compatible destinations for a source token on a source chain.',
      returns: 'The Uniswap-reported swappable or bridgable destination token set.',
    },
  ],
  safety: [
    {
      tool: 'lido_preflight_write_action',
      when_to_use: 'Before every stake, wrap, unwrap, withdrawal, claim, or governance write.',
      returns: 'Readiness, blockers, approval needs, ownership checks, and next steps.',
    },
    {
      tool: 'lido_preflight_uniswap_route',
      when_to_use: 'Before any Uniswap-powered swap or bridge route.',
      returns: 'Approval needs, route type, execution compatibility, blockers, and next steps.',
    },
  ],
  writes: [
    {
      tool: 'lido_stake_eth',
      when_to_use: 'Convert ETH into stETH on Ethereum.',
      returns: 'Dry-run request or executed transaction receipt context.',
    },
    {
      tool: 'lido_wrap_steth',
      when_to_use: 'Convert rebasing stETH into non-rebasing wstETH on Ethereum.',
      returns: 'Approval-aware wrap path with expected output.',
    },
    {
      tool: 'lido_unwrap_wsteth',
      when_to_use: 'Convert wstETH back into stETH on Ethereum.',
      returns: 'Unwrap preview or execution details.',
    },
    {
      tool: 'lido_request_unstake',
      when_to_use: 'Enter the Lido withdrawal queue using stETH or wstETH.',
      returns: 'Queue-request preview or created request ids after execution.',
    },
    {
      tool: 'lido_claim_withdrawals',
      when_to_use: 'Claim finalized withdrawal requests into ETH on Ethereum.',
      returns: 'Claim preview or executed claim receipt details.',
    },
    {
      tool: 'lido_vote_on_proposal',
      when_to_use: 'Cast a yes/no vote on a Lido DAO proposal after explicit human approval.',
      returns: 'Governance vote preview or execution details.',
    },
    {
      tool: 'lido_execute_proposal',
      when_to_use: 'Execute a passed Lido DAO proposal when it is executable.',
      returns: 'Execution preview or executed transaction details.',
    },
    {
      tool: 'lido_execute_uniswap_route',
      when_to_use: 'Dry run or execute a Uniswap swap or bridge after reviewing preflight results.',
      returns: 'Approval transactions if needed, swap calldata preview, or executed transaction details.',
    },
  ],
} as const;

const FOCUSED_GUIDANCE: Record<GuideTopic, {
  objective: string;
  asset_flow?: string;
  recommended_tools: string[];
  required_inputs?: string[];
  workflow: string[];
  pitfalls: string[];
  example_prompts: string[];
}> = {
  overview: {
    objective: 'Choose the right Lido tool and follow a safe sequence without custom integration code.',
    recommended_tools: ['lido_get_setup', 'lido_get_agent_guide', 'lido_get_portfolio_summary', 'lido_preflight_write_action'],
    workflow: [...SAFE_OPERATING_SEQUENCE],
    pitfalls: [
      'Do not treat stETH balance changes as transfers by default; stETH rebases.',
      'Do not promise instant ETH exits from the withdrawal queue.',
      'Do not send dry_run=false writes without an explicit human instruction.',
    ],
    example_prompts: [...QUICKSTART_PROMPTS],
  },
  portfolio: {
    objective: 'Get a high-signal view of a wallet before deciding on any position action.',
    recommended_tools: ['lido_get_portfolio_summary', 'lido_get_account_overview', 'lido_get_rewards'],
    workflow: [
      'Call lido_get_portfolio_summary for the cross-network picture.',
      'Call lido_get_account_overview if you need one network in more detail.',
      'Call lido_get_rewards on Ethereum if the task is specifically about reward-aware performance.',
    ],
    pitfalls: [
      'L2 balances usually represent bridged wstETH exposure, not native staking capability.',
      'Historical reward deltas require archive-capable RPC support.',
    ],
    example_prompts: [
      'Show my aggregated Lido portfolio summary.',
      'Show my Lido balances on Base.',
      'Show my Lido rewards context on Ethereum.',
    ],
  },
  stake: {
    objective: 'Stake ETH into stETH on Ethereum safely.',
    asset_flow: 'ETH -> stETH on Ethereum',
    recommended_tools: ['lido_preflight_write_action', 'lido_stake_eth'],
    required_inputs: ['amount_eth'],
    workflow: [
      'Preflight the stake amount with action=stake.',
      'Run lido_stake_eth with dry_run=true.',
      'If the preview matches intent and the human confirms, run lido_stake_eth with dry_run=false.',
    ],
    pitfalls: [
      'Staking is an Ethereum action, not an L2 action.',
      'Leave enough ETH for gas instead of staking the full wallet balance.',
    ],
    example_prompts: [
      'Preflight staking 0.01 ETH on Ethereum.',
      'Dry run staking 0.01 ETH on Ethereum.',
    ],
  },
  wrap: {
    objective: 'Move between rebasing stETH and non-rebasing wstETH on Ethereum.',
    asset_flow: 'stETH <-> wstETH on Ethereum',
    recommended_tools: ['lido_preflight_write_action', 'lido_wrap_steth', 'lido_unwrap_wsteth'],
    required_inputs: ['amount_steth for wrap or amount_wsteth for unwrap'],
    workflow: [
      'For wrapping, preflight with action=wrap to check balance and allowance.',
      'For unwrapping, preflight with action=unwrap to verify the wstETH balance.',
      'Run the corresponding write tool with dry_run=true before any live call.',
    ],
    pitfalls: [
      'Wrapping may require an ERC-20 approval before the main action.',
      'wstETH keeps token count stable while value accrues through exchange rate, unlike stETH rebasing.',
    ],
    example_prompts: [
      'Preflight wrapping 0.1 stETH into wstETH on Ethereum.',
      'Dry run unwrapping 0.05 wstETH into stETH on Ethereum.',
    ],
  },
  unstake: {
    objective: 'Enter the withdrawal queue using stETH or wstETH.',
    asset_flow: 'stETH or wstETH -> withdrawal queue request NFTs -> later ETH claim',
    recommended_tools: ['lido_preflight_write_action', 'lido_request_unstake', 'lido_get_withdrawal_requests'],
    required_inputs: ['token', 'amounts'],
    workflow: [
      'Preflight with action=request_unstake to validate balances and allowance.',
      'Run lido_request_unstake with dry_run=true.',
      'After live execution, monitor status with lido_get_withdrawal_requests until claimable ETH appears.',
    ],
    pitfalls: [
      'Withdrawal requests are not instant ETH redemption.',
      'An approval may be required before the queue request can execute.',
    ],
    example_prompts: [
      'Preflight unstaking 0.2 stETH on Ethereum.',
      'Show my withdrawal requests and claimable ETH on Ethereum.',
    ],
  },
  claim: {
    objective: 'Claim finalized withdrawal requests into ETH.',
    asset_flow: 'finalized withdrawal requests -> ETH on Ethereum',
    recommended_tools: ['lido_get_withdrawal_requests', 'lido_preflight_write_action', 'lido_claim_withdrawals'],
    required_inputs: ['request_ids'],
    workflow: [
      'Inspect request status and claimability with lido_get_withdrawal_requests.',
      'Preflight with action=claim_withdrawals to verify ownership and claimable ETH.',
      'Run lido_claim_withdrawals with dry_run=true, then only execute live after confirmation.',
    ],
    pitfalls: [
      'Only finalized requests with positive claimable ETH can be claimed.',
      'The configured wallet must own every request id being claimed.',
    ],
    example_prompts: [
      'Preflight claiming my finalized Lido withdrawal requests on Ethereum.',
      'Dry run claiming withdrawal request ids 123 and 124 on Ethereum.',
    ],
  },
  rewards: {
    objective: 'Explain Lido reward mechanics and reward-aware balance changes.',
    recommended_tools: ['lido_get_rewards', 'lido_get_account_overview', 'lido_get_portfolio_summary'],
    workflow: [
      'Call lido_get_rewards without from_block for current rebasing and exchange-rate context.',
      'Provide from_block only when you need a historical net position delta on Ethereum.',
      'Use account or portfolio views alongside rewards if the task also involves holdings or actions.',
    ],
    pitfalls: [
      'Net balance delta is not pure reward if transfers happened during the interval.',
      'Historical queries can fail on non-archive RPC providers.',
    ],
    example_prompts: [
      'Show my Lido rewards context on Ethereum.',
      'Show my Lido net position delta since block 22000000 on Ethereum.',
    ],
  },
  governance: {
    objective: 'Inspect and, with explicit human approval, act on Lido DAO governance proposals.',
    asset_flow: 'LDO voting power at proposal snapshot -> Aragon vote or execution on Ethereum',
    recommended_tools: ['lido_get_governance_proposals', 'lido_preflight_write_action', 'lido_vote_on_proposal', 'lido_execute_proposal'],
    required_inputs: ['vote_id for writes and support for voting'],
    workflow: [
      'Call lido_get_governance_proposals to inspect recent votes and optional wallet eligibility.',
      'Preflight action=vote_on_proposal or action=execute_proposal before any governance write.',
      'Use the write tool with dry_run=true before live voting or execution.',
    ],
    pitfalls: [
      'Governance writes require an explicit human instruction.',
      'A wallet may hold LDO now but still be ineligible for a specific proposal snapshot.',
    ],
    example_prompts: [
      'Show the 5 most recent Lido governance proposals and whether my wallet can vote.',
      'Preflight voting yes on Lido proposal 123.',
    ],
  },
  swap: {
    objective: 'Use Uniswap routing to swap into or out of Lido-related assets with explicit approval and route checks first.',
    asset_flow: 'source token on source chain -> Uniswap-routed swap -> destination token on destination chain',
    recommended_tools: ['lido_preflight_uniswap_route', 'lido_execute_uniswap_route', 'lido_get_uniswap_route_status'],
    required_inputs: ['token_in_chain', 'token_out_chain', 'token_in', 'token_out', 'amount'],
    workflow: [
      'Preflight the swap route first so the agent can inspect approval requirements and routing type.',
      'Run lido_execute_uniswap_route with dry_run=true to inspect the approval and swap calldata.',
      'Only execute live after explicit human confirmation and only if the route is supported by the server.',
    ],
    pitfalls: [
      'This server uses a direct approval-then-swap flow with x-permit2-disabled=true, not a Permit2 signature flow.',
      'Some quotes may return UniswapX or chained routings which this server currently surfaces in preflight but does not execute live.',
    ],
    example_prompts: [
      'Preflight a Uniswap route from ETH on Ethereum into wstETH on Ethereum.',
      'Dry run a Uniswap route from wstETH on Base into native ETH on Base.',
    ],
  },
  bridge: {
    objective: 'Use Uniswap to bridge supported assets across the server-supported chains with explicit route validation and status tracking.',
    asset_flow: 'source-chain token -> bridge transaction on source chain -> destination-chain asset arrival',
    recommended_tools: ['lido_get_uniswap_bridgable_tokens', 'lido_preflight_uniswap_route', 'lido_execute_uniswap_route', 'lido_get_uniswap_route_status'],
    required_inputs: ['token_in_chain', 'token_out_chain', 'token_in', 'token_out', 'amount'],
    workflow: [
      'Optionally inspect bridgable destinations first with lido_get_uniswap_bridgable_tokens.',
      'Preflight the bridge route to inspect approval requirements, route type, and blockers.',
      'Dry run the bridge transaction, then execute live only after explicit human confirmation.',
      'Track the bridge transaction with lido_get_uniswap_route_status using the source-chain transaction hash.',
    ],
    pitfalls: [
      'A bridge route is still initiated by a source-chain transaction that can require ERC-20 approval first.',
      'Cross-chain quote quality and executability can vary by token pair and destination. Preflight should always be treated as authoritative for the current attempt.',
    ],
    example_prompts: [
      'Show bridgable destinations for wstETH on Ethereum.',
      'Preflight a Uniswap route from wstETH on Ethereum into wstETH on Base.',
    ],
  },
};

export function getSetupSummary() {
  let walletAddress: Address | null = null;
  let walletError: string | null = null;

  if (hasPrivateKeyConfigured()) {
    try {
      walletAddress = getAccount().address;
    } catch (error) {
      walletError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    wallet_configured: hasPrivateKeyConfigured(),
    wallet_address: walletAddress,
    wallet_error: walletError,
    writable_networks: SUPPORTED_NETWORKS.filter((network) => getNetworkConfig(network).supportsStake || getNetworkConfig(network).supportsGovernance),
    readable_networks: [...SUPPORTED_NETWORKS],
    supported_write_actions: [...WRITE_ACTIONS],
    uniswap: getUniswapSetupSummary(),
    rpc_status: SUPPORTED_NETWORKS.map((network) => {
      const config = getNetworkConfig(network);
      return {
        network: config.key,
        rpc_env: config.rpcEnv,
        configured: Boolean(getOptionalEnv(config.rpcEnv)),
        fallback_rpc_available: Boolean(config.chain.rpcUrls.default.http[0]),
      };
    }),
    developer_artifacts: {
      skill_file: 'lido.skill.md',
      demo_guide: 'DEMO.md',
      recommended_first_tools: ['lido_get_setup', 'lido_get_agent_guide', 'lido_get_portfolio_summary', 'lido_preflight_write_action', 'lido_preflight_uniswap_route'],
    },
    safety_defaults: {
      write_tools_default_to_dry_run: true,
      lido_core_write_execution_networks: ['ethereum'],
      uniswap_source_execution_networks: [...SUPPORTED_NETWORKS],
      recommended_sequence: [...SAFE_OPERATING_SEQUENCE],
    },
    quickstart_prompts: [...QUICKSTART_PROMPTS],
  };
}

export function getAgentGuide(topic: GuideTopic = 'overview') {
  return {
    topic,
    server: {
      name: 'lido-mcp-server',
      transport: 'stdio',
      goal: 'Make real on-chain Lido staking, position management, and governance actions callable by an AI agent without custom integration code.',
    },
    mental_model: {
      steth: 'stETH is the canonical rebasing Ethereum staking receipt. Displayed token balance changes as rewards and penalties are reported.',
      wsteth: 'wstETH is the wrapped, non-rebasing form of stETH. Token balance stays fixed while redeemable stETH per token grows over time.',
      withdrawal_queue: 'Unstaking is a two-phase queue workflow: request withdrawal first, then claim ETH only after finalization.',
      governance: 'Lido DAO governance runs through Aragon voting on Ethereum and should only be acted on with explicit human approval.',
    },
    network_boundaries: {
      ethereum: 'Canonical execution layer for staking, wrapping, withdrawal queue actions, rewards context, and governance.',
      base: 'Read visibility for bridged Lido assets such as wstETH. Not native staking or native governance execution.',
      optimism: 'Read visibility for bridged Lido assets such as wstETH. Not native staking or native governance execution.',
      arbitrum: 'Read visibility for bridged Lido assets such as wstETH. Not native staking or native governance execution.',
    },
    safe_operating_sequence: [...SAFE_OPERATING_SEQUENCE],
    tool_map: TOOL_MAP,
    focused_guidance: FOCUSED_GUIDANCE[topic],
  };
}
