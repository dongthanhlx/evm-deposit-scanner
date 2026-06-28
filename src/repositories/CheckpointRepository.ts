import type { PrismaClient } from '../generated/prisma/index.js'
import type { Checkpoint } from '../domain/types.js'
import type { ICheckpointRepository } from '../domain/interfaces.js'

export class CheckpointRepository implements ICheckpointRepository {
  constructor(private readonly db: PrismaClient) {}

  async get(chainId: number): Promise<Checkpoint | null> {
    const row = await this.db.checkpoint.findUnique({ where: { chainId } })
    if (!row) return null
    return {
      chainId: row.chainId,
      lastProcessedBlock: row.lastProcessedBlock,
      updatedAt: row.updatedAt,
    }
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    await this.db.checkpoint.upsert({
      where: { chainId: checkpoint.chainId },
      update: { lastProcessedBlock: checkpoint.lastProcessedBlock },
      create: {
        chainId: checkpoint.chainId,
        lastProcessedBlock: checkpoint.lastProcessedBlock,
      },
    })
  }
}
