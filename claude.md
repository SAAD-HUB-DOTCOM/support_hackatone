# CLAUDE.md — AI Customer Support with Live Human Handoff (DNotifier Hackathon)

You are building a complete hackathon project. Read this whole file before writing code.
Work milestone by milestone (see "Milestones"). After each milestone, run/test it and
tell the user exactly what to do to verify it before moving on.

---

## 0. Ground rules for Claude

1. **The DNotifier SDK is new. Do not guess its API.** Before writing DNotifier code, read
   the official docs. Full doc index: https://dnotifier.gitbook.io/product-docs/llms.txt
   Any doc page is available as Markdown by appending `.md` to its URL. Key pages:
   - JS install: https://dnotifier.gitbook.io/product-docs/getting-started/installation/javascript-typescript.md
   - Send & receive: https://dnotifier.gitbook.io/product-docs/realtime-communication/send-and-receive/javascript-typescript.md
   - Chat methods: https://dnotifier.gitbook.io/product-docs/reference/chat-methods/javascript-typescript.md
   - AI & RAG methods: https://dnotifier.gitbook.io/product-docs/reference/ai-methods/javascript-typescript.md
   - RAG example: https://dnotifier.gitbook.io/product-docs/examples/rag-assistant/javascript-typescript.md
   - Multi-agent workflow: https://dnotifier.gitbook.io/product-docs/examples/multi-agent-workflow/javascript-typescript.md
   - WorkflowContext: https://dnotifier.gitbook.io/product-docs/workflows-and-agents/workflow-context.md
   - Transport matrix: https://dnotifier.gitbook.io/product-docs/reference/transport-matrix.md
   - Combined use cases (this project's pattern): https://dnotifier.gitbook.io/product-docs/platform-overview/use-cases/combined.md
   - Security: https://dnotifier.gitbook.io/product-docs/operations/security.md
2. The code in this file is a **starting point written from the docs**. If the real SDK
   differs (method names, return shapes like `run.result`, `r.data.content`, history
   payload shape), follow the real SDK and update the code. Log raw responses with
   `console.log(JSON.stringify(x, null, 2))` the first time to learn their shape.
3. Never commit `.env` files. Create `.env.example` files instead and a root `.gitignore`.
4. Keep it simple and demo-ready. Working end-to-end flow > fancy features.
5. Use JavaScript/TypeScript everywhere. Node.js 18+.

---

## 1. What we are building

A customer support system for a local e-commerce store (name: **"Karachi Kart"**, fictional —
the user may rename it).

- A **customer** chats in a **React Native (Expo) mobile app**.
- An **AI bot** (Node.js backend) answers from the store's FAQ using DNotifier RAG.
- When the customer asks for a person, is angry, or the AI is unsure, the conversation is
  **handed off to a human agent** who uses a **React web console**.
- The agent sees the **previous AI conversation** and chats with the customer **in realtime**.
- The agent can **resolve** the chat, which returns the customer to the AI bot.
- Workflow **observability** is on, so every AI step is visible in the DNotifier dashboard.

### DNotifier features used (mention these in the demo)

| Feature                                                         | Where                     |
| --------------------------------------------------------------- | ------------------------- |
| Realtime WebSocket messaging (`send`, `onMessage`)              | All three apps            |
| Chat history (`fetchChatHistory`, `saveHistory`)                | Handoff context for agent |
| Knowledge base / RAG (`addDocument`, `useKnowledgeBase`)        | FAQ answers               |
| Multi-agent workflow (`defineAgent`, `Workflow`, `runWorkflow`) | Intent + RAG pipeline     |
| Observability (`observability: true`)                           | Dashboard during demo     |

---

## 2. Architecture

```
┌──────────────────┐   send/onMessage (ws)   ┌──────────────┐   ws    ┌───────────────────┐
│ Mobile app (RN)  │ ◄─────────────────────► │  DNotifier   │ ◄─────► │ Backend bot (Node)│
│ customer-{uuid}  │                         │   cloud      │         │ id: bot-support   │
└──────────────────┘                         └──────▲───────┘         │ + http client for │
                                                    │ ws              │   AI / workflows  │
                                             ┌──────┴───────┐         └───────────────────┘
                                             │ Agent console│
                                             │ id: agent-1  │
                                             └──────────────┘
```

### User IDs

- Customer: `customer-<uuid>` (generated once, saved in AsyncStorage)
- Bot: `bot-support`
- Agent: `agent-1` (single agent is enough for the hackathon)

### Message protocol (the `data` object sent with `notifier.send`)

| type           | From → To            | Fields                            | Meaning                                |
| -------------- | -------------------- | --------------------------------- | -------------------------------------- |
| `text`         | any → any            | `text`                            | Normal chat message                    |
| `typing`       | bot/agent → customer | —                                 | Show typing indicator                  |
| `agent-joined` | bot → customer       | `agentId`, `text`                 | Switch customer's target to agent      |
| `handoff`      | bot → agent          | `customerId`, `reason`, `history` | New customer in agent queue            |
| `resolve`      | agent → bot          | `customerId`                      | Agent finished; return customer to bot |
| `resolved`     | bot → customer       | `text`                            | Switch customer's target back to bot   |

### Flow

1. Customer sends `text` to `bot-support`.
2. Backend runs workflow: **intent-agent** (FAQ vs HUMAN) → **faq-agent** (RAG answer).
3. If FAQ answer is fine → bot sends `text` reply.
4. If HUMAN or the RAG answer is `UNSURE` → bot fetches chat history, sends `agent-joined`
   to customer and `handoff` (with history) to `agent-1`. Session mode = `human`.
5. Customer app now sends to `agent-1`. Agent replies to `customer-...` directly.
6. Agent clicks Resolve → sends `resolve` to bot → bot sets mode = `bot`, sends `resolved`
   to customer → customer app targets `bot-support` again.

---

## 3. Folder structure

```
support-hackathon/
├── CLAUDE.md
├── .gitignore
├── README.md                 # setup + run + demo instructions (Claude writes this)
├── backend/
│   ├── package.json          # "type": "module"
│   ├── .env.example
│   ├── src/
│   │   ├── config.js         # loads env, exports ids/creds
│   │   ├── faqs.js           # FAQ data for the knowledge base
│   │   ├── seed.js           # uploads FAQs (npm run seed)
│   │   ├── workflow.js       # agents + workflow
│   │   ├── sessions.js       # in-memory session store
│   │   └── index.js          # bot listener, handoff, express /health
├── mobile/                   # Expo app (TypeScript)
│   ├── .env.example
│   ├── App.tsx
│   └── src/
│       ├── dnotifier.ts      # client factory
│       ├── useChat.ts        # hook: connect, messages, target, send
│       └── components/
│           ├── MessageBubble.tsx
│           ├── TypingIndicator.tsx
│           └── StatusBanner.tsx
└── agent-console/            # Vite + React + TypeScript
    ├── .env.example
    └── src/
        ├── App.tsx
        ├── dnotifier.ts
        └── components/
            ├── QueueList.tsx
            └── ChatPanel.tsx
```

---

## 4. Environment variables

The user creates an app at https://app.dnotifier.com and gets an **App ID** and **Secret**.
The user will also configure an AI provider (e.g. OpenAI/Gemini) in the DNotifier dashboard
if required — check the docs page "Multi-model providers" and tell the user what to set.

`backend/.env.example`

```
DNOTIFIER_APP_ID=
DNOTIFIER_SECRET=
PORT=3000
```

`mobile/.env.example`

```
EXPO_PUBLIC_DNOTIFIER_APP_ID=
EXPO_PUBLIC_DNOTIFIER_SECRET=
```

`agent-console/.env.example`

```
VITE_DNOTIFIER_APP_ID=
VITE_DNOTIFIER_SECRET=
```

> ⚠️ Security note (put this in README too): putting the secret in the mobile app and web
> console is acceptable for a local hackathon demo ONLY. The DNotifier docs say never ship
> the secret in client bundles in production; production should use a backend proxy /
> post-login token pattern. Mention this to judges as "production hardening".

---

## 5. Backend (Node.js) — reference implementation

Dependencies: `@dnotifier-realtime/dnotifier`, `ws`, `dotenv`, `express`.
Scripts: `"start": "node src/index.js"`, `"seed": "node src/seed.js"`, `"dev": "node --watch src/index.js"`.

### `src/config.js`

```js
import "dotenv/config";
export const creds = {
  appId: process.env.DNOTIFIER_APP_ID,
  secret: process.env.DNOTIFIER_SECRET,
};
if (!creds.appId || !creds.secret) {
  console.error("Missing DNOTIFIER_APP_ID / DNOTIFIER_SECRET in backend/.env");
  process.exit(1);
}
export const BOT_ID = "bot-support";
export const AGENT_ID = "agent-1";
export const PORT = process.env.PORT || 3000;
```

### `src/faqs.js`

Write 12–15 realistic FAQs for "Karachi Kart": delivery times (Karachi vs other cities),
delivery charges, cash on delivery limits, JazzCash/Easypaisa/card payments, return
window, refund time, damaged item process, order tracking, order cancellation, store
hours, warranty on electronics, contact number/email, size exchange.
Shape: `{ recordId: "delivery-time", content: "...", metadata: { source: "help-center", topic: "delivery" } }`

### `src/seed.js`

```js
import { DNotifier } from "@dnotifier-realtime/dnotifier";
import { creds, BOT_ID } from "./config.js";
import { faqs } from "./faqs.js";

const noop = () => {};
const kb = new DNotifier({
  ...creds,
  transport: "http",
  userId: BOT_ID,
  onConnected: noop,
  onMessage: noop,
  onDisconnected: noop,
});
await kb.connect();

for (const f of faqs) {
  // addDocument may fail if recordId exists -> fall back to updateDocument
  try {
    await kb.addDocument({
      senderId: BOT_ID,
      recordId: f.recordId,
      content: f.content,
      type: "text",
      metadata: f.metadata,
    });
  } catch {
    await kb.updateDocument({
      senderId: BOT_ID,
      recordId: f.recordId,
      content: f.content,
      type: "text",
    });
  }
  console.log("Indexed:", f.recordId);
}
const hits = await kb.search({
  senderId: BOT_ID,
  query: "How long does delivery take?",
  limit: 3,
});
console.log("Test search:", JSON.stringify(hits, null, 2));
process.exit(0);
```

### `src/workflow.js`

```js
import { DNotifier } from "@dnotifier-realtime/dnotifier";

const intentAgent = DNotifier.defineAgent({
  name: "intent-agent",
  async run(ctx) {
    const r = await ctx.sendAI({
      message: {
        text:
          "Classify the customer message. Reply with ONE word only.\n" +
          "HUMAN = asks for a person/agent/representative, is angry or abusive, " +
          "or needs changes to a specific order/account.\n" +
          "FAQ = a general question about the store.\n" +
          `Customer: ${ctx.input}`,
      },
      saveHistory: false,
      label: "Intent classification",
    });
    const text = (r?.data?.content ?? "").toUpperCase();
    const intent = text.includes("HUMAN") ? "human" : "faq";
    ctx.state.intent = intent;
    return { intent };
  },
});

const faqAgent = DNotifier.defineAgent({
  name: "faq-agent",
  async run(ctx) {
    const r = await ctx.sendAI({
      message: {
        useKnowledgeBase: true,
        messages: [
          {
            role: "system",
            content:
              "You are Karachi Kart's friendly support assistant. Answer ONLY from the " +
              "knowledge base, in 1-3 short sentences. Reply in the same language the " +
              "customer used (English, Urdu or Roman Urdu). If the knowledge base does " +
              "not contain the answer, reply with exactly: UNSURE",
          },
          { role: "user", content: ctx.input.question },
        ],
      },
      saveHistory: false,
      label: "RAG answer",
    });
    return { answer: (r?.data?.content ?? "UNSURE").trim() };
  },
});

export const supportWorkflow = new DNotifier.Workflow({
  name: "support-router",
  description: "Classify intent, answer FAQ with RAG, or escalate to human",
  observability: true,
  async entry(ctx) {
    const { intent } = await ctx.runAgent("intent-agent");
    if (intent === "human")
      return { handoff: true, reason: "Customer asked for a human" };

    const { answer } = await ctx.runAgent("faq-agent", {
      input: { question: ctx.input },
    });
    if (!answer || answer.toUpperCase().includes("UNSURE")) {
      return { handoff: true, reason: "AI could not find an answer" };
    }
    return { handoff: false, answer };
  },
}).registerAgents({ "intent-agent": intentAgent, "faq-agent": faqAgent });
```

VERIFY in WorkflowContext docs that `ctx.sendAI` accepts `useKnowledgeBase` + `messages`.
If not, call the top-level `notifier.sendAI` for the RAG step instead.

### `src/sessions.js`

```js
const sessions = new Map(); // customerId -> { mode: "bot" | "human", agentId?: string }
export const getSession = (id) => {
  if (!sessions.has(id)) sessions.set(id, { mode: "bot" });
  return sessions.get(id);
};
```

### `src/index.js`

```js
import WebSocket from "ws";
import express from "express";
import { DNotifier } from "@dnotifier-realtime/dnotifier";
import { creds, BOT_ID, AGENT_ID, PORT } from "./config.js";
import { supportWorkflow } from "./workflow.js";
import { getSession } from "./sessions.js";

const noop = () => {};

// HTTP client: AI, workflows, history (request/response)
const ai = new DNotifier({
  ...creds,
  transport: "http",
  userId: BOT_ID,
  onConnected: noop,
  onMessage: noop,
  onDisconnected: noop,
});

// WS client: live chat
const chat = new DNotifier({
  ...creds,
  transport: "ws",
  userId: BOT_ID,
  WebSocketImpl: WebSocket,
  onConnected: () => console.log("✅ Bot online as", BOT_ID),
  onMessage: (msg) => {
    const sender = msg.metadata.sender;
    const body = msg.payload.toJSON();
    route(sender, body).catch((e) => console.error("route error:", e));
  },
  onDisconnected: () => console.log("⚠️ Bot disconnected"),
});

const send = (to, data, saveHistory = true) =>
  chat.send({ senderId: BOT_ID, receiverId: to, data, saveHistory });

async function route(sender, body) {
  if (!body?.type) return;
  if (sender === AGENT_ID && body.type === "resolve")
    return resolve(body.customerId);
  if (sender.startsWith("customer-") && body.type === "text")
    return handleCustomer(sender, body.text);
}

async function handleCustomer(customerId, text) {
  const s = getSession(customerId);
  if (s.mode === "human") return; // customer talks to agent directly now

  await send(customerId, { type: "typing" }, false);
  let result;
  try {
    const run = await ai.runWorkflow({
      workflow: supportWorkflow,
      input: text,
    });
    result = run.result;
  } catch (e) {
    console.error("workflow failed:", e);
    result = { handoff: true, reason: "AI error" };
  }

  if (!result.handoff)
    return send(customerId, { type: "text", text: result.answer });

  s.mode = "human";
  s.agentId = AGENT_ID;
  let history = [];
  try {
    history = await ai.fetchChatHistory({
      senderId: BOT_ID,
      receiverIds: [customerId],
    });
  } catch (e) {
    console.error("history failed:", e);
  }

  await send(customerId, {
    type: "agent-joined",
    agentId: AGENT_ID,
    text: "Connecting you to a human agent. Please wait a moment...",
  });
  await send(
    AGENT_ID,
    {
      type: "handoff",
      customerId,
      reason: result.reason,
      lastMessage: text,
      history,
    },
    false,
  );
}

async function resolve(customerId) {
  const s = getSession(customerId);
  s.mode = "bot";
  delete s.agentId;
  await send(customerId, {
    type: "resolved",
    text: "Your chat with our agent has ended. I'm the AI assistant again — ask me anything!",
  });
}

// Health endpoint (needed for Render/Railway)
const app = express();
app.get("/health", (_, res) => res.json({ ok: true, bot: BOT_ID }));
app.listen(PORT, () => console.log("Health server on", PORT));

await ai.connect();
await chat.connect();
```

Add reconnection: read https://dnotifier.gitbook.io/product-docs/realtime-communication/error-handling.md
and reconnect the `chat` client with backoff if it disconnects.

---

## 6. Mobile app (React Native, Expo, TypeScript)

Create with `npx create-expo-app mobile --template blank-typescript`.
Dependencies: `@dnotifier-realtime/dnotifier`, `@react-native-async-storage/async-storage`.

### Behaviour

- On first launch generate `customer-<uuid>` and save it in AsyncStorage.
- Connect with `transport: "ws"`, **no `WebSocketImpl`** (RN has global WebSocket, like browsers).
- State: `messages[]`, `target` (`"bot-support"` initially), `isTyping`, `status`
  (`"bot" | "waiting" | "human"`), `connected`.
- `onMessage` handling:
  - `text` → append bubble (sender label: "AI Assistant" for bot-support, "Agent" for agent-1); hide typing
  - `typing` → show typing indicator (auto-hide after 10s)
  - `agent-joined` → `setTarget(body.agentId)`, status `waiting`, show system message
  - first `text` from the agent → status `human`
  - `resolved` → `setTarget("bot-support")`, status `bot`, show system message
- Send: `notifier.send({ senderId: myId, receiverId: target, data: { type: "text", text } })`
  and append the bubble locally immediately.
- Disconnect on unmount.

### UI

- Header: "Karachi Kart Support" + green/grey connection dot.
- `StatusBanner`: "🤖 Talking to AI assistant" / "⏳ Waiting for an agent" / "👤 Talking to Agent".
- Chat bubbles: customer right (brand color), others left (light grey), system messages centered small italic.
- Quick-reply chips above the input: "Delivery time?", "Return policy", "Talk to a person".
- `KeyboardAvoidingView`, FlatList auto-scroll to bottom.
- Clean modern look; pick one brand color (e.g. #0E9F6E).

### If the SDK fails to load in React Native

1. Try polyfills first: `react-native-get-random-values`, `text-encoding`, `buffer`
   (import at the top of `App.tsx`). Check the error message to see what is missing.
2. If it still fails, FALLBACK: add a small WebSocket relay to the backend (`ws` server on
   the same Express port). The mobile app connects to the relay with plain WebSocket and
   the backend forwards messages to/from DNotifier as the customer's userId. Tell the user
   before switching to the fallback.

---

## 7. Agent console (React + Vite + TypeScript)

Create with `npm create vite@latest agent-console -- --template react-ts`.
Connect as `agent-1` with `transport: "ws"` (browser, no `WebSocketImpl`).

### Behaviour

- State: `conversations: Record<customerId, { reason, history, messages[], status: "active" | "resolved", unread }>`, `selectedId`.
- `onMessage`:
  - `handoff` (from bot-support) → add conversation, show reason + previous AI history;
    play a short notification sound / browser notification.
  - `text` from `customer-*` → append to that conversation; increment unread if not selected.
- Reply: `send({ senderId: "agent-1", receiverId: customerId, data: { type: "text", text } })`.
- Send `typing` to the customer while the agent types (throttle to once every 3s).
- Resolve button → `send({ senderId: "agent-1", receiverId: "bot-support", data: { type: "resolve", customerId } })`, mark resolved.
- Parse the `history` payload defensively — log it once and adapt to its real shape.

### UI

- Left sidebar (`QueueList`): customers with reason badge, unread count, active/resolved.
- Right (`ChatPanel`): grey "Previous conversation with AI" section, then live chat, input, Resolve button.
- Top bar: "Karachi Kart — Agent Console", connection status.
- Desktop layout, clean, readable on a projector (large font).

---

## 8. Milestones (do them in order, test each)

1. **Setup**: folders, `.gitignore`, `.env.example` files, install deps. User fills `.env`.
2. **Hello realtime**: backend connects as bot; a tiny script or the mobile app sends "hello";
   bot logs it. Confirms credentials + WebSocket work.
3. **Knowledge base**: write FAQs, run `npm run seed`, confirm the test search returns hits.
4. **AI replies**: workflow runs; customer gets RAG answers in the mobile app.
5. **Mobile UI**: full chat UI with typing, banners, quick replies.
6. **Agent console + handoff**: "Talk to a person" moves the chat to the console with history.
7. **Resolve flow**: agent resolves, customer returns to the bot.
8. **Polish + deploy**: reconnection, error states, README, deploy backend to Render/Railway
   (long-running service, NOT serverless), agent console to Vercel/Netlify, mobile via Expo Go.

---

## 9. Acceptance checklist

- [ ] FAQ question gets a correct, short AI answer within a few seconds
- [ ] Question not in FAQ → automatic handoff ("AI could not find an answer")
- [ ] "I want to talk to a person" → handoff
- [ ] Agent console shows the customer, reason, and previous AI messages
- [ ] Agent ↔ customer messages arrive instantly both ways
- [ ] Resolve returns the customer to the AI bot
- [ ] Workflow steps visible in the DNotifier dashboard (observability)
- [ ] Roman Urdu question gets a Roman Urdu answer
- [ ] No secrets committed to git

---

## 10. README + demo script (Claude writes into README.md)

Include setup steps, how to run all three apps, and this 3-minute demo:

1. Phone: ask "Delivery kitni der mein hoti hai Karachi mein?" → AI answers from FAQ.
2. Ask something not in the FAQ → AI escalates automatically.
3. Laptop: agent console shows the customer + full AI history → agent replies live.
4. Agent clicks Resolve → customer is back with the AI.
5. Open the DNotifier dashboard → show the workflow steps, latency, tokens.
6. Explain production hardening: backend token instead of client secret, multiple agents
   with a queue, persistent session store (Redis/DB) instead of in-memory Map.
