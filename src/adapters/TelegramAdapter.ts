import { Bot } from 'grammy'
import { formatEther, formatUnits } from 'viem'
import type { Deposit } from '../domain/types.js'
import type { INotifier, IWalletRepository } from '../domain/interfaces.js'

const EXPLORER_BASE: Record<number, string> = {
  1:     'https://etherscan.io',
  137:   'https://polygonscan.com',
  8453:  'https://basescan.org',
  42161: 'https://arbiscan.io',
  10:    'https://optimistic.etherscan.io',
}

// A notification failure must never stall block scanning (Boundary 5):
// fail fast on a hung API, log the gap, and let the indexer continue.
const SEND_TIMEOUT_SECONDS = 10

export class TelegramAdapter implements INotifier {
  private readonly bot: Bot

  constructor(botToken: string, private readonly chatId: string) {
    this.bot = new Bot(botToken, { client: { timeoutSeconds: SEND_TIMEOUT_SECONDS } })
  }

  async notify(deposit: Deposit): Promise<void> {
    try {
      await this.bot.api.sendMessage(this.chatId, this.formatMessage(deposit), {
        parse_mode: 'HTML',
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(
        `Telegram notify failed for ${deposit.txHash}:${deposit.logIndex} — scanning continues (${reason})`,
      )
    }
  }

  // Registers grammy command handlers and starts polling.
  // Called once from main.ts after all dependencies are wired.
  startCommands(walletRepository: IWalletRepository): void {
    this.bot.command('addwallet', async (ctx) => {
      const fromChatId = String(ctx.chat.id)
      const address = ctx.match.trim()
      const reply = await this.handleCommand('addwallet', address, fromChatId, walletRepository)
      if (reply) await ctx.reply(reply)
    })

    this.bot.command('removewallet', async (ctx) => {
      const fromChatId = String(ctx.chat.id)
      const address = ctx.match.trim()
      const reply = await this.handleCommand('removewallet', address, fromChatId, walletRepository)
      if (reply) await ctx.reply(reply)
    })

    this.bot.command('listwallet', async (ctx) => {
      const fromChatId = String(ctx.chat.id)
      const reply = await this.handleCommand('listwallet', '', fromChatId, walletRepository)
      if (reply) await ctx.reply(reply)
    })

    this.bot.start()
  }

  // Pure command logic — testable without a real bot connection
  async handleCommand(
    command: string,
    arg: string,
    fromChatId: string,
    walletRepository: IWalletRepository,
  ): Promise<string | null> {
    if (fromChatId !== this.chatId) return null

    if (command === 'addwallet') {
      if (!arg) return 'Usage: /addwallet 0xAddress'
      const { added } = await walletRepository.add(arg)
      return added ? `✅ Added: ${arg}` : `Already watching: ${arg}`
    }

    if (command === 'removewallet') {
      if (!arg) return 'Usage: /removewallet 0xAddress'
      const { removed } = await walletRepository.remove(arg)
      return removed ? `✅ Removed: ${arg}` : `Not watching: ${arg}`
    }

    if (command === 'listwallet') {
      const wallets = await walletRepository.list()
      if (wallets.length === 0) return 'No wallets being watched.'
      return `Watching ${wallets.length} wallet(s):\n` + wallets.map((w) => w.address).join('\n')
    }

    return null
  }

  // Pure — independently testable
  formatMessage(deposit: Deposit): string {
    const base = EXPLORER_BASE[deposit.chainId] ?? 'https://etherscan.io'
    const toLink = `<a href="${base}/address/${deposit.to}">${deposit.to}</a>`
    const txLink = `<a href="${base}/tx/${deposit.txHash}">${deposit.txHash}</a>`
    const amount = deposit.contractAddress
      ? `${this.formatWithCommas(formatUnits(deposit.amount, deposit.tokenDecimals ?? 18))} ${deposit.tokenSymbol ?? 'tokens'}`
      : `${this.formatWithCommas(formatEther(deposit.amount))} ETH`

    return [
      `<b>New Deposit Detected</b>`,
      `Chain: ${deposit.chainId}`,
      `To: ${toLink}`,
      `Amount: ${amount}`,
      `Tx: ${txLink}`,
    ].join('\n')
  }

  private formatWithCommas(raw: string): string {
    const [intPart, fracPart] = raw.split('.')
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return fracPart ? `${formattedInt}.${fracPart}` : formattedInt
  }
}
