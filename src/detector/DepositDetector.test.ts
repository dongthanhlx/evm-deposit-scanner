import { describe, it, expect } from 'vitest'
import { DepositDetector } from './DepositDetector.js'
import type { Transaction, Log } from '../domain/types.js'

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const BASE_TX: Transaction = {
  hash: '0xabc',
  from: '0xSender',
  to: '0xWatchedAddress',
  value: 1_000_000_000_000_000_000n, // 1 ETH
  blockNumber: 100n,
  blockTimestamp: 1700000000,
  chainId: 1,
}

describe('DepositDetector', () => {
  const detector = new DepositDetector()

  describe('native ETH detection', () => {
    it('detects a native ETH deposit to a watched address', () => {
      const deposits = detector.detect([BASE_TX], [], ['0xWatchedAddress'], [])
      expect(deposits).toHaveLength(1)
      expect(deposits[0]).toMatchObject({
        txHash: '0xabc',
        logIndex: -1,
        chainId: 1,
        from: '0xSender',
        to: '0xWatchedAddress',
        contractAddress: null,
        amount: 1_000_000_000_000_000_000n,
      })
    })

    it('ignores transactions to non-watched addresses', () => {
      const deposits = detector.detect([BASE_TX], [], ['0xOtherAddress'], [])
      expect(deposits).toHaveLength(0)
    })

    it('ignores transactions with zero value', () => {
      const zeroTx = { ...BASE_TX, value: 0n }
      const deposits = detector.detect([zeroTx], [], ['0xWatchedAddress'], [])
      expect(deposits).toHaveLength(0)
    })

    it('ignores contract creation transactions (to === null)', () => {
      const contractCreation = { ...BASE_TX, to: null }
      const deposits = detector.detect([contractCreation], [], ['0xWatchedAddress'], [])
      expect(deposits).toHaveLength(0)
    })
  })

  describe('ERC-20 Transfer detection', () => {
  // Real EVM addresses padded to 32 bytes (ABI encoding for indexed params)
  const SENDER_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const WATCHED_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const USDC_CONTRACT = '0xcccccccccccccccccccccccccccccccccccccccc'

    const erc20Log: Log = {
      txHash: '0xerc20tx',
      logIndex: 0,
      blockNumber: 100n,
      blockTimestamp: 1700000000,
      contractAddress: USDC_CONTRACT,
      chainId: 1,
      topics: [
        ERC20_TRANSFER_TOPIC,
        '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ],
      data: '0x0000000000000000000000000000000000000000000000000000000005f5e100', // 100_000_000
      tokenDecimals: 6,
      tokenSymbol: 'USDC',
    }

    it('detects an ERC-20 Transfer to a watched address from a watched contract', () => {
      const deposits = detector.detect([], [erc20Log], [WATCHED_ADDR], [USDC_CONTRACT])
      expect(deposits).toHaveLength(1)
      expect(deposits[0]).toMatchObject({
        txHash: '0xerc20tx',
        logIndex: 0,
        chainId: 1,
        contractAddress: USDC_CONTRACT,
        amount: 100_000_000n,
        tokenDecimals: 6,
        tokenSymbol: 'USDC',
      })
    })

    it('ignores ERC-20 Transfer from non-watched contracts', () => {
      const deposits = detector.detect([], [erc20Log], [WATCHED_ADDR], ['0xOtherContract'])
      expect(deposits).toHaveLength(0)
    })

    it('ignores ERC-20 Transfer to non-watched addresses', () => {
      const deposits = detector.detect([], [erc20Log], ['0xOtherWallet'], [USDC_CONTRACT])
      expect(deposits).toHaveLength(0)
    })

    it('ignores logs that are not ERC-20 Transfer events', () => {
      const otherLog = { ...erc20Log, topics: ['0xOtherTopic'] }
      const deposits = detector.detect([], [otherLog], ['0xWatchedAddress'], ['0xUSDC'])
      expect(deposits).toHaveLength(0)
    })
  })
})
