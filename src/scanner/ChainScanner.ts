import type { Block, Chain } from '../domain/types.js'
import type {
  IChainProvider,
  IChainScanner,
  ICheckpointRepository,
  IDepositDetector,
  IDepositRepository,
  INotifier,
  IWalletRepository,
} from '../domain/interfaces.js'

export class ChainScanner implements IChainScanner {
  private running = false

  constructor(
    private readonly provider: IChainProvider,
    private readonly detector: IDepositDetector,
    private readonly depositRepository: IDepositRepository,
    private readonly checkpointRepository: ICheckpointRepository,
    private readonly notifier: INotifier,
    private readonly walletRepository: IWalletRepository,
    private readonly contracts: string[],
  ) {}

  async start(chain: Chain): Promise<void> {
    this.running = true
    await this.checkpointRepository.get(chain.chainId)

    await this.provider.subscribeToBlocks(chain, (block) => this.processBlock(chain, block))
  }

  stop(): void {
    this.running = false
    this.provider.disconnect()
  }

  private async processBlock(chain: Chain, block: Block): Promise<void> {
    const wallets = (await this.walletRepository.list()).map((w) => w.address)

    const logs =
      this.contracts.length > 0
        ? await this.provider.getLogs(chain, block.number, this.contracts)
        : []

    const deposits = this.detector.detect(
      block.transactions,
      logs,
      wallets,
      this.contracts,
    )

    for (const deposit of deposits) {
      const alreadyExists = await this.depositRepository.exists(
        deposit.txHash,
        deposit.logIndex,
        deposit.chainId,
      )
      if (alreadyExists) continue

      await this.depositRepository.save(deposit)
      await this.notifier.notify(deposit)
    }

    await this.checkpointRepository.save({
      chainId: chain.chainId,
      lastProcessedBlock: block.number,
      updatedAt: new Date(),
    })
  }
}
