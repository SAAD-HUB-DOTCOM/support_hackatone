import type { HistoryItem } from './dnotifier'

export type ChatMessage = { id: string; from: 'customer' | 'agent' | 'system'; text: string; at: number }

export type Conversation = {
  customerId: string
  reason: string
  lastMessage?: string
  handoffAt: number
  history: HistoryItem[] // previous conversation with the AI
  messages: ChatMessage[] // live chat with the agent
  status: 'active' | 'resolved'
  unread: number
}
