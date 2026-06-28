# evm-deposit-scanner

Real-time EVM deposit detector. Watches a set of addresses across multiple chains via Alchemy WebSocket, saves incoming deposits to PostgreSQL, and sends Telegram notifications.

## What it does

- Subscribes to new blocks on one or more EVM chains (Ethereum, Polygon, Base, Arbitrum, Optimism)
- Detects native ETH transfers and ERC-20 `Transfer` events to watched addresses
- Saves each deposit idempotently — safe to restart, no double-processing
- Sends a Telegram notification per deposit with amount, explorer links, and token info
- Manages watched addresses via Telegram commands (`/addwallet`, `/removewallet`, `/listwallet`)

## Stack

- **Runtime:** Node.js 20+, TypeScript 5 (strict)
- **Blockchain:** [viem](https://viem.sh/) 2.x — WebSocket transport via Alchemy
- **Database:** PostgreSQL + [Prisma](https://www.prisma.io/) ORM
- **Notifications:** Telegram Bot ([grammY](https://grammy.dev/))
- **Tests:** [Vitest](https://vitest.dev/) — 32 tests

## Architecture

```
Alchemy WebSocket
      │
      ▼
 AlchemyAdapter        — normalizes raw RPC → domain Block
      │
      ▼
 ChainScanner          — drives block loop, persists Checkpoint
      │
      ▼
 DepositDetector       — classifies transactions → Deposit[]
      │
      ├──▶ DepositRepository   — upsert to Postgres (idempotent)
      └──▶ TelegramAdapter     — send notification (fail-safe, 10s timeout)
```

One `ChainScanner` instance per chain — add a chain by appending its ID to `CHAIN_IDS`, zero code changes.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ALCHEMY_API_KEY` | Alchemy API key (used for all chains) |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token (from [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID` | Chat or channel ID that receives notifications |
| `WATCHED_ADDRESSES` | Comma-separated addresses to seed on first run (optional — use `/addwallet` instead) |
| `WATCHED_CONTRACTS` | Comma-separated ERC-20 contract addresses to monitor (optional) |
| `CHAIN_IDS` | Comma-separated chain IDs, e.g. `1` for Ethereum, `1,137` for Ethereum + Polygon |

**Supported chain IDs:** 1 (Ethereum), 137 (Polygon), 8453 (Base), 42161 (Arbitrum), 10 (Optimism)

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Start

```bash
npm start
```

```
Starting scanner on chains: Ethereum
Telegram command listener started. Use /addwallet, /removewallet, /listwallet.
```

## Telegram commands

Send these in the chat/channel set as `TELEGRAM_CHAT_ID`:

| Command | Description |
|---|---|
| `/addwallet 0xAddress` | Start watching an address |
| `/removewallet 0xAddress` | Stop watching an address |
| `/listwallet` | List all watched addresses |

## Development

```bash
npm test          # run all tests
npm run test:watch   # watch mode
npm run build     # typecheck (tsc --noEmit)
```

## Resilience notes

- **Deposits are idempotent** — unique key `(txHash, logIndex, chainId)`. Restarting the scanner never double-saves.
- **Checkpoint persisted per block** — on restart, scanning resumes from the last processed block, not from the chain tip.
- **Telegram failures are non-fatal** — a `sendMessage` timeout or network error logs a warning and scanning continues. The deposit is already saved in Postgres.
- **Per-chain isolation** — each chain runs its own scanner; an error on one chain does not affect others.
