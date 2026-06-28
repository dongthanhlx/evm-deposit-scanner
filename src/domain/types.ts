export type Chain = {
  chainId: number
  name: string
  rpcWsUrl: string
}

export type Block = {
  chainId: number
  number: bigint
  timestamp: number
  transactions: Transaction[]
}

export type Transaction = {
  hash: string
  from: string
  to: string | null
  value: bigint
  blockNumber: bigint
  blockTimestamp: number
  chainId: number
}

export type Log = {
  txHash: string
  logIndex: number
  blockNumber: bigint
  blockTimestamp: number
  contractAddress: string
  topics: string[]
  data: string
  chainId: number
  tokenDecimals: number | null
  tokenSymbol: string | null
}

export type Deposit = {
  txHash: string
  logIndex: number      // -1 for native ETH, >= 0 for ERC-20 Transfer events
  chainId: number
  blockNumber: bigint
  blockTimestamp: number
  from: string
  to: string            // the watched Wallet address
  contractAddress: string | null    // null for native ETH
  amount: bigint        // wei for ETH, raw token units for ERC-20
  tokenSymbol: string | null
  tokenDecimals: number | null      // null for native ETH
}

export type Checkpoint = {
  chainId: number
  lastProcessedBlock: bigint
  updatedAt: Date
}

// Entity — address is the identity key, stored lowercase
export type Wallet = {
  address: string
  addedAt: Date
}
