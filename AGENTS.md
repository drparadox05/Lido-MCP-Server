# AGENTS.md

## Overview

This repository contains a TypeScript stdio MCP server for Lido.
It exposes real on-chain tools for staking, wrapping, withdrawal queue management, reward-aware position reads, and Lido DAO governance actions.

The server is intended to be launched by an MCP-compatible client such as Cursor or Claude Desktop.
It is not a REST API wrapper.

## Runtime model

- Transport: stdio
- Entrypoint: `src/index.ts`
- Server factory: `src/server/createServer.ts`
- MCP SDK: `@modelcontextprotocol/sdk`
- Chain client library: `viem`
- Validation: `zod`

## Supported networks

- `ethereum`
- `base`
- `optimism`
- `arbitrum`

Core staking, withdrawal queue actions, rewards, and governance writes execute on `ethereum`.
L2 networks are used for balance-aware reads of bridged Lido assets.

## Exposed MCP tools

- `lido_get_setup`
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

## Safety model

- All write tools accept `dry_run`
- All write tools default to `dry_run=true`
- Approval-dependent flows report when an approval is required before the primary action
- Withdrawal requests are queue entries, not instant ETH exits
- Governance writes require the configured wallet to be eligible to act

## Environment

Sensitive environment access is centralized in `src/config/env.ts`.
Expected variables include:

- `LIDO_PRIVATE_KEY`
- `ETHEREUM_RPC_URL`
- `BASE_RPC_URL`
- `OPTIMISM_RPC_URL`
- `ARBITRUM_RPC_URL`

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
  index.ts
```

## Key implementation notes

- `src/lido/abis.ts` holds contract ABIs
- `src/lido/networks.ts` holds network metadata and RPC resolution
- `src/lido/clients.ts` creates public and wallet clients
- `src/lido/advisor.ts` implements portfolio summarization and write preflight checks
- `src/lido/account.ts`, `rewards.ts`, `staking.ts`, `withdrawals.ts`, and `governance.ts` contain domain logic
- `src/shared/mcp.ts` formats MCP JSON responses
- `src/lido.ts` is a compatibility barrel that re-exports `src/lido/index.ts`

## Build and run

```bash
npm install
npm run build
npm start
```

For development:

```bash
npm run dev
```
