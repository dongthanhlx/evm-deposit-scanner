import { describe, it, expect } from 'vitest'
import { AlchemyAdapter } from './AlchemyAdapter.js'

describe('AlchemyAdapter', () => {
  const adapter = new AlchemyAdapter()

  describe('normalizeBlock', () => {
    it('converts viem block to domain Block', () => {
      const block = adapter.normalizeBlock(
        { number: 100n, timestamp: 1700000000n, transactions: [] },
        1,
      )
      expect(block).toEqual({ chainId: 1, number: 100n, timestamp: 1700000000, transactions: [] })
    })

    it('normalizes transactions inside the block', () => {
      const viemTx = {
        hash: '0xabc' as `0x${string}`,
        from: '0xSender' as `0x${string}`,
        to: '0xReceiver' as `0x${string}`,
        value: 1_000_000_000_000_000_000n,
        blockNumber: 100n,
        // other viem fields omitted — normalizer reads only what it needs
      } as any

      const block = adapter.normalizeBlock(
        { number: 100n, timestamp: 1700000000n, transactions: [viemTx] },
        1,
      )

      expect(block.transactions).toHaveLength(1)
      expect(block.transactions[0]).toMatchObject({
        hash: '0xabc',
        from: '0xSender',
        to: '0xReceiver',
        value: 1_000_000_000_000_000_000n,
        blockNumber: 100n,
        blockTimestamp: 1700000000,
        chainId: 1,
      })
    })

    it('handles null block number (pending block edge case)', () => {
      const block = adapter.normalizeBlock(
        { number: null, timestamp: 1700000000n, transactions: [] },
        1,
      )
      expect(block.number).toBe(0n)
    })
  })
})
