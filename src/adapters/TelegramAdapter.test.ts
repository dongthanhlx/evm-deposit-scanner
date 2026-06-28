import { describe, it, expect, vi } from 'vitest'
import { TelegramAdapter } from './TelegramAdapter.js'
import type { Deposit } from '../domain/types.js'

type StubbableBot = { bot: { api: { sendMessage: (...args: unknown[]) => Promise<unknown> } } }

const makeDeposit = (overrides: Partial<Deposit> = {}): Deposit => ({
  txHash: '0xabc123',
  logIndex: -1,
  chainId: 1,
  blockNumber: 100n,
  blockTimestamp: 1700000000,
  from: '0xSender',
  to: '0xWatched',
  contractAddress: null,
  amount: 1_500_000_000_000_000_000n, // 1.5 ETH
  tokenSymbol: null,
  tokenDecimals: null,
  ...overrides,
})

describe('TelegramAdapter.formatMessage', () => {
  const adapter = new TelegramAdapter('dummy-token', '12345')

  it('formats native ETH deposit with human-readable amount and explorer links', () => {
    const msg = adapter.formatMessage(makeDeposit())
    expect(msg).toContain('1.5 ETH')
    expect(msg).toContain('href="https://etherscan.io/address/0xWatched"')
    expect(msg).toContain('href="https://etherscan.io/tx/0xabc123"')
  })

  it('uses the correct explorer for non-Ethereum chains', () => {
    const msg = adapter.formatMessage(makeDeposit({ chainId: 137 }))
    expect(msg).toContain('href="https://polygonscan.com/address/0xWatched"')
    expect(msg).toContain('href="https://polygonscan.com/tx/0xabc123"')
  })

  it('falls back to etherscan for unknown chains', () => {
    const msg = adapter.formatMessage(makeDeposit({ chainId: 999 }))
    expect(msg).toContain('href="https://etherscan.io/address/0xWatched"')
  })

  it('formats ERC-20 deposit with human-readable amount using token decimals', () => {
    const msg = adapter.formatMessage(
      makeDeposit({
        contractAddress: '0xUSDT',
        amount: 297_991_988_846n,
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
      }),
    )
    expect(msg).toContain('297,991.988846 USDT')
    expect(msg).not.toContain('ETH')
  })

  it('falls back to "tokens" when symbol is missing', () => {
    const msg = adapter.formatMessage(
      makeDeposit({ contractAddress: '0xUnknown', tokenSymbol: null }),
    )
    expect(msg).toContain('tokens')
  })
})

describe('TelegramAdapter.notify resilience (Boundary 5)', () => {
  it('does not reject when Telegram send fails — indexer must keep scanning', async () => {
    const adapter = new TelegramAdapter('dummy-token', '12345')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(adapter as unknown as StubbableBot).bot.api.sendMessage = () =>
      Promise.reject(new Error('ETIMEDOUT'))

    await expect(adapter.notify(makeDeposit())).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
