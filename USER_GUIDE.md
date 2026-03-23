# Lido MCP Server - User Guide

This guide helps you install and configure the Lido MCP server for use with **Cursor**, **Claude Desktop**, or any other MCP-compatible client.

## What this server does

- **Lido staking**: Convert ETH to stETH, wrap/unwrap between stETH and wstETH
- **Withdrawal queue**: Request unstaking and claim ETH after finalization
- **Governance**: View and vote on Lido DAO proposals
- **Portfolio**: Monitor balances across Ethereum, Base, Optimism, and Arbitrum
- **Uniswap swaps & bridges**: Route assets between chains with safety checks

All write operations default to `dry_run=true` for safety.

---

## Installation options

### Option 1: Install from npm (recommended for users)

```bash
npm install -g lido-mcp-server
```

Then configure your MCP client to run:
```
lido-mcp-server
```

### Option 2: Clone from GitHub (recommended for developers)

```bash
git clone <repository-url>
cd lido-mcp-server
npm install
npm run build
```

Then configure your MCP client to run the built server:
```
node /path/to/lido-mcp-server/dist/index.js
```

Or for development:
```
npx tsx /path/to/lido-mcp-server/src/index.ts
```

---

## Required configuration

### Environment variables

Create a `.env` file or export these in your shell:

```bash
# Required for any write operations
LIDO_PRIVATE_KEY=0x_your_private_key_here

# Required for Ethereum operations
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Required for Uniswap swap/bridge features
UNISWAP_API_KEY=your_uniswap_api_key_here

# Optional - for L2 balance monitoring
BASE_RPC_URL=https://mainnet.base.org
OPTIMISM_RPC_URL=https://mainnet.optimism.io
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Optional - Uniswap router version (defaults to 2.0)
UNISWAP_UNIVERSAL_ROUTER_VERSION=2.0
```

#### Getting API keys

