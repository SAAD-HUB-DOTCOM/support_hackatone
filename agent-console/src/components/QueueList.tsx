import type { Conversation } from '../types'

const shortId = (id: string) => id.replace('customer-', '').slice(0, 8)
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const reasonClass = (reason: string) =>
  /could not|error/i.test(reason) ? 'badge-warn' : /human|upset/i.test(reason) ? 'badge-human' : 'badge-info'

type Props = {
  conversations: Conversation[]
  selectedId: string | null
  activeCount: number
  onSelect: (id: string) => void
}

export function QueueList({ conversations, selectedId, activeCount, onSelect }: Props) {
  return (
    <aside className="queue">
      <div className="queue-head">
        <h2>Queue</h2>
        <span className="count">{activeCount} active</span>
      </div>
      {conversations.length === 0 && <p className="queue-empty">No customers yet. Waiting for handoffs…</p>}
      <ul>
        {conversations.map((c) => {
          const last = c.messages.filter((m) => m.from !== 'system').at(-1)?.text ?? c.lastMessage ?? ''
          return (
            <li key={c.customerId}>
              <button
                className={`queue-item ${c.customerId === selectedId ? 'selected' : ''} ${c.status}`}
                onClick={() => onSelect(c.customerId)}
              >
                <div className="queue-row">
                  <span className="cust">👤 Customer {shortId(c.customerId)}</span>
                  {c.unread > 0 && <span className="unread">{c.unread}</span>}
                </div>
                <div className="queue-row">
                  <span className={`badge ${c.status === 'resolved' ? 'badge-done' : reasonClass(c.reason)}`}>
                    {c.status === 'resolved' ? '✓ Resolved' : c.reason}
                  </span>
                  <span className="muted small">{time(c.handoffAt)}</span>
                </div>
                {last && <div className="preview">{last}</div>}
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
