import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AGENT_ID,
  BOT_ID,
  createChatClient,
  fetchAgentHistory,
  parseHistory,
  type Client,
  type HistoryItem,
  type Inbound,
} from './dnotifier'
import type { ChatMessage, Conversation } from './types'
import { QueueList } from './components/QueueList'
import { ChatPanel } from './components/ChatPanel'
import { askNotificationPermission, chime, notify } from './notify'

const TYPING_THROTTLE_MS = 3000
const msgId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

// Same sender + text within 10s = same message (local echo vs. server history).
const isDup = (list: ChatMessage[], m: ChatMessage) =>
  list.some((x) => x.from === m.from && x.text === m.text && Math.abs(x.at - m.at) < 10_000)

const toChat = (h: HistoryItem): ChatMessage => ({
  id: msgId(),
  from: h.from === AGENT_ID ? 'agent' : 'customer',
  text: h.text,
  at: h.at,
})

export default function App() {
  const [conversations, setConversations] = useState<Record<string, Conversation>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const clientRef = useRef<Client | null>(null)
  const selectedRef = useRef<string | null>(null)
  const lastTypingSent = useRef<Record<string, number>>({})

  const select = useCallback((id: string | null) => {
    selectedRef.current = id
    setSelectedId(id)
    if (id) setConversations((c) => (c[id] ? { ...c, [id]: { ...c[id], unread: 0 } } : c))
  }, [])

  const appendMessages = useCallback((customerId: string, msgs: ChatMessage[]) => {
    setConversations((prev) => {
      const conv = prev[customerId]
      if (!conv) return prev
      const fresh = msgs.filter((m) => !isDup(conv.messages, m))
      if (!fresh.length) return prev
      const unseen = selectedRef.current === customerId ? 0 : fresh.filter((m) => m.from === 'customer').length
      return {
        ...prev,
        [customerId]: {
          ...conv,
          messages: [...conv.messages, ...fresh].sort((a, b) => a.at - b.at),
          unread: conv.unread + unseen,
        },
      }
    })
  }, [])

  const handleHandoff = useCallback(
    (body: Inbound) => {
      const customerId = body.customerId
      if (!customerId) return
      console.log('handoff payload', body)
      const handoffAt = body.at ?? Date.now()
      let isNew = false
      setConversations((prev) => {
        const ex = prev[customerId]
        isNew = !ex || ex.status === 'resolved'
        const base: Conversation = isNew
          ? { customerId, reason: '', handoffAt, history: [], messages: [], status: 'active', unread: 0 }
          : ex
        return {
          ...prev,
          [customerId]: {
            ...base,
            reason: body.reason ?? 'Handoff',
            lastMessage: body.lastMessage,
            handoffAt,
            history: parseHistory(body.history),
            status: 'active',
            unread: isNew ? (selectedRef.current === customerId ? 0 : 1) : base.unread,
          },
        }
      })
      if (isNew) {
        chime()
        notify('New customer waiting', body.reason ?? customerId)
        if (!selectedRef.current) select(customerId)
      }
      // Pick up anything the customer sent to the agent before this console saw the handoff.
      fetchAgentHistory(customerId).then((items) =>
        appendMessages(customerId, items.filter((h) => h.at >= handoffAt - 1000).map(toChat)),
      )
    },
    [appendMessages, select],
  )

  const handleCustomerText = useCallback(
    (customerId: string, text: string) => {
      const msg: ChatMessage = { id: msgId(), from: 'customer', text, at: Date.now() }
      setConversations((prev) => {
        if (prev[customerId]) return prev
        // Message from a customer we have no handoff for (e.g. backend restarted) — still show it.
        return {
          ...prev,
          [customerId]: {
            customerId, reason: 'Customer message', handoffAt: Date.now(),
            history: [], messages: [], status: 'active', unread: 0,
          },
        }
      })
      appendMessages(customerId, [msg])
    },
    [appendMessages],
  )

  useEffect(() => {
    askNotificationPermission()
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const client = createChatClient({
      onConnected: () => {
        attempt = 0
        setConnected(true)
        // Ask the bot to replay handoffs that happened while we were offline.
        client
          .send({ senderId: AGENT_ID, receiverId: BOT_ID, receiverIds: undefined, data: { type: 'agent-online' }, saveHistory: false })
          .catch((e: unknown) => console.warn('agent-online failed', e))
      },
      onDisconnected: () => {
        setConnected(false)
        scheduleReconnect()
      },
      onMessage: (sender, body) => {
        if (sender === BOT_ID && body.type === 'handoff') handleHandoff(body)
        else if (sender.startsWith('customer-') && body.type === 'text' && body.text) handleCustomerText(sender, body.text)
      },
    })
    clientRef.current = client

    // The SDK does not auto-reconnect — retry with exponential backoff (max 30s).
    const connect = async () => {
      if (cancelled) return
      try {
        await client.connect()
      } catch (e) {
        console.warn('connect failed', e)
        scheduleReconnect()
      }
    }
    function scheduleReconnect() {
      if (cancelled || retry) return
      const delay = Math.min(30_000, 1000 * 2 ** attempt++)
      retry = setTimeout(() => {
        retry = null
        connect()
      }, delay)
    }
    connect()

    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
      // SDK 1.1.25 has no disconnect() despite the docs — close the socket directly.
      ;(client.transport as { close?: () => void }).close?.()
      clientRef.current = null
    }
  }, [handleHandoff, handleCustomerText])

  const sendToCustomer = useCallback(async (customerId: string, data: object, saveHistory = true) => {
    const client = clientRef.current
    if (!client?.isConnected) throw new Error('Not connected')
    await client.send({ senderId: AGENT_ID, receiverId: customerId, receiverIds: undefined, data, saveHistory })
  }, [])

  const reply = useCallback(
    async (customerId: string, text: string) => {
      const msg: ChatMessage = { id: msgId(), from: 'agent', text, at: Date.now() }
      appendMessages(customerId, [msg])
      try {
        await sendToCustomer(customerId, { type: 'text', text })
      } catch (e) {
        appendMessages(customerId, [
          { id: msgId(), from: 'system', text: `Message not sent: ${(e as Error).message}`, at: Date.now() },
        ])
      }
    },
    [appendMessages, sendToCustomer],
  )

  const typing = useCallback(
    (customerId: string) => {
      const now = Date.now()
      if (now - (lastTypingSent.current[customerId] ?? 0) < TYPING_THROTTLE_MS) return
      lastTypingSent.current[customerId] = now
      sendToCustomer(customerId, { type: 'typing' }, false).catch(() => {})
    },
    [sendToCustomer],
  )

  const resolve = useCallback(
    async (customerId: string) => {
      const client = clientRef.current
      try {
        if (!client?.isConnected) throw new Error('Not connected')
        await client.send({
          senderId: AGENT_ID,
          receiverId: BOT_ID,
          receiverIds: undefined,
          data: { type: 'resolve', customerId },
          saveHistory: false,
        })
      } catch (e) {
        appendMessages(customerId, [
          { id: msgId(), from: 'system', text: `Could not resolve: ${(e as Error).message}`, at: Date.now() },
        ])
        return
      }
      setConversations((prev) => ({
        ...prev,
        [customerId]: {
          ...prev[customerId],
          status: 'resolved',
          messages: [
            ...prev[customerId].messages,
            { id: msgId(), from: 'system', text: 'Chat resolved — customer returned to the AI assistant.', at: Date.now() },
          ],
        },
      }))
    },
    [appendMessages],
  )

  const list = Object.values(conversations).sort(
    (a, b) => (a.status === b.status ? b.handoffAt - a.handoffAt : a.status === 'active' ? -1 : 1),
  )
  const selected = selectedId ? conversations[selectedId] : undefined
  const activeCount = list.filter((c) => c.status === 'active').length

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Karachi Kart <span className="muted">— Agent Console</span>
        </h1>
        <div className="topbar-right">
          <span className="agent">Signed in as {AGENT_ID}</span>
          <span className={`conn ${connected ? 'on' : 'off'}`}>
            <span className="dot" /> {connected ? 'Online' : 'Connecting…'}
          </span>
        </div>
      </header>
      <main className="layout">
        <QueueList conversations={list} selectedId={selectedId} activeCount={activeCount} onSelect={select} />
        {selected ? (
          <ChatPanel
            key={selected.customerId}
            conversation={selected}
            onReply={(t) => reply(selected.customerId, t)}
            onTyping={() => typing(selected.customerId)}
            onResolve={() => resolve(selected.customerId)}
          />
        ) : (
          <section className="empty-panel">
            <div className="empty-icon">🎧</div>
            <h2>No conversation selected</h2>
            <p>When the AI hands off a customer, they appear on the left with the full AI conversation.</p>
          </section>
        )}
      </main>
    </div>
  )
}