- **Ethereum RPC**: [Alchemy](https://alchemy.com), [Infura](https://infura.io), or [QuickNode](https://quicknode.com)
- **Uniswap API**: [Uniswap Trade API](https://docs.uniswap.org/api-guide) (free tier available)

---

## MCP client configuration

### Cursor IDE

Open **Cursor Settings** → **Features** → **MCP**, or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lido": {
      "command": "lido-mcp-server",
      "env": {
        "LIDO_PRIVATE_KEY": "0x...",
        "ETHEREUM_RPC_URL": "https://eth-mainnet.g.alchemy.com/v2/...",
        "UNISWAP_API_KEY": "...",
        "BASE_RPC_URL": "https://mainnet.base.org",
        "OPTIMISM_RPC_URL": "https://mainnet.optimism.io",
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc"
      }
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "lido": {
      "command": "lido-mcp-server",
      "env": {
        "LIDO_PRIVATE_KEY": "0x...",
        "ETHEREUM_RPC_URL": "https://eth-mainnet.g.alchemy.com/v2/...",
        "UNISWAP_API_KEY": "...",
        "BASE_RPC_URL": "https://mainnet.base.org",
        "OPTIMISM_RPC_URL": "https://mainnet.optimism.io",
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc"
      }
    }
  }
}
```

### Using full path (if command not in PATH)

If you installed locally or the command isn't found:

```json
{
  "mcpServers": {
    "lido": {
      "command": "node",
      "args": ["/absolute/path/to/lido-mcp-server/dist/index.js"],
      "env": {
        "LIDO_PRIVATE_KEY": "0x...",
        "ETHEREUM_RPC_URL": "https://eth-mainnet.g.alchemy.com/v2/...",
        "UNISWAP_API_KEY": "..."
      }
    }
  }
}
```

### Read-only mode (no private key)

You can use the server without a private key for read-only operations:

```json
{
  "mcpServers": {
    "lido": {
      "command": "lido-mcp-server",
      "env": {
        "ETHEREUM_RPC_URL": "https://eth-mainnet.g.alchemy.com/v2/...",
        "UNISWAP_API_KEY": "...",
        "BASE_RPC_URL": "https://mainnet.base.org"
      }
    }
  }
}
```

---

## Quick start prompts

Once configured, try these prompts in your MCP client:

```
Show my Lido MCP setup status.
```

```
Show my aggregated Lido portfolio summary.
```

```
Preflight staking 0.01 ETH on Ethereum.
```

```
Show bridgable destinations for wstETH on Ethereum.
```

```
Preflight a Uniswap route from ETH on Ethereum into wstETH on Base.
```

```
Show the 5 most recent Lido governance proposals.
```

---

## Safety model

1. **All writes default to `dry_run=true`** - No transactions broadcast without explicit confirmation
2. **Preflight checks** - Validate routes and approvals before attempting execution
3. **Approval transparency** - The server shows exactly what approvals are needed and when
4. **Explicit confirmation required** - Only proceed to `dry_run=false` after reviewing dry-run output

**Never set `dry_run=false` blindly. Always review the dry-run output first.**

---

## Troubleshooting

### "Command not found: lido-mcp-server"

- If installed globally: Check `npm list -g` and ensure it's installed
- Use full path: Replace `"command": "lido-mcp-server"` with `"command": "node"` and `"args": ["/path/to/dist/index.js"]`

### "No RPC URL configured for ethereum"

- Set `ETHEREUM_RPC_URL` environment variable
- Get a free RPC from [Alchemy](https://alchemy.com) or [Infura](https://infura.io)

### "No Uniswap API key configured"

- Get a free API key from [Uniswap](https://docs.uniswap.org/api-guide)
- Set `UNISWAP_API_KEY` environment variable
- Without this, swap/bridge features won't work

### "Wallet address mismatch" or "insufficient funds"

- Ensure `LIDO_PRIVATE_KEY` is set correctly
- The wallet needs ETH for gas on any chain you want to execute transactions

### MCP client shows "connection failed"

- Check Node.js version: `node --version` (must be >= 21)
- Verify environment variables are set in the MCP config
- Try running the command manually in terminal to see errors

### "private key must be 32 bytes"

- Ensure your private key starts with `0x`
- It should be 64 hex characters plus the `0x` prefix (66 chars total)

---

## Feature availability by configuration

| Feature | Requires | Optional |
|---------|----------|----------|
| Read balances | `ETHEREUM_RPC_URL` | `BASE_RPC_URL`, `OPTIMISM_RPC_URL`, `ARBITRUM_RPC_URL` |
| Stake/wrap/unstake | `LIDO_PRIVATE_KEY`, `ETHEREUM_RPC_URL` | - |
| Governance voting | `LIDO_PRIVATE_KEY`, `ETHEREUM_RPC_URL` | - |
| Uniswap swaps | `LIDO_PRIVATE_KEY`, `ETHEREUM_RPC_URL`, `UNISWAP_API_KEY` | Other L2 RPCs for destination reads |
| Cross-chain bridges | `LIDO_PRIVATE_KEY`, source chain RPC, `UNISWAP_API_KEY` | destination chain RPC for status |

---

## Development mode

For local development with hot reload:

```bash
git clone <repository-url>
cd lido-mcp-server
npm install
npm run dev
```

Use this MCP config for development:

```json
{
  "mcpServers": {
    "lido-dev": {
      "command": "npx",
      "args": ["tsx", "/path/to/lido-mcp-server/src/index.ts"],
      "env": {
        "LIDO_PRIVATE_KEY": "0x...",
        "ETHEREUM_RPC_URL": "...",
        "UNISWAP_API_KEY": "..."
      }
    }
  }
}
```

---

## Security notes

- **Never commit private keys** to version control
- **Use environment variables** or MCP client secure storage
- **Test with small amounts** first
- **Review all dry-run outputs** before confirming live execution
- **The server never auto-executes** - human confirmation is always required

---

## Getting help

- Check server status: `Show my Lido MCP setup status.`
- Review the skill file: Ask your agent to read `lido.skill.md`
- Check logs: Run the command manually in terminal to see detailed errors

---

## Next steps

1. Install the server (npm or clone)
2. Get API keys (RPC + Uniswap)
3. Configure your MCP client
4. Test with `Show my Lido MCP setup status.`
5. Try a dry-run stake or swap
6. Review and confirm live execution
