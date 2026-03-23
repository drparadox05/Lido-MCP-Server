import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  GUIDE_TOPICS,
  SUPPORTED_NETWORKS,
  WRITE_ACTIONS,
  WRITABLE_NETWORKS,
  castGovernanceVote,
  claimWithdrawals,
  executeGovernanceVote,
  getAgentGuide,
  getAccountOverview,
  getGovernanceProposals,
  getPortfolioSummary,
  getRewards,
  getSetupSummary,
  getWithdrawalRequests,
  preflightWriteAction,
  requestUnstake,
  stakeEth,
  unwrapWsteth,
  wrapSteth,
} from '../lido/index.js';
import { jsonResult } from '../shared/mcp.js';
import {
  executeUniswapRoute,
  getUniswapBridgableTokens,
  getUniswapRouteStatus,
  preflightUniswapRoute,
} from '../uniswap/index.js';
import {
  UNISWAP_PROTOCOLS,
  UNISWAP_ROUTING_PREFERENCES,
  UNISWAP_TRADE_TYPES,
  UNISWAP_URGENCIES,
} from '../uniswap/types.js';

const readNetworkSchema = z.enum(SUPPORTED_NETWORKS);
const guideTopicSchema = z.enum(GUIDE_TOPICS);
const writeActionSchema = z.enum(WRITE_ACTIONS);
const writeNetworkSchema = z.enum(WRITABLE_NETWORKS);
const uniswapProtocolSchema = z.enum(UNISWAP_PROTOCOLS);
const uniswapRoutingPreferenceSchema = z.enum(UNISWAP_ROUTING_PREFERENCES);
const uniswapTradeTypeSchema = z.enum(UNISWAP_TRADE_TYPES);
const uniswapUrgencySchema = z.enum(UNISWAP_URGENCIES);

