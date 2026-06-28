import type { PrismaClient } from '../generated/prisma/index.js'
import type { Wallet } from '../domain/types.js'
import type { IWalletRepository } from '../domain/interfaces.js'

export class WalletRepository implements IWalletRepository {
  constructor(private readonly db: PrismaClient) {}

  async add(address: string): Promise<{ added: boolean }> {
    const normalized = address.toLowerCase()
    const existing = await this.db.wallet.findUnique({ where: { address: normalized } })
    if (existing) return { added: false }
    await this.db.wallet.create({ data: { address: normalized } })
    return { added: true }
  }

  async remove(address: string): Promise<{ removed: boolean }> {
    const normalized = address.toLowerCase()
    const existing = await this.db.wallet.findUnique({ where: { address: normalized } })
    if (!existing) return { removed: false }
    await this.db.wallet.delete({ where: { address: normalized } })
    return { removed: true }
  }

  async list(): Promise<Wallet[]> {
    const rows = await this.db.wallet.findMany({ orderBy: { addedAt: 'asc' } })
    return rows.map((r) => ({ address: r.address, addedAt: r.addedAt }))
  }
}
