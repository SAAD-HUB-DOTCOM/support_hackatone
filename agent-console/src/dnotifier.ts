import { DNotifier } from '@dnotifier-realtime/dnotifier'

export const AGENT_ID = 'agent-1'
export const BOT_ID = 'bot-support'

const appId = import.meta.env.VITE_DNOTIFIER_APP_ID
const secret = import.meta.env.VITE_DNOTIFIER_SECRET

// Messages arrive with metadata.sender = "<appId>:<userId>" — keep only the userId.
export const bareId = (id: unknown) => String(id ?? '').split(':').pop() ?? ''

export type HistoryItem = { from: string; text: string; at: number }
export type Inbound = {
  type: string
  text?: string
  customerId?: string
  reason?: string
  lastMessage?: string
  at?: number
  history?: unknown
}

type Handlers = {
  onConnected: () => void
  onDisconnected: () => void
  onMessage: (sender: string, body: Inbound) => void
}

function assertCreds() {
  if (!appId || !secret) throw new Error('Missing VITE_DNOTIFIER_APP_ID / SECRET in agent-console/.env')
}

// ⚠️ Demo only: the secret ships in the browser bundle. Production should get a
// short-lived token from a backend instead (see README → Production hardening).
export function createChatClient(h: Handlers) {
  assertCreds()
  return new DNotifier({
    appId,
    secret,
    transport: 'ws',
    userId: AGENT_ID,
    url: undefined, // SDK default endpoint
    WebSocketImpl: undefined, // browser WebSocket
    onConnected: h.onConnected,
    onDisconnected: h.onDisconnected,
    onMessage: (msg: any) => h.onMessage(bareId(msg?.metadata?.sender), msg?.payload?.toJSON?.() ?? {}),
  })
}

// HTTP client for request/response calls (chat history), per the transport matrix.
let http: DNotifier | null = null
async function httpClient() {
  if (!http) {
    assertCreds()
    const noop = () => {}
    http = new DNotifier({
      appId, secret, transport: 'http', userId: AGENT_ID,
      url: undefined, WebSocketImpl: undefined,
      onConnected: noop, onMessage: noop, onDisconnected: noop,
    })
    await http.connect()
  }
  return http
}

// Raw history rows also carry auth tokens — keep only { from, text, at }.
export function parseHistory(raw: unknown): HistoryItem[] {
  const rows: any[] = Array.isArray(raw) ? raw : ((raw as any)?.data?.history ?? [])
  return rows
    .map((row) => {
      if (row?.from && row?.text) return row as HistoryItem // already clean (from the bot)
      let body = row?.content
      try {
        if (typeof body === 'string') body = JSON.parse(body)
      } catch {
        return null
      }
      if (body?.type !== 'text' || !body.text) return null
      return { from: bareId(row.sender), text: body.text, at: row.metadata?.timestamp ?? Date.parse(row.created_at) }
    })
    .filter((x): x is HistoryItem => !!x)
    .sort((a, b) => a.at - b.at)
}

// Messages exchanged directly between this agent and a customer (e.g. sent while the console was closed).
export async function fetchAgentHistory(customerId: string): Promise<HistoryItem[]> {
  try {
    const c = await httpClient()
    return parseHistory(await c.fetchChatHistory({ senderId: AGENT_ID, receiverIds: [customerId] } as any))
  } catch (e) {
    console.warn('agent history failed', e)
    return []
  }
}

export type Client = ReturnType<typeof createChatClient>
