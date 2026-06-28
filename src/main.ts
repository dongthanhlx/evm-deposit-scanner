import { PrismaClient } from './generated/prisma/index.js'
import { config } from './config.js'
import { AlchemyAdapter } from './adapters/AlchemyAdapter.js'
import { TelegramAdapter } from './adapters/TelegramAdapter.js'
import { DepositDetector } from './detector/DepositDetector.js'
import { ChainScanner } from './scanner/ChainScanner.js'
import { DepositRepository } from './repositories/DepositRepository.js'
import { CheckpointRepository } from './repositories/CheckpointRepository.js'
import { WalletRepository } from './repositories/WalletRepository.js'
import type { Chain } from './domain/types.js'

const ALCHEMY_WS_URLS: Record<number, string> = {
  1: 'wss://eth-mainnet.g.alchemy.com/v2',
  137: 'wss://polygon-mainnet.g.alchemy.com/v2',
  8453: 'wss://base-mainnet.g.alchemy.com/v2',
  42161: 'wss://arb-mainnet.g.alchemy.com/v2',
  10: 'wss://opt-mainnet.g.alchemy.com/v2',
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  10: 'Optimism',
}

function buildChain(chainId: number, apiKey: string): Chain {
  const baseUrl = ALCHEMY_WS_URLS[chainId]
  if (!baseUrl) throw new Error(`Unsupported chainId: ${chainId}. Add it to ALCHEMY_WS_URLS.`)
  return {
    chainId,
    name: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    rpcWsUrl: `${baseUrl}/${apiKey}`,
  }
}

async function main() {
  const db = new PrismaClient()
  const alchemyAdapter = new AlchemyAdapter()
  const telegramAdapter = new TelegramAdapter(config.telegram.botToken, config.telegram.chatId)
  const depositDetector = new DepositDetector()
  const depositRepository = new DepositRepository(db)
  const checkpointRepository = new CheckpointRepository(db)
  const walletRepository = new WalletRepository(db)

  const chains = config.chainIds.map((id) => buildChain(id, config.alchemyApiKey))

  console.log(`Starting scanner on chains: ${chains.map((c) => c.name).join(', ')}`)

  const scanners = chains.map(
    (chain) =>
      new ChainScanner(
        alchemyAdapter,
        depositDetector,
        depositRepository,
        checkpointRepository,
        telegramAdapter,
        walletRepository,
        config.contracts,
      ),
  )

  telegramAdapter.startCommands(walletRepository)
  console.log('Telegram command listener started. Use /addwallet, /removewallet, /listwallet.')

  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    scanners.forEach((s) => s.stop())
    db.$disconnect()
    process.exit(0)
  })

  await Promise.all(scanners.map((scanner, i) => scanner.start(chains[i])))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
