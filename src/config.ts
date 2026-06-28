import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ALCHEMY_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  WATCHED_CONTRACTS: z.string().default(''),
  CHAIN_IDS: z.string().default('1'),
})

function load() {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Missing required environment variables:', result.error.flatten().fieldErrors)
    process.exit(1)
  }

  const env = result.data
  return {
    databaseUrl: env.DATABASE_URL,
    alchemyApiKey: env.ALCHEMY_API_KEY,
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
    },
    contracts: env.WATCHED_CONTRACTS.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
    chainIds: env.CHAIN_IDS.split(',').map((id) => parseInt(id.trim(), 10)),
  }
}

export const config = load()
export type Config = typeof config
