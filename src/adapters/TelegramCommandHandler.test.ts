import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IWalletRepository } from '../domain/interfaces.js'
import type { Wallet } from '../domain/types.js'
import { TelegramAdapter } from './TelegramAdapter.js'

// grammy Bot is heavy — we test the handler logic through the public method
// that processes commands, not through the bot internals

const makeWalletRepo = (): IWalletRepository => ({
  add: vi.fn().mockResolvedValue({ added: true }),
  remove: vi.fn().mockResolvedValue({ removed: true }),
  list: vi.fn().mockResolvedValue([]),
})

describe('TelegramAdapter command handling', () => {
  let walletRepo: IWalletRepository
  let adapter: TelegramAdapter
  let replies: string[]

  beforeEach(() => {
    walletRepo = makeWalletRepo()
    adapter = new TelegramAdapter('dummy-token', '999')
    replies = []
  })

  // handleCommand is the pure logic extracted from grammy callbacks —
  // tests it without needing a real bot connection
  describe('handleCommand', () => {
    it('/addwallet saves address and confirms', async () => {
      const reply = await adapter.handleCommand('addwallet', '0xABCdef', '999', walletRepo)
      expect(walletRepo.add).toHaveBeenCalledWith('0xABCdef')
      expect(reply).toContain('Added')
      expect(reply).toContain('0xABCdef')
    })

    it('/addwallet with duplicate address reports already watching', async () => {
      vi.mocked(walletRepo.add).mockResolvedValue({ added: false })
      const reply = await adapter.handleCommand('addwallet', '0xABCdef', '999', walletRepo)
      expect(reply?.toLowerCase()).toContain('already watching')
    })

    it('/addwallet rejects empty address', async () => {
      const reply = await adapter.handleCommand('addwallet', '', '999', walletRepo)
      expect(walletRepo.add).not.toHaveBeenCalled()
      expect(reply).toContain('Usage')
    })

    it('/removewallet deletes address and confirms', async () => {
      const reply = await adapter.handleCommand('removewallet', '0xABCdef', '999', walletRepo)
      expect(walletRepo.remove).toHaveBeenCalledWith('0xABCdef')
      expect(reply).toContain('Removed')
    })

    it('/removewallet with unknown address reports not watching', async () => {
      vi.mocked(walletRepo.remove).mockResolvedValue({ removed: false })
      const reply = await adapter.handleCommand('removewallet', '0xABCdef', '999', walletRepo)
      expect(reply?.toLowerCase()).toContain('not watching')
    })

    it('/listwallet returns all watched addresses', async () => {
      const wallets: Wallet[] = [
        { address: '0xaaa', addedAt: new Date() },
        { address: '0xbbb', addedAt: new Date() },
      ]
      vi.mocked(walletRepo.list).mockResolvedValue(wallets)
      const reply = await adapter.handleCommand('listwallet', '', '999', walletRepo)
      expect(reply).toContain('0xaaa')
      expect(reply).toContain('0xbbb')
    })

    it('/listwallet with no wallets says empty', async () => {
      const reply = await adapter.handleCommand('listwallet', '', '999', walletRepo)
      expect(reply).toContain('No wallets')
    })

    it('rejects commands from unauthorized chat IDs', async () => {
      const reply = await adapter.handleCommand('addwallet', '0xABC', '000-attacker', walletRepo)
      expect(walletRepo.add).not.toHaveBeenCalled()
      expect(reply).toBeNull() // silently ignore unauthorized
    })
  })
})
