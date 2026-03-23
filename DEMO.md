# Demo Guide

## Goal

This guide gives a judge or developer a fast path to evaluate the Lido MCP server in Cursor or Claude Desktop.

The strongest story is:

- inspect setup
- inspect the full Lido portfolio
- preflight a write safely
- dry-run the write
- preflight a Uniswap bridge or swap route safely
- dry-run the Uniswap route with approvals surfaced explicitly
- inspect governance context

## Recommended flow

### 1. Check setup

Prompt:

```text
Show my Lido MCP setup status.
```

Expected outcome:

- confirms wallet configuration
- confirms RPC availability
- shows readable and writable networks

### 2. Inspect the full portfolio

Prompt:

```text
Show my aggregated Lido portfolio summary.
```

Expected outcome:

- balances across Ethereum, Base, Optimism, and Arbitrum
- total stETH-equivalent exposure
- withdrawal queue status and claimable ETH
- recent governance context
- action recommendations

### 3. Preflight a write before execution

Prompt:

```text
Preflight wrapping 0.1 stETH into wstETH on Ethereum.
```

Expected outcome:

- checks wallet presence
- validates balance
- checks allowance
- states whether approval is required
- recommends the next safe command

### 4. Dry-run the actual write

Prompt:

```text
Dry run wrapping 0.1 stETH into wstETH on Ethereum.
```

Expected outcome:

- returns the simulated request
- shows whether approval is part of the path
- does not broadcast a transaction

### 5. Inspect governance

Prompt:

```text
Show the 5 most recent Lido governance proposals and whether my wallet can vote.
```

Expected outcome:

- recent proposals
- execution state
- wallet voting eligibility if a wallet is configured

### 6. Preflight a Uniswap bridge or swap route

Prompt:

```text
Preflight a Uniswap route from ETH on Ethereum into wstETH on Base.
```

Expected outcome:

- confirms Uniswap API readiness
- resolves token aliases and source/destination chains
- shows whether approval is required on the source chain
- reports the selected routing type and whether the server can execute it live
- recommends the next safe command

### 7. Dry-run the Uniswap route

Prompt:

```text
Dry run a Uniswap route from wstETH on Base into native ETH on Base.
```

Expected outcome:

- returns approval transaction details if needed
- returns the generated swap transaction calldata
- does not broadcast any transaction
- makes the route shape and gas expectations explicit before execution

## Copy-paste prompt set

```text
Show my Lido MCP setup status.
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

## What judges should notice

- all write actions are safe by default because `dry_run=true`
- the preflight tool turns raw contract actions into agent-friendly safety checks
- the Uniswap route preflight exposes approval requirements and route compatibility before any source-chain transaction is sent
- the portfolio summary tool gives a single high-signal view instead of forcing many separate calls
- Ethereum is the canonical execution layer for Lido core actions while L2s provide read visibility for bridged assets
