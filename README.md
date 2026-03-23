 # Lido MCP Server

 A reference MCP server for Lido that exposes real on-chain tools for:

- staking ETH into `stETH`
- wrapping and unwrapping `stETH` and `wstETH`
- requesting and claiming withdrawals through the Lido withdrawal queue
- balance and reward-aware position queries
- Lido DAO governance proposal queries and voting
- Uniswap-powered swaps and cross-chain bridge routing with approval-aware preflight and dry-run execution
- agent-friendly discovery and mental-model guidance for safe tool selection

The server uses direct contract calls through `viem`.
It is not a REST wrapper.
All write tools support `dry_run` and default to `true`.


## Demo Video (AI agent didn't submit the video in API request)

[![Watch the demo](https://img.youtube.com/vi/V4Xu44B8yVU/0.jpg)](https://www.youtube.com/watch?v=V4Xu44B8yVU)


## Installation & usage

**For users:** See [USER_GUIDE.md](USER_GUIDE.md) for complete setup instructions.

**Quick start:**

You don't need to manually install anything. Just add this to your MCP client config (Cursor, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "lido": {
      "command": "npx",
      "args": ["-y", "lido-mcp-server"],
      "env": {
        "LIDO_PRIVATE_KEY": "0x...",
        "ETHEREUM_RPC_URL": "https://eth-mainnet.g.alchemy.com/v2/...",
        "UNISWAP_API_KEY": "..."
      }
    }
  }
}
```

> [!TIP]
> **Important:** To get the best out of this server, feed the `lido.skill.md` file to your AI agent (in custom instructions or workspace rules). This ensures the agent understands Lido's rebasing mechanics and safety patterns.

**Configuration templates:**
- [Example Config](mcp.config.example.json) - Standard configuration example

## Project structure

```text
src/
  config/
    env.ts
  lido/
    abis.ts
    advisor.ts
    account.ts
    clients.ts
    governance.ts
    index.ts
    networks.ts
    rewards.ts
    setup.ts
    staking.ts
    types.ts
    utils.ts
    withdrawals.ts
  server/
    createServer.ts
    index.ts
  shared/
    mcp.ts
  uniswap/
    api.ts
    index.ts
    tokens.ts
    types.ts
  index.ts
```

The repo is structured so contract metadata, runtime configuration, chain clients, business logic, and MCP transport wiring are separated.
Sensitive environment access is centralized in `src/config/env.ts` instead of being scattered across the codebase.

 ## Supported networks

 - `ethereum`
 - `base`
 - `optimism`
 - `arbitrum`

 Core staking, withdrawal queue actions, wrapping, and governance execute on `ethereum`.
 L2 networks are supported for balance-aware reads of bridged Lido assets.

 ## Implemented MCP tools

 - `lido_get_setup`
 - `lido_get_agent_guide`
 - `lido_get_account_overview`
 - `lido_get_portfolio_summary`
 - `lido_preflight_write_action`
 - `lido_get_rewards`
 - `lido_stake_eth`
 - `lido_wrap_steth`
 - `lido_unwrap_wsteth`
 - `lido_request_unstake`
 - `lido_get_withdrawal_requests`
 - `lido_claim_withdrawals`
 - `lido_get_governance_proposals`
 - `lido_vote_on_proposal`
 - `lido_execute_proposal`
 - `lido_preflight_uniswap_route`
 - `lido_execute_uniswap_route`
 - `lido_get_uniswap_route_status`
 - `lido_get_uniswap_bridgable_tokens`

 ## Quick start

 ### 1. Install dependencies

 ```bash
 npm install
 ```

### 2. Configure environment

Copy `.env.example` to `.env` or export variables in your shell.

Required for writes:

- `LIDO_PRIVATE_KEY`
- `ETHEREUM_RPC_URL`

Useful variables:

- `ETHEREUM_RPC_URL`
- `BASE_RPC_URL`
- `OPTIMISM_RPC_URL`
- `ARBITRUM_RPC_URL`

Required for Uniswap-powered route discovery and execution:

- `UNISWAP_API_KEY`

Optional for Uniswap route generation:

- `UNISWAP_UNIVERSAL_ROUTER_VERSION`

### 3. Build

```bash
npm run build
```

### 4. Run over stdio

```bash
npm start
```

For local development:

```bash
npm run dev
```

## Judge and developer quick prompts

Use these prompts directly in Cursor or Claude after connecting the MCP server:

```text
Show my Lido MCP setup status.
Show the Lido agent guide for staking.
Show my aggregated Lido portfolio summary.
Show bridgable destinations for wstETH on Ethereum.
Preflight a Uniswap route from ETH on Ethereum into wstETH on Base.
Dry run a Uniswap route from wstETH on Base into native ETH on Base.
Preflight staking 0.01 ETH on Ethereum.
Preflight wrapping 0.1 stETH into wstETH on Ethereum.
Dry run wrapping 0.1 stETH into wstETH on Ethereum.
Show my withdrawal requests and claimable ETH on Ethereum.
Show the 5 most recent Lido governance proposals.
```

A fuller walkthrough lives in `DEMO.md`.

## Cursor or Claude MCP configuration

Use a stdio MCP entry that launches the server from this repo.

Example:

```json
{
  "mcpServers": {
    "lido": {
      "command": "node",
      "args": ["/home/drparadox/synthesis_hack/dist/index.js"],
      "env": {
        "LIDO_PRIVATE_KEY": "0x...",
        "ETHEREUM_RPC_URL": "https://eth-mainnet.your-rpc.example",
        "BASE_RPC_URL": "https://mainnet.base.org",
        "OPTIMISM_RPC_URL": "https://mainnet.optimism.io",
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc",
        "UNISWAP_API_KEY": "your-uniswap-api-key"
      }
    }
  }
}
```

If you prefer running TypeScript directly during development, point the MCP client at `tsx` and `/home/drparadox/synthesis_hack/src/index.ts` instead.

## Safety model

- All write tools default to `dry_run=true`
- `lido_get_setup` returns recommended first tools, safety defaults, quickstart prompts, and Uniswap API readiness metadata
- `lido_get_agent_guide` returns the Lido mental model, network boundaries, workflow guidance, and topic-specific tool recommendations
- `lido_preflight_write_action` can validate the path before a Lido-core write is even dry-run
- `lido_preflight_uniswap_route` checks approval requirements, route type, and execution compatibility before a Uniswap swap or bridge is attempted
- `lido_execute_uniswap_route` defaults to `dry_run=true` and uses a direct approval-then-swap flow with `x-permit2-disabled=true`
- `lido_get_uniswap_route_status` can track the source-chain transaction status for swap and bridge routes after submission
- Approval-dependent flows report when an approval is required before the main action can execute
- Withdrawal requests are treated as queue entries, not instant ETH exits
- Governance writes require the configured wallet to be eligible to act

## Notes on rewards

Lido rewards are not a simple claimable bucket.

- `stETH` rewards appear through rebasing balances
- `wstETH` rewards appear through an increasing conversion rate to `stETH`

The `lido_get_rewards` tool can return current reward context or a net on-chain balance delta since a historical block.
That historical delta should only be interpreted as pure staking rewards when the address had no transfers in or out during the interval.

## Notes on unstaking

Unstaking on Lido is a two-phase path:

- request withdrawal from `stETH` or `wstETH`
- wait for queue finalization and then claim ETH

The server exposes both phases separately.

## Skill file

The repo includes `lido.skill.md`, which gives an agent the correct mental model for:

- rebasing `stETH`
- non-rebasing `wstETH`
- L2 vs Ethereum responsibilities
- safe approval and queue usage
- governance caution
