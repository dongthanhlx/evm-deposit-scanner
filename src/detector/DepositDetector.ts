import type { Deposit, Log, Transaction } from '../domain/types.js'
import type { IDepositDetector } from '../domain/interfaces.js'

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export class DepositDetector implements IDepositDetector {
  detect(transactions: Transaction[], logs: Log[], wallets: string[], contracts: string[]): Deposit[] {
    const walletSet = new Set(wallets.map((w) => w.toLowerCase()))
    const contractSet = new Set(contracts.map((c) => c.toLowerCase()))

    return [
      ...this.detectNativeDeposits(transactions, walletSet),
      ...this.detectErc20Deposits(logs, walletSet, contractSet),
    ]
  }

  private detectNativeDeposits(transactions: Transaction[], wallets: Set<string>): Deposit[] {
    return transactions
      .filter((tx) => tx.to !== null && tx.value > 0n && wallets.has(tx.to.toLowerCase()))
      .map((tx) => ({
        txHash: tx.hash,
        logIndex: -1,
        chainId: tx.chainId,
        blockNumber: tx.blockNumber,
        blockTimestamp: tx.blockTimestamp,
        from: tx.from,
        to: tx.to as string,
        contractAddress: null,
        amount: tx.value,
        tokenSymbol: null,
        tokenDecimals: null,
      }))
  }

  private detectErc20Deposits(logs: Log[], wallets: Set<string>, contracts: Set<string>): Deposit[] {
    return logs
      .filter((log) => this.isErc20Transfer(log, wallets, contracts))
      .map((log) => ({
        txHash: log.txHash,
        logIndex: log.logIndex,
        chainId: log.chainId,
        blockNumber: log.blockNumber,
        blockTimestamp: log.blockTimestamp,
        from: this.decodeAddress(log.topics[1]),
        to: this.decodeAddress(log.topics[2]),
        contractAddress: log.contractAddress,
        amount: BigInt(log.data),
        tokenSymbol: log.tokenSymbol,
        tokenDecimals: log.tokenDecimals,
      }))
  }

  private isErc20Transfer(log: Log, wallets: Set<string>, contracts: Set<string>): boolean {
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false
    if (!contracts.has(log.contractAddress.toLowerCase())) return false
    if (log.topics.length < 3) return false
    const toAddress = this.decodeAddress(log.topics[2])
    return wallets.has(toAddress.toLowerCase())
  }

  private decodeAddress(topic: string): string {
    // ABI-encoded address: 32 bytes, address in last 20 bytes
    return '0x' + topic.slice(-40)
  }
}
