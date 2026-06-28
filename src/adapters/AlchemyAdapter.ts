import {
  createPublicClient,
  defineChain,
  formatEther,
  parseAbi,
  parseAbiItem,
  webSocket,
  type Log as ViemLog,
  type PublicClient,
  type Transaction as ViemTx,
} from 'viem'
import type { Block, Chain, Log, Transaction } from '../domain/types.js'
import type { IChainProvider } from '../domain/interfaces.js'

type UnwatchFn = () => void

const ERC20_DECIMALS_ABI = parseAbi(['function decimals() view returns (uint8)'])
const ERC20_SYMBOL_ABI = parseAbi(['function symbol() view returns (string)'])

export class AlchemyAdapter implements IChainProvider {
  private clients = new Map<number, PublicClient>()
  private unwatchers = new Map<number, UnwatchFn>()
  private readonly decimalsCache = new Map<string, number>()
  private readonly symbolCache = new Map<string, string>()

  async subscribeToBlocks(chain: Chain, onBlock: (block: Block) => Promise<void>): Promise<void> {
    const client = this.getOrCreateClient(chain)

    await new Promise<void>((_, reject) => {
      const unwatch = client.watchBlocks({
        includeTransactions: true,
        onBlock: async (viemBlock) => {
          const block = this.normalizeBlock(viemBlock, chain.chainId)
          await onBlock(block)
        },
        onError: (error) => reject(error),
      })
      this.unwatchers.set(chain.chainId, unwatch)
    })
  }

  async getLogs(chain: Chain, blockNumber: bigint, contracts: string[]): Promise<Log[]> {
    const client = this.getOrCreateClient(chain)
    const viemLogs = await client.getLogs({
      address: contracts as `0x${string}`[],
      event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
      fromBlock: blockNumber,
      toBlock: blockNumber,
    })
    const uniqueAddresses = [...new Set(viemLogs.map((l) => l.address.toLowerCase()))]
    await Promise.all(uniqueAddresses.map((addr) => this.cacheTokenMetadata(client, addr)))
    return viemLogs.map((log) => {
      const addr = log.address.toLowerCase()
      return this.normalizeLog(
        log,
        chain.chainId,
        this.decimalsCache.get(addr) ?? null,
        this.symbolCache.get(addr) ?? null,
      )
    })
  }

  private async cacheTokenMetadata(client: PublicClient, contractAddress: string): Promise<void> {
    if (this.decimalsCache.has(contractAddress)) return
    const addr = contractAddress as `0x${string}`
    const [decimals, symbol] = await Promise.allSettled([
      client.readContract({ address: addr, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' }),
      client.readContract({ address: addr, abi: ERC20_SYMBOL_ABI, functionName: 'symbol' }),
    ])
    this.decimalsCache.set(contractAddress, decimals.status === 'fulfilled' ? Number(decimals.value) : 18)
    this.symbolCache.set(contractAddress, symbol.status === 'fulfilled' ? String(symbol.value) : '')
  }

  getTransactions(): Promise<Transaction[]> {
    // Transactions come from block.transactions via subscribeToBlocks (includeTransactions: true)
    return Promise.resolve([])
  }

  disconnect(): void {
    for (const unwatch of this.unwatchers.values()) unwatch()
    this.unwatchers.clear()
    this.clients.clear()
  }

  private getOrCreateClient(chain: Chain): PublicClient {
    const existing = this.clients.get(chain.chainId)
    if (existing) return existing

    const httpUrl = chain.rpcWsUrl.replace('wss://', 'https://')
    const viemChain = defineChain({
      id: chain.chainId,
      name: chain.name,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [httpUrl], webSocket: [chain.rpcWsUrl] } },
    })

    const client = createPublicClient({
      chain: viemChain,
      transport: webSocket(chain.rpcWsUrl),
    })

    this.clients.set(chain.chainId, client)
    return client
  }

  // These normalise* methods are pure and independently testable
  normalizeBlock(viemBlock: { number: bigint | null; timestamp: bigint; transactions: ViemTx[] }, chainId: number): Block {
    return {
      chainId,
      number: viemBlock.number ?? 0n,
      timestamp: Number(viemBlock.timestamp),
      transactions: viemBlock.transactions.map((tx) => this.normalizeTx(tx, chainId, Number(viemBlock.timestamp))),
    }
  }

  normalizeTx(tx: ViemTx, chainId: number, blockTimestamp: number): Transaction {
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to ?? null,
      value: tx.value,
      blockNumber: tx.blockNumber ?? 0n,
      blockTimestamp,
      chainId,
    }
  }

  normalizeLog(
    log: ViemLog & { topics: string[] },
    chainId: number,
    tokenDecimals: number | null = null,
    tokenSymbol: string | null = null,
  ): Log {
    return {
      txHash: log.transactionHash ?? '',
      logIndex: log.logIndex ?? 0,
      blockNumber: log.blockNumber ?? 0n,
      blockTimestamp: 0,
      contractAddress: log.address,
      topics: log.topics,
      data: log.data,
      chainId,
      tokenDecimals,
      tokenSymbol,
    }
  }
}
