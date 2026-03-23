# Lido Skill

## Mental model

Lido staking on Ethereum turns ETH into `stETH`.

`stETH` is a rebasing token.
Its balance changes as Lido oracle reports rewards and penalties.
The underlying accounting unit is shares, not displayed balance.
If you are reasoning about long-term position behavior, shares are the stable anchor and displayed `stETH` balance is the rebased surface.

`wstETH` is the wrapped, non-rebasing form of `stETH`.
Its token balance stays fixed, while each unit of `wstETH` becomes redeemable for more `stETH` over time.
That is why `wstETH` is the safer default for bridges, vaults, and DeFi integrations that do not handle rebasing tokens correctly.

## When to use stETH vs wstETH

Use `stETH` when:
- you are staking directly on Ethereum and want the simplest canonical receipt token
- you want rebases reflected directly in wallet balance
- you may enter the withdrawal queue using `stETH`

Use `wstETH` when:
- you want a non-rebasing position representation
- you are moving exposure into DeFi or across L2s like Base, Optimism, or Arbitrum
- you need predictable token balances for automation logic

## Safe operating patterns

Always start with `dry_run=true`.
Only switch to `dry_run=false` after the tool result clearly matches intent.

A safe agent workflow is:
- inspect setup
- inspect the aggregated portfolio summary
- run write preflight checks for the intended action
- dry-run the write
- execute with a small amount

For wrap and unstake requests, approvals matter.
If allowance is insufficient and `approve_if_needed=true`, the server may need to send an approval transaction before the main action.
Treat approval plus action as a two-step write path.

Use `lido_get_portfolio_summary` when you want a single view of balances, claimable withdrawals, and recent governance context.
Use `lido_preflight_write_action` before any write when you want the agent to explain blockers, approvals, and the next safest step.

## Staking and unstaking specifics

Staking is immediate minting of `stETH` against ETH deposit.
Unstaking is not immediate ETH redemption.
On Lido, unstaking means creating withdrawal queue requests.
Those requests mint `unstETH` NFTs in the queue.
ETH is only claimable after finalization.
A safe agent should never promise instant exit liquidity from the queue.

## Rewards reasoning

For `stETH`, balance growth comes from rebasing.
For `wstETH`, token count stays constant and value accrues through the `stETH per wstETH` exchange rate.
If calculating rewards over time, remember that pure on-chain balance deltas are only equal to rewards when there were no transfers in or out during the interval.
Otherwise the result is net position change, not pure staking income.

## Governance reasoning

Lido DAO governance uses Aragon voting on Ethereum.
Before voting, verify:
- the target proposal id
- whether the wallet can vote at the proposal snapshot
- whether the intended action is yes or no
- whether auto-execution on decision is appropriate

Do not cast or execute governance actions without an explicit human instruction.

## Swap and bridge reasoning

The server exposes Uniswap-powered routing for same-chain swaps and cross-chain bridges.

### Safety model for Uniswap routes

The server uses a direct approval-then-swap flow with `x-permit2-disabled=true`.
It does not require or accept Permit2 signatures.

Always preflight first using `lido_preflight_uniswap_route`:
- confirms API key availability
- resolves token aliases (eth, steth, wsteth, or explicit addresses)
- checks approval requirements on the source chain
- reports the selected routing type and executability
- identifies blockers before any transaction is attempted

Execution defaults to `dry_run=true`:
- dry run returns approval calldata if needed
- dry run returns the swap/bridge transaction calldata for inspection
- only execute live after explicit human confirmation

### Routing types and executability

Preflight surfaces the route type (CLASSIC, BRIDGE, WRAP, UNWRAP, UNISWAPX variants, etc.).
The server can execute these routing types live:
- CLASSIC (direct protocol pool swaps)
- BRIDGE (cross-chain via bridge partners)
- WRAP (wrapping native assets)
- UNWRAP (unwrapping wrapped assets)

UniswapX routes (DUTCH_LIMIT, DUTCH_V2, DUTCH_V3, PRIORITY) may appear in preflight results but are surfaced, not executed, by this server.

### Approval handling

If the source token is not native ETH and allowance is insufficient:
- preflight reports `needs_approval: true`
- with `approve_if_needed=true`, live execution sends approval before the swap
- some tokens require a cancel-and-replace approval pattern; preflight surfaces this in the `cancel` field

### Cross-chain bridge specifics

Bridging is initiated by a source-chain transaction.
After the source transaction mines, assets arrive on the destination chain asynchronously.

Use `lido_get_uniswap_route_status` with the source chain and transaction hash to monitor progress.
Do not assume instant destination-chain availability.

### Key differences from Lido core actions

- Uniswap routes execute on the source chain provided; Lido core writes execute on Ethereum
- Uniswap routes use an external API for quote generation; Lido core actions use direct contract calls
- Bridge routes require monitoring; Lido staking/wrapping are single-transaction outcomes

## Network boundaries

Ethereum mainnet is where core staking, wrapping, withdrawal queue actions, and governance live.
L2s such as Base, Optimism, and Arbitrum primarily expose bridged `wstETH` for balance monitoring and position awareness.
Do not assume L2 `wstETH` implies native staking or native Lido governance on that L2.
