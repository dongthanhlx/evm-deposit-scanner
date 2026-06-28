import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChainScanner } from './ChainScanner.js'
import type { Block, Chain, Deposit, Wallet } from '../domain/types.js'
import type {
  IChainProvider,
  ICheckpointRepository,
  IDepositDetector,
  IDepositRepository,
  INotifier,
  IWalletRepository,
} from '../domain/interfaces.js'

const CHAIN: Chain = { chainId: 1, name: 'Ethereum', rpcWsUrl: 'wss://eth-mainnet.example' }

const makeBlock = (overrides: Partial<Block> = {}): Block => ({
  chainId: 1,
  number: 100n,
  timestamp: 1700000000,
  transactions: [],
  ...overrides,
})

const makeDeposit = (overrides: Partial<Deposit> = {}): Deposit => ({
  txHash: '0xabc',
  logIndex: -1,
  chainId: 1,
  blockNumber: 100n,
  blockTimestamp: 1700000000,
  from: '0xSender',
  to: '0xwatched',
  contractAddress: null,
  amount: 1_000_000_000_000_000_000n,
  tokenSymbol: null,
  tokenDecimals: null,
  ...overrides,
})

const makeWallet = (address: string): Wallet => ({ address, addedAt: new Date() })

describe('ChainScanner', () => {
  let chainProvider: IChainProvider
  let depositDetector: IDepositDetector
  let depositRepository: IDepositRepository
  let checkpointRepository: ICheckpointRepository
  let notifier: INotifier
  let walletRepository: IWalletRepository
  let scanner: ChainScanner

  beforeEach(() => {
    chainProvider = {
      subscribeToBlocks: vi.fn().mockResolvedValue(undefined),
      getTransactions: vi.fn().mockResolvedValue([]),
      getLogs: vi.fn().mockResolvedValue([]),
      disconnect: vi.fn(),
    }
    depositDetector = { detect: vi.fn().mockReturnValue([]) }
    depositRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    }
    checkpointRepository = {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    }
    notifier = { notify: vi.fn().mockResolvedValue(undefined) }
    walletRepository = {
      add: vi.fn().mockResolvedValue({ added: true }),
      remove: vi.fn().mockResolvedValue({ removed: true }),
      list: vi.fn().mockResolvedValue([makeWallet('0xwatched')]),
    }

    scanner = new ChainScanner(
      chainProvider,
      depositDetector,
      depositRepository,
      checkpointRepository,
      notifier,
      walletRepository,
      [],
    )
  })

  describe('block processing', () => {
    it('saves and notifies for a new deposit', async () => {
      const deposit = makeDeposit()
      vi.mocked(chainProvider.subscribeToBlocks).mockImplementationOnce(async (_, onBlock) => {
        await onBlock(makeBlock())
      })
      vi.mocked(depositDetector.detect).mockReturnValue([deposit])

      await scanner.start(CHAIN)

      expect(depositRepository.save).toHaveBeenCalledWith(deposit)
      expect(notifier.notify).toHaveBeenCalledWith(deposit)
    })

    it('reads wallets from repository on every block (dynamic)', async () => {
      vi.mocked(chainProvider.subscribeToBlocks).mockImplementationOnce(async (_, onBlock) => {
        await onBlock(makeBlock())
      })

      await scanner.start(CHAIN)

      expect(walletRepository.list).toHaveBeenCalled()
      expect(depositDetector.detect).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        ['0xwatched'],
        expect.anything(),
      )
    })

    it('skips a deposit that already exists (idempotency)', async () => {
      const deposit = makeDeposit()
      vi.mocked(chainProvider.subscribeToBlocks).mockImplementationOnce(async (_, onBlock) => {
        await onBlock(makeBlock())
      })
      vi.mocked(depositDetector.detect).mockReturnValue([deposit])
      vi.mocked(depositRepository.exists).mockResolvedValue(true)

      await scanner.start(CHAIN)

      expect(depositRepository.save).not.toHaveBeenCalled()
      expect(notifier.notify).not.toHaveBeenCalled()
    })

    it('saves checkpoint after processing a block', async () => {
      vi.mocked(chainProvider.subscribeToBlocks).mockImplementationOnce(async (_, onBlock) => {
        await onBlock(makeBlock({ number: 200n }))
      })

      await scanner.start(CHAIN)

      expect(checkpointRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: 1, lastProcessedBlock: 200n }),
      )
    })

    it('fetches logs for watched contracts and passes them to detector', async () => {
      const mockLog = { txHash: '0xlog', logIndex: 0, blockNumber: 100n, blockTimestamp: 1700000000, contractAddress: '0xUSDC', chainId: 1, topics: [], data: '0x', tokenDecimals: 6, tokenSymbol: 'USDC' }
      vi.mocked(chainProvider.subscribeToBlocks).mockImplementationOnce(async (_, onBlock) => {
        await onBlock(makeBlock())
      })
      vi.mocked(chainProvider.getLogs).mockResolvedValue([mockLog])

      const scannerWithContracts = new ChainScanner(
        chainProvider, depositDetector, depositRepository,
        checkpointRepository, notifier, walletRepository, ['0xUSDC'],
      )
      await scannerWithContracts.start(CHAIN)

      expect(chainProvider.getLogs).toHaveBeenCalledWith(CHAIN, 100n, ['0xUSDC'])
      expect(depositDetector.detect).toHaveBeenCalledWith(
        expect.anything(), [mockLog], expect.anything(), expect.anything(),
      )
    })

    it('processes multiple deposits in one block independently', async () => {
      const deposit1 = makeDeposit({ txHash: '0xaaa' })
      const deposit2 = makeDeposit({ txHash: '0xbbb' })
      vi.mocked(chainProvider.subscribeToBlocks).mockImplementationOnce(async (_, onBlock) => {
        await onBlock(makeBlock())
      })
      vi.mocked(depositDetector.detect).mockReturnValue([deposit1, deposit2])
      vi.mocked(depositRepository.exists)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      await scanner.start(CHAIN)

      expect(depositRepository.save).toHaveBeenCalledTimes(1)
      expect(depositRepository.save).toHaveBeenCalledWith(deposit1)
      expect(notifier.notify).toHaveBeenCalledTimes(1)
    })
  })

  describe('checkpoint resume', () => {
    it('reads checkpoint before subscribing to blocks', async () => {
      vi.mocked(checkpointRepository.get).mockResolvedValue({
        chainId: 1, lastProcessedBlock: 500n, updatedAt: new Date(),
      })

      await scanner.start(CHAIN)

      const getOrder = vi.mocked(checkpointRepository.get).mock.invocationCallOrder[0]
      const subscribeOrder = vi.mocked(chainProvider.subscribeToBlocks).mock.invocationCallOrder[0]
      expect(getOrder).toBeLessThan(subscribeOrder)
    })
  })
})
