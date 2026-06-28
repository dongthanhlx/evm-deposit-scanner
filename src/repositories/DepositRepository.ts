import { Prisma, type PrismaClient } from '../generated/prisma/index.js'
import type { Deposit } from '../domain/types.js'
import type { IDepositRepository } from '../domain/interfaces.js'

export class DepositRepository implements IDepositRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(deposit: Deposit): Promise<void> {
    await this.db.deposit.upsert({
      where: {
        txHash_logIndex_chainId: {
          txHash: deposit.txHash,
          logIndex: deposit.logIndex,
          chainId: deposit.chainId,
        },
      },
      update: {},
      create: {
        txHash: deposit.txHash,
        logIndex: deposit.logIndex,
        chainId: deposit.chainId,
        blockNumber: deposit.blockNumber,
        blockTimestamp: new Date(deposit.blockTimestamp * 1000),
        from: deposit.from,
        to: deposit.to,
        contractAddress: deposit.contractAddress,
        amount: new Prisma.Decimal(deposit.amount.toString()),
        tokenSymbol: deposit.tokenSymbol,
      },
    })
  }

  async exists(txHash: string, logIndex: number, chainId: number): Promise<boolean> {
    const count = await this.db.deposit.count({
      where: { txHash, logIndex, chainId },
    })
    return count > 0
  }
}