export function createServer() {
  const server = new McpServer({
    name: 'lido-mcp-server',
    version: '0.1.0',
  });

  server.registerTool(
    'lido_get_setup',
    {
      title: 'Get Lido MCP setup status',
      description: 'Returns wallet and RPC configuration status plus recommended first tools, safety defaults, and quickstart prompts for this MCP server.',
      inputSchema: z.object({}),
    },
    async () => jsonResult(getSetupSummary()),
  );

  server.registerTool(
    'lido_get_agent_guide',
    {
      title: 'Get the Lido agent guide',
      description:
        'Returns the Lido mental model, network boundaries, safe operating sequence, tool map, and topic-focused workflow guidance for agents and developers.',
      inputSchema: z.object({
        topic: guideTopicSchema.default('overview'),
      }),
    },
    async ({ topic }) => jsonResult(getAgentGuide(topic)),
  );

  server.registerTool(
    'lido_get_account_overview',
    {
      title: 'Get Lido account overview',
      description: 'Reads ETH/native balance plus stETH and wstETH balances for a wallet on a supported network.',
      inputSchema: z.object({
        network: readNetworkSchema.default('ethereum'),
        address: z.string().optional(),
      }),
    },
    async ({ network, address }) => jsonResult(await getAccountOverview(network, address)),
  );

  server.registerTool(
    'lido_get_portfolio_summary',
    {
      title: 'Get an aggregated Lido portfolio summary',
      description:
        'Aggregates balances, claimable withdrawals, stETH-equivalent exposure, and recent governance context for a wallet across Ethereum, Base, Optimism, and Arbitrum.',
      inputSchema: z.object({
        address: z.string().optional(),
        governance_recent_limit: z.number().int().positive().max(50).default(10),
      }),
    },
    async ({ address, governance_recent_limit }) =>
      jsonResult(
        await getPortfolioSummary({
          address,
          governanceRecentLimit: governance_recent_limit,
        }),
      ),
  );

  server.registerTool(
    'lido_preflight_write_action',
    {
      title: 'Preflight a Lido write action',
      description:
        'Checks balances, approvals, request ownership, governance eligibility, and next safe steps before executing a Lido write action.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        action: writeActionSchema,
        amount_eth: z.string().optional(),
        amount_steth: z.string().optional(),
        amount_wsteth: z.string().optional(),
        token: z.enum(['steth', 'wsteth']).optional(),
        amounts: z.array(z.string()).optional(),
        owner: z.string().optional(),
        recipient: z.string().optional(),
        request_ids: z.array(z.union([z.number().int().positive(), z.string()])).optional(),
        vote_id: z.number().int().nonnegative().optional(),
        support: z.boolean().optional(),
        executes_if_decided: z.boolean().optional(),
        referral: z.string().optional(),
        approve_if_needed: z.boolean().default(true),
      }),
    },
    async ({
      network,
      action,
      amount_eth,
      amount_steth,
      amount_wsteth,
      token,
      amounts,
      owner,
      recipient,
      request_ids,
      vote_id,
      support,
      executes_if_decided,
      referral,
      approve_if_needed,
    }) =>
      jsonResult(
        await preflightWriteAction({
          network,
          action,
          amountEth: amount_eth,
          amountSteth: amount_steth,
          amountWsteth: amount_wsteth,
          token,
          amounts,
          owner,
          recipient,
          requestIds: request_ids,
          voteId: vote_id,
          support,
          executesIfDecided: executes_if_decided,
          referral,
          approveIfNeeded: approve_if_needed,
        }),
      ),
  );

  server.registerTool(
    'lido_get_rewards',
    {
      title: 'Get Lido rewards and rebasing context',
      description:
        'Reads current stETH/wstETH reward context on Ethereum. Provide from_block to compute a net on-chain position delta across time.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        address: z.string().optional(),
        from_block: z.number().int().positive().optional(),
      }),
    },
    async ({ network, address, from_block }) => jsonResult(await getRewards(network, address, from_block)),
  );

  server.registerTool(
    'lido_stake_eth',
    {
      title: 'Stake ETH for stETH',
      description:
        'Submits ETH to the Lido staking contract on Ethereum. dry_run defaults to true and should be disabled only after reviewing the transaction intent.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        amount_eth: z.string(),
        referral: z.string().optional(),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, amount_eth, referral, dry_run }) =>
      jsonResult(
        await stakeEth({
          network,
          amountEth: amount_eth,
          referral,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_wrap_steth',
    {
      title: 'Wrap stETH into wstETH',
      description:
        'Wraps stETH into wstETH on Ethereum. If approval is missing and approve_if_needed=true, the live execution will send approval first.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        amount_steth: z.string(),
        approve_if_needed: z.boolean().default(true),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, amount_steth, approve_if_needed, dry_run }) =>
      jsonResult(
        await wrapSteth({
          network,
          amountSteth: amount_steth,
          approveIfNeeded: approve_if_needed,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_unwrap_wsteth',
    {
      title: 'Unwrap wstETH into stETH',
      description: 'Unwraps wstETH into stETH on Ethereum.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        amount_wsteth: z.string(),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, amount_wsteth, dry_run }) =>
      jsonResult(
        await unwrapWsteth({
          network,
          amountWsteth: amount_wsteth,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_request_unstake',
    {
      title: 'Request unstake via withdrawal queue',
      description:
        'Requests withdrawals from the Lido withdrawal queue using stETH or wstETH on Ethereum. This is not instant ETH redemption; a finalized queue claim is required later.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        token: z.enum(['steth', 'wsteth']).default('steth'),
        amounts: z.array(z.string()).min(1),
        owner: z.string().optional(),
        approve_if_needed: z.boolean().default(true),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, token, amounts, owner, approve_if_needed, dry_run }) =>
      jsonResult(
        await requestUnstake({
          network,
          token,
          amounts,
          owner,
          approveIfNeeded: approve_if_needed,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_get_withdrawal_requests',
    {
      title: 'Get withdrawal queue requests',
      description: 'Reads withdrawal request NFTs, finalization status, and claimable ETH for a wallet on Ethereum.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        owner: z.string().optional(),
      }),
    },
    async ({ network, owner }) => jsonResult(await getWithdrawalRequests(network, owner)),
  );

  server.registerTool(
    'lido_claim_withdrawals',
    {
      title: 'Claim finalized Lido withdrawals',
      description: 'Claims finalized withdrawal queue requests into ETH on Ethereum.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        request_ids: z.array(z.union([z.number().int().positive(), z.string()])).min(1),
        recipient: z.string().optional(),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, request_ids, recipient, dry_run }) =>
      jsonResult(
        await claimWithdrawals({
          network,
          requestIds: request_ids,
          recipient,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_get_governance_proposals',
    {
      title: 'Get Lido governance proposals',
      description: 'Reads recent Lido Aragon voting proposals on Ethereum and optionally returns voting context for a wallet.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        recent_limit: z.number().int().positive().max(50).default(10),
        voter: z.string().optional(),
      }),
    },
    async ({ network, recent_limit, voter }) =>
      jsonResult(
        await getGovernanceProposals({
          network,
          recentLimit: recent_limit,
          voter,
        }),
      ),
  );

  server.registerTool(
    'lido_vote_on_proposal',
    {
      title: 'Vote on a Lido governance proposal',
      description:
        'Casts a yes or no vote in Lido Aragon governance on Ethereum. dry_run defaults to true for safety.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        vote_id: z.number().int().nonnegative(),
        support: z.boolean(),
        executes_if_decided: z.boolean().default(false),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, vote_id, support, executes_if_decided, dry_run }) =>
      jsonResult(
        await castGovernanceVote({
          network,
          voteId: vote_id,
          support,
          executesIfDecided: executes_if_decided,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_execute_proposal',
    {
      title: 'Execute a passed Lido governance proposal',
      description: 'Executes a Lido Aragon proposal if it is already executable.',
      inputSchema: z.object({
        network: writeNetworkSchema.default('ethereum'),
        vote_id: z.number().int().nonnegative(),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ network, vote_id, dry_run }) =>
      jsonResult(
        await executeGovernanceVote({
          network,
          voteId: vote_id,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_preflight_uniswap_route',
    {
      title: 'Preflight a Uniswap swap or bridge route',
      description:
        'Checks Uniswap API availability, token resolution, approval requirements, and route selection for same-chain swaps or cross-chain bridges before execution.',
      inputSchema: z.object({
        token_in_chain: readNetworkSchema,
        token_out_chain: readNetworkSchema,
        token_in: z.string(),
        token_out: z.string(),
        amount: z.string(),
        type: uniswapTradeTypeSchema.default('EXACT_INPUT'),
        swapper: z.string().optional(),
        slippage_tolerance: z.number().positive().max(100).optional(),
        routing_preference: uniswapRoutingPreferenceSchema.default('BEST_PRICE'),
        protocols: z.array(uniswapProtocolSchema).optional(),
        urgency: uniswapUrgencySchema.default('normal'),
        approve_if_needed: z.boolean().default(true),
      }),
    },
    async ({ token_in_chain, token_out_chain, token_in, token_out, amount, type, swapper, slippage_tolerance, routing_preference, protocols, urgency, approve_if_needed }) =>
      jsonResult(
        await preflightUniswapRoute({
          tokenInChain: token_in_chain,
          tokenOutChain: token_out_chain,
          tokenIn: token_in,
          tokenOut: token_out,
          amount,
          type,
          swapper,
          slippageTolerance: slippage_tolerance,
          routingPreference: routing_preference,
          protocols,
          urgency,
          approveIfNeeded: approve_if_needed,
        }),
      ),
  );

  server.registerTool(
    'lido_execute_uniswap_route',
    {
      title: 'Dry run or execute a Uniswap swap or bridge route',
      description:
        'Creates the approval and /swap transaction path for a Uniswap quote and, when dry_run=false, broadcasts the approval and swap or bridge transaction on the source chain.',
      inputSchema: z.object({
        token_in_chain: readNetworkSchema,
        token_out_chain: readNetworkSchema,
        token_in: z.string(),
        token_out: z.string(),
        amount: z.string(),
        type: uniswapTradeTypeSchema.default('EXACT_INPUT'),
        swapper: z.string().optional(),
        slippage_tolerance: z.number().positive().max(100).optional(),
        routing_preference: uniswapRoutingPreferenceSchema.default('BEST_PRICE'),
        protocols: z.array(uniswapProtocolSchema).optional(),
        urgency: uniswapUrgencySchema.default('normal'),
        approve_if_needed: z.boolean().default(true),
        deadline: z.number().int().positive().optional(),
        dry_run: z.boolean().default(true),
      }),
    },
    async ({ token_in_chain, token_out_chain, token_in, token_out, amount, type, swapper, slippage_tolerance, routing_preference, protocols, urgency, approve_if_needed, deadline, dry_run }) =>
      jsonResult(
        await executeUniswapRoute({
          tokenInChain: token_in_chain,
          tokenOutChain: token_out_chain,
          tokenIn: token_in,
          tokenOut: token_out,
          amount,
          type,
          swapper,
          slippageTolerance: slippage_tolerance,
          routingPreference: routing_preference,
          protocols,
          urgency,
          approveIfNeeded: approve_if_needed,
          deadline,
          dryRun: dry_run,
        }),
      ),
  );

  server.registerTool(
    'lido_get_uniswap_route_status',
    {
      title: 'Get Uniswap swap or bridge status',
      description: 'Reads Uniswap swap or bridge transaction status for one or more source-chain transaction hashes.',
      inputSchema: z.object({
        chain: readNetworkSchema,
        tx_hashes: z.array(z.string()).min(1),
      }),
    },
    async ({ chain, tx_hashes }) => jsonResult(await getUniswapRouteStatus({ chain, txHashes: tx_hashes })),
  );

  server.registerTool(
    'lido_get_uniswap_bridgable_tokens',
    {
      title: 'Get Uniswap bridgable destinations for a token',
      description: 'Returns the tokens or destinations that Uniswap reports as swappable or bridgable for a source token on a source chain.',
      inputSchema: z.object({
        token_in_chain: readNetworkSchema,
        token_in: z.string(),
      }),
    },
    async ({ token_in_chain, token_in }) =>
      jsonResult(
        await getUniswapBridgableTokens({
          tokenInChain: token_in_chain,
          tokenIn: token_in,
        }),
      ),
  );

  return server;
}
