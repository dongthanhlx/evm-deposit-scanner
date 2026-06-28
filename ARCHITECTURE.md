# ARCHITECTURE.md — blockchain-scanner

## Walking skeleton (MVP)

```
Alchemy WebSocket
      │
      ▼
┌─────────────────┐
│  AlchemyAdapter │  Infrastructure — normalizes raw RPC events to domain Block
│  (adapters/)    │  Implements: IChainProvider
└────────┬────────┘
         │ Block (domain type)
         ▼
┌─────────────────┐
│  ChainScanner   │  Domain service — drives the scan loop per Chain
│  (scanner/)     │  Implements: IChainScanner
│                 │  Holds: IChainProvider + IDepositDetector + ICheckpointRepository
└────────┬────────┘
         │ Transaction[]
         ▼
┌─────────────────────┐
│  DepositDetector    │  Domain — classifies Transactions into Deposits
│  (detector/)        │  Filters: watched Wallets + watched Contracts
└─────────┬───────────┘
          │ Deposit[]
          ├────────────────────────────────┐
          ▼                                ▼
┌─────────────────────┐      ┌────────────────────────┐
│  DepositRepository  │      │    TelegramAdapter      │
│  (repositories/)    │      │    (adapters/)          │
│  Prisma + Postgres  │      │    Implements: INotifier│
└─────────────────────┘      └────────────────────────┘
```

## Module structure

```
src/
  adapters/
    AlchemyAdapter.ts       # IChainProvider impl — WebSocket subscription
    TelegramAdapter.ts      # INotifier impl — sends Deposit notifications
  scanner/
    IChainScanner.ts        # Interface — one impl per future provider
    ChainScanner.ts         # Drives block loop, checkpoints, orchestrates
  detector/
    DepositDetector.ts      # Classifies Transaction[] → Deposit[]
  repositories/
    DepositRepository.ts    # IDepositRepository impl
    CheckpointRepository.ts # ICheckpointRepository impl
  domain/
    types.ts                # Chain, Block, Transaction, Deposit, Wallet, Contract, Checkpoint
    interfaces.ts           # IChainProvider, IDepositDetector, IDepositRepository,
                            #   ICheckpointRepository, INotifier
  main.ts                   # Bootstrap: read env, create instances, wire DI, start scanners
prisma/
  schema.prisma
```

## Core domain types

```typescript
// Value Objects (immutable — never change after creation)
type Chain = { chainId: number; name: string; rpcUrl: string }
type Deposit = {
  txHash: string
  logIndex: number    // -1 for native ETH, ≥0 for ERC-20 Transfer events
  chainId: number
  blockNumber: bigint
  blockTimestamp: number
  from: string
  to: string          // the watched Wallet address
  contractAddress: string | null   // null for native ETH
  amount: bigint      // wei for ETH, token decimals for ERC-20
  tokenSymbol: string | null
}

// Entities (mutable — persisted, updated over time)
type Checkpoint = {
  chainId: number
  lastProcessedBlock: bigint
  updatedAt: Date
}

// Not domain types — these come from viem and are normalized in AlchemyAdapter
// before entering the domain. Domain never sees viem's raw types.
```

## Interfaces (dependency inversion)

```typescript
interface IChainProvider {
  subscribeToBlocks(chain: Chain, onBlock: (block: Block) => Promise<void>): Promise<void>
  getTransactions(chain: Chain, blockNumber: bigint): Promise<Transaction[]>
  getLogs(chain: Chain, blockNumber: bigint, contracts: string[]): Promise<Log[]>
}

interface IChainScanner {
  start(chain: Chain): Promise<void>
  stop(): Promise<void>
}

interface IDepositDetector {
  detect(txs: Transaction[], logs: Log[], wallets: string[], contracts: string[]): Deposit[]
}

interface IDepositRepository {
  save(deposit: Deposit): Promise<void>  // upsert — idempotent
  exists(txHash: string, logIndex: number, chainId: number): Promise<boolean>
}

interface ICheckpointRepository {
  get(chainId: number): Promise<Checkpoint | null>
  save(checkpoint: Checkpoint): Promise<void>
}

interface INotifier {
  notify(deposit: Deposit): Promise<void>
}
```

## ADR-001: IChainScanner per chain from day one

**Decision:** Create one ChainScanner instance per Chain config. New chain = new entry in CHAIN_IDS env var + new Alchemy WebSocket connection. Zero code changes to add a chain.

**Alternatives considered:**
- Single scanner with chain list: rejected — harder to isolate per-chain errors and rate limits
- Per-chain subprocesses: rejected — premature complexity for MVP

**Consequences:**
- Config-driven multichain works from day one
- Each chain's Checkpoint is tracked independently
- Per-chain errors don't affect other chains
- MVP with 1 chain has the same code path as production with 5 chains

## ADR-002: Alchemy WebSocket over polling

**Decision:** Subscribe to `eth_subscribe("newHeads")` for real-time blocks rather than polling `eth_getBlockNumber` on a timer.

**Consequences:**
- Lower latency (milliseconds vs seconds)
- Must handle reconnect on disconnect (exponential backoff required)
- Alchemy free tier: 300 CU/s — WebSocket subscriptions count as 1 CU/block

## Prisma schema (target)

```prisma
model Deposit {
  id              Int      @id @default(autoincrement())
  txHash          String
  logIndex        Int
  chainId         Int
  blockNumber     BigInt
  blockTimestamp  DateTime
  from            String
  to              String
  contractAddress String?
  amount          BigInt
  tokenSymbol     String?
  createdAt       DateTime @default(now())

  @@unique([txHash, logIndex, chainId])
}

model Checkpoint {
  chainId            Int      @id
  lastProcessedBlock BigInt
  updatedAt          DateTime @updatedAt
}
```
