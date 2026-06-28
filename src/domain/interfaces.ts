import type { Block, Chain, Checkpoint, Deposit, Log, Transaction, Wallet } from './types.js'

export interface IChainProvider {
  subscribeToBlocks(chain: Chain, onBlock: (block: Block) => Promise<void>): Promise<void>
  getTransactions(chain: Chain, blockNumber: bigint): Promise<Transaction[]>
  getLogs(chain: Chain, blockNumber: bigint, contracts: string[]): Promise<Log[]>
  disconnect(): void
}

export interface IChainScanner {
  start(chain: Chain): Promise<void>
  stop(): void
}

export interface IDepositDetector {
  detect(
    transactions: Transaction[],
    logs: Log[],
    wallets: string[],
    contracts: string[]
  ): Deposit[]
}

export interface IDepositRepository {
  save(deposit: Deposit): Promise<void>
  exists(txHash: string, logIndex: number, chainId: number): Promise<boolean>
}

export interface ICheckpointRepository {
  get(chainId: number): Promise<Checkpoint | null>
  save(checkpoint: Checkpoint): Promise<void>
}

export interface IWalletRepository {
  add(address: string): Promise<{ added: boolean }>
  remove(address: string): Promise<{ removed: boolean }>
  list(): Promise<Wallet[]>
}

export interface INotifier {
  notify(deposit: Deposit): Promise<void>
}
