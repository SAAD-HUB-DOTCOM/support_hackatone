import { useEffect, useRef, useState } from 'react'
import { BOT_ID } from '../dnotifier'
import type { Conversation } from '../types'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

type Props = {
  conversation: Conversation
  onReply: (text: string) => void
  onTyping: () => void
  onResolve: () => void
}

export function ChatPanel({ conversation: c, onReply, onTyping, onResolve }: Props) {
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const resolved = c.status === 'resolved'

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [c.messages.length])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || resolved) return
    onReply(text)
    setDraft('')
  }

  return (
    <section className="chat">
      <div className="chat-head">
        <div>
          <h2>{c.customerId}</h2>
          <p className="muted">
            Handoff reason: <strong>{c.reason}</strong> · {time(c.handoffAt)}
          </p>
        </div>
        <button className="resolve" onClick={onResolve} disabled={resolved}>
          {resolved ? '✓ Resolved' : '✓ Resolve & return to AI'}
        </button>
      </div>

      <div className="chat-body">
        <div className="ai-history">
          <div className="ai-history-title">🤖 Previous conversation with AI</div>
          {c.history.length === 0 && <p className="muted small">No previous messages.</p>}
          {c.history.map((h, i) => (
            <div key={i} className={`hrow ${h.from === BOT_ID ? 'from-bot' : 'from-cust'}`}>
              <span className="who">{h.from === BOT_ID ? 'AI' : 'Customer'}</span>
              <span className="htext">{h.text}</span>
              <span className="muted small">{time(h.at)}</span>
            </div>
          ))}
        </div>

        <div className="divider">
          <span>Live chat with agent</span>
        </div>

        {c.messages.length === 0 && !resolved && (
          <p className="muted center">Say hello — the customer is waiting for you.</p>
        )}
        {c.messages.map((m) =>
          m.from === 'system' ? (
            <p key={m.id} className="system">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`bubble-row ${m.from}`}>
              <div className={`bubble ${m.from}`}>
                {m.text}
                <span className="btime">{time(m.at)}</span>
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (e.target.value) onTyping()
          }}
          placeholder={resolved ? 'This chat is resolved' : 'Type a reply…'}
          disabled={resolved}
          autoFocus
        />
        <button type="submit" disabled={resolved || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  )
}
