# Karachi Kart Support — AI Customer Support with Live Human Handoff

> Built for the **DNotifier Hackathon**. One SDK powers realtime chat, the knowledge base (RAG),
> the multi-agent AI workflow, chat history and observability.

A customer chats with an **AI assistant** in a **React Native (Expo) mobile app**. The AI answers
from the store's FAQ in English, Urdu or Roman Urdu. When the customer asks for a person, sounds
upset, or the AI doesn't know the answer, the conversation is **handed off to a human agent** on
a **React web console**. The agent sees the full AI conversation and chats with the customer
**live**. When the agent clicks **Resolve**, the customer goes back to the AI.

"Karachi Kart" is a fictional local e-commerce store used for the demo.

---

## Contents

- [Features](#features)
- [DNotifier features used](#dnotifier-features-used)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the apps](#running-the-apps)
- [3-minute demo script](#3-minute-demo-script)
- [Configuration](#configuration)
- [Message protocol](#message-protocol)
- [Testing and dev scripts](#testing-and-dev-scripts)
- [Troubleshooting](#troubleshooting)
- [SDK notes (things we learned)](#sdk-notes-things-we-learned)
- [Security and production hardening](#security-and-production-hardening)
- [Deployment](#deployment)

---

## Features

**Customer mobile app (Expo, iOS + Android)**
- Chat with the AI assistant, with a typing indicator while it thinks
- Quick-reply chips: *Delivery time?*, *Return policy*, *Talk to a person*
- Status banner: 🤖 AI assistant → ⏳ Waiting for an agent → 👤 Talking to Agent
- Connection status dot and automatic reconnect with exponential backoff
- Chat and handoff state survive app reloads

**AI backend (Node.js)**
- Two-agent workflow: an **intent agent** (FAQ vs. HUMAN) and a **FAQ agent** (RAG answer), run in parallel
- Answers only from the knowledge base and replies in the customer's language
- Hands off automatically when the customer asks for a person, is angry, or the AI is unsure
- Sends the agent a cleaned-up chat history (sender, text, time only)

**Agent web console (React + Vite)**
- Queue of customers with handoff reason, unread count and active/resolved state
- A **"Previous conversation with AI"** panel plus the live chat
- Chime and browser notification on new handoffs
- Typing indicator sent to the customer while the agent types
- **Resolve & return to AI** button
- If the console was closed during a handoff, it catches up when it opens
- Large fonts so it is readable on a projector

---

## DNotifier features used

| Feature | SDK calls | Where |
| --- | --- | --- |
| Realtime WebSocket messaging | `send`, `onMessage` | All three apps |
| Chat history | `fetchChatHistory`, `saveHistory` | Handoff context for the agent |
| Knowledge base / RAG | `addDocument`, `updateDocument`, `search`, `useKnowledgeBase` | FAQ answers |
| Multi-agent workflow | `defineAgent`, `Workflow`, `runAgents`, `runWorkflow` | Intent + RAG pipeline |
| AI | `sendAI` (`open_ai` / `gpt-4o-mini` via the DNotifier subscription) | Both agents |
| Observability | `observability: true` | Workflows tab in the DNotifier dashboard |

---

## Architecture

```
┌──────────────────┐  send / onMessage (ws)   ┌──────────────┐   ws    ┌─────────────────────┐
│ Mobile app (RN)  │ ◄──────────────────────► │  DNotifier   │ ◄─────► │ Backend bot (Node)  │
│ customer-{uuid}  │                          │    cloud     │         │ id: bot-support     │
└──────────────────┘                          └──────▲───────┘  http   │ + HTTP client for   │
                                                     │ ws     ◄──────► │   AI / RAG / history│
                                              ┌──────┴───────┐         └─────────────────────┘
                                              │ Agent console│
                                              │ id: agent-1  │
                                              └──────────────┘
```

**User IDs:** customer = `customer-<uuid>` (generated once, saved on the phone), bot = `bot-support`, agent = `agent-1`.

### Conversation flow

1. The customer sends a `text` message to `bot-support`.
2. The backend replies with `typing`, then runs the **support-router** workflow:
   - `intent-agent` classifies the message as **FAQ** or **HUMAN**.
   - `faq-agent` drafts an answer from the knowledge base. Both agents run in parallel.
3. If it's an FAQ and the AI has an answer, the bot sends that answer back as `text`.
4. If it's HUMAN, or the AI can't answer:
   - the bot fetches the chat history and strips it to sender, text and time;
   - it sends `agent-joined` to the customer and `handoff` (with the history) to `agent-1`;
   - the session mode becomes `human`.
5. The customer app now sends to `agent-1`, and the agent replies directly to the customer.
6. The agent clicks **Resolve**:
   - the console sends `resolve` to the bot;
   - the bot sets the mode back to `bot` and sends `resolved` to the customer;
   - the customer app targets `bot-support` again.

---

## Project structure

```
support-hacktone/
├── README.md
├── claude.md                 # build plan / spec
├── .gitignore                # ignores every .env, keeps .env.example
├── backend/                  # Node.js bot (ESM)
│   ├── .env.example
│   └── src/
│       ├── config.js         # env, user ids, AI model, observability flag
│       ├── faqs.js           # 14 Karachi Kart FAQs
│       ├── seed.js           # uploads FAQs to the knowledge base (npm run seed)
│       ├── workflow.js       # intent-agent + faq-agent + support-router workflow
│       ├── sessions.js       # in-memory session store
│       ├── index.js          # bot listener, handoff/resolve, reconnect, /health
│       ├── hello.js          # realtime smoke test (npm run hello)
│       └── try-workflow.js   # run the workflow from the terminal (npm run try)
├── mobile/                   # Expo app (TypeScript)
│   ├── .env.example
│   ├── index.ts              # loads the crypto polyfill first
│   ├── App.tsx               # chat screen
│   └── src/
│       ├── dnotifier.ts      # SDK client factory (+ React Native WebSocket fix)
│       ├── useChat.ts        # connect, messages, target, status, send
│       ├── theme.ts
│       └── components/       # MessageBubble, TypingIndicator, StatusBanner
└── agent-console/            # Vite + React + TypeScript
    ├── .env.example
    └── src/
        ├── App.tsx           # state, handoff/text handling, reply, typing, resolve
        ├── dnotifier.ts      # ws chat client + http history client
        ├── notify.ts         # chime + browser notification
        ├── types.ts
        └── components/       # QueueList, ChatPanel
```

---

## Prerequisites

- **Node.js 18+** (developed on Node 24)
- A **DNotifier** account → https://app.dnotifier.com
- For the mobile app, one of:
  - **Expo Go** on a real phone (same Wi-Fi as your laptop), or
  - **Xcode** with an iOS Simulator, or **Android Studio** with an emulator

---

## Setup

### 1. Create the DNotifier app

1. Sign in at https://app.dnotifier.com and create an app.
2. Copy its **App ID** and **Secret**.
3. No external AI key is needed. The bot calls `open_ai` / `gpt-4o-mini`, which is included in the
   DNotifier subscription. To use another provider, connect it under **Projects → AI Studio →
   Providers** and set `AI_PROVIDER` / `AI_MODEL` (see [Configuration](#configuration)).

### 2. Install dependencies

```bash
cd backend       && npm install && cd ..
cd mobile        && npm install && cd ..
cd agent-console && npm install && cd ..
```

### 3. Create the `.env` files

```bash
cp backend/.env.example       backend/.env
cp mobile/.env.example        mobile/.env
cp agent-console/.env.example agent-console/.env
```

Put the **same App ID and Secret** in all three:

| File | Variables |
| --- | --- |
| `backend/.env` | `DNOTIFIER_APP_ID`, `DNOTIFIER_SECRET` |
| `mobile/.env` | `EXPO_PUBLIC_DNOTIFIER_APP_ID`, `EXPO_PUBLIC_DNOTIFIER_SECRET` |
| `agent-console/.env` | `VITE_DNOTIFIER_APP_ID`, `VITE_DNOTIFIER_SECRET` |

`.env` files are git-ignored. Never commit them.

### 4. Seed the knowledge base (once)

```bash
cd backend
npm run seed
```

Each FAQ prints `Indexed: …`, followed by a test search that returns delivery hits. Running it
again is safe: existing records are updated.

---

## Running the apps

Use three terminals:

```bash
# 1 — backend bot
cd backend && npm run dev
#   expect: "AI client ready (aiEnabled: true)" and "✅ Bot online as bot-support"
#   health check: http://localhost:3000/health

# 2 — agent console
cd agent-console && npm run dev
#   open http://localhost:5173 — the top-right badge turns "Online"

# 3 — mobile app
cd mobile && npx expo start
#   press i (iOS Simulator), a (Android emulator), or scan the QR code with Expo Go
```

Native builds also work: `npm run ios` / `npm run android` in `mobile/`.

---

## 3-minute demo script

Before you start: run all three apps, open the agent console on the laptop and the app on the
phone or simulator, and keep the DNotifier dashboard open in another tab.

1. **AI answers from the FAQ.** On the phone, ask:
   *"Delivery kitni der mein hoti hai Karachi mein?"*
   → typing dots, then a Roman Urdu answer: *1–2 working days*.
2. **Automatic escalation.** Ask something that isn't in the FAQ, e.g. *"Do you sell gift cards for Eid?"*
   → the AI escalates on its own ("AI could not find an answer") and the banner shows ⏳ *Waiting for an agent*.
   (Or tap **Talk to a person**.)
3. **Agent takes over.** On the laptop the console chimes and shows the customer, the handoff
   reason and the **full AI conversation**. Reply, and the message arrives on the phone instantly.
   The banner changes to 👤 *Talking to Agent*.
4. **Resolve.** Click **✓ Resolve & return to AI**. The phone says *"I'm the AI assistant again"*.
   Ask another FAQ to show the AI is back.
5. **Observability.** Open the DNotifier dashboard → **Workflows** → `support-router`. Show the
   execution, the `intent-agent` and `faq-agent` steps running in parallel, latency and tokens.
6. **Production hardening.** Explain what changes for production:
   - a backend token instead of the client secret;
   - multiple agents with a real queue;
   - Redis or a database instead of the in-memory session map.

   See [Security and production hardening](#security-and-production-hardening).

**Tip:** each AI reply takes about 10–14 seconds with observability on. The typing indicator covers
the wait. For a faster live demo, set `WORKFLOW_OBSERVABILITY=false` (about 5s), but then the runs
won't show in the dashboard.

---

## Configuration

`backend/.env`

| Variable | Default | Description |
| --- | --- | --- |
| `DNOTIFIER_APP_ID` | — | **Required.** App ID from the dashboard |
| `DNOTIFIER_SECRET` | — | **Required.** App secret |
| `PORT` | `3000` | Port for the `/health` endpoint |
| `AI_PROVIDER` | `open_ai` | `open_ai`, `anthropic`, `google_gemini`, `hugging_face`, `perplexity`, `azure_ai`, `aws_bedrock`, `ollama` (must be available on your plan) |
| `AI_MODEL` | `gpt-4o-mini` | Any model id that provider connection exposes |
| `WORKFLOW_OBSERVABILITY` | `true` | Send workflow telemetry to the dashboard (adds about 5s per message) |

To change the store's FAQs, edit `backend/src/faqs.js` and run `npm run seed` again.

---

## Message protocol

Every chat message is a JSON `data` object sent with `notifier.send`.

| `type` | From → To | Fields | Meaning |
| --- | --- | --- | --- |
| `text` | any → any | `text` | Normal chat message |
| `typing` | bot/agent → customer | — | Show typing indicator |
| `agent-joined` | bot → customer | `agentId`, `text` | Switch the customer's target to the agent |
| `handoff` | bot → agent | `customerId`, `reason`, `lastMessage`, `at`, `history[]` | New customer in the agent queue |
| `agent-online` | agent → bot | — | Console connected; bot resends open handoffs |
| `resolve` | agent → bot | `customerId` | Agent finished; return the customer to the bot |
| `resolved` | bot → customer | `text` | Switch the customer's target back to the bot |

Each `history` item has the shape `{ from: "customer-…" | "bot-support", text, at }`.

---

## Testing and dev scripts

From `backend/`:

| Command | What it does |
| --- | --- |
| `npm run hello` | A fake customer connects over WebSocket and sends "hello"; the bot terminal logs `📩 customer-hello-test …` |
| `npm run hello -- "Delivery charges kitne hain?"` | Same, with your own message; prints the bot's replies |
| `npm run try` | Runs the workflow on 4 sample questions (FAQ, Roman Urdu, unknown, human) without the chat layer |
| `npm run try -- "your question"` | Runs the workflow on your own question |
| `curl localhost:3000/health` | `{ ok, bot, connected }` |

### Acceptance checklist

- [x] An FAQ question gets a correct, short AI answer
- [x] A question not in the FAQ hands off automatically ("AI could not find an answer")
- [x] "I want to talk to a person" hands off
- [x] The agent console shows the customer, the reason and the previous AI messages
- [x] Agent ↔ customer messages arrive instantly both ways
- [x] Resolve returns the customer to the AI bot
- [x] A Roman Urdu question gets a Roman Urdu answer
- [x] No secrets committed (`.env` is git-ignored)
- [ ] Workflow steps visible in the DNotifier dashboard (check before the demo)

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Missing DNOTIFIER_APP_ID / DNOTIFIER_SECRET` | `backend/.env` is missing or empty, see [Setup](#setup) |
| Every message is handed off with "AI error" | Look for `AI error: …` in the backend log. `provider is required` means no model is set (the default `open_ai` should work); `not available for this subscription` means pick a provider your plan includes |
| **Android:** `UnknownHostException: Unable to resolve host "api.dnotifier.com"` | The emulator's DNS is broken; it isn't an app problem. Check with `adb shell ping -c1 google.com`. Fix: Android Studio → Device Manager → ⋮ → **Cold Boot Now**, or start it with `emulator -avd <AVD_NAME> -dns-server 8.8.8.8,1.1.1.1` |
| **iOS / RN:** `binaryType must be either 'blob' or 'arraybuffer'` | Fixed in `mobile/src/dnotifier.ts` (`RNWebSocket`). Make sure `WebSocketImpl: RNWebSocket` is still passed |
| `no secure random (crypto.getRandomValues…)` | `import 'react-native-get-random-values'` must be the first line of `mobile/index.ts` |
| Phone stuck on "⏳ Waiting for an agent" | The agent console isn't open, or the backend restarted (sessions are in memory). Open the console. If the backend restarted, send any message from the phone (it appears as "Customer message") and click **Resolve** |
| Console shows "Connecting…" forever | Check `agent-console/.env` and restart `npm run dev` (Vite reads `.env` only at startup) |
| Expo Go on a real phone can't load the app | Phone and laptop must be on the same Wi-Fi, or run `npx expo start --tunnel` |
| Replies are slow (10–14s) | Workflow observability adds about 5s; set `WORKFLOW_OBSERVABILITY=false` for speed |

---

## SDK notes (things we learned)

Tested against `@dnotifier-realtime/dnotifier@1.1.25`.

- **The sender ID includes the App ID.** `msg.metadata.sender` arrives as `"<appId>:<userId>"`.
  All three apps strip the prefix before routing.
- **`connect()` can resolve before the WebSocket is open.** Wait for `onConnected` before
  sending (see `backend/src/hello.js`).
- **Chat history rows include per-message auth tokens.** The backend never forwards raw history;
  it reduces it to `{ from, text, at }`.
- **React Native rejects the SDK's WebSocket setting.** The SDK sets
  `socket.binaryType = "arrayBuffer"` (wrong casing). Browsers ignore it, React Native throws.
  The mobile app passes a small `WebSocket` subclass that fixes the casing.
- **React Native needs two polyfills:** `react-native-get-random-values` (crypto) and `events`.
- **There's no `disconnect()` in 1.1.25**, despite the docs. The apps close
  `client.transport` instead.
- **The SDK doesn't auto-reconnect.** All three apps reconnect with exponential backoff (max 30s).
- **AI errors don't throw.** They come back as `{ data: { type: "error", message } }`. `workflow.js`
  turns them into exceptions so they show up as "AI error" handoffs.
- **The RAG model sometimes paraphrases "UNSURE"** (e.g. "Not available in documentation.").
  `workflow.js` treats those phrasings as "no answer" too.
- **Response shapes:**
  - `sendAI` (http) → `{ data: { content, model, usage } }`
  - `search` → `{ data: { rows: [{ content, similarity, metadata }] } }`
  - `fetchChatHistory` (http) → `{ data: { history: [{ sender, content: "<json string>", metadata: { timestamp } }] } }`

---

## Security and production hardening

> ⚠️ **Demo only:** the DNotifier **secret is bundled into the mobile app and the web console**.
> That's acceptable for a local hackathon demo but **not for production**. The DNotifier docs say
> never to ship the secret in client bundles.

For production we would:

1. **Use backend-issued tokens.** Clients log in to our backend, which hands out short-lived
   DNotifier tokens, so the secret only lives on the server.
2. **Authenticate agents.** Agents sign in; IDs like `agent-1` are no longer hard-coded.
3. **Support multiple agents with a real queue.** Assign handoffs, track agent availability, and
   transfer between agents.
4. **Persist sessions.** Store them in Redis or a database instead of the in-memory `Map`, so a
   backend restart doesn't drop active handoffs.
5. **Lock down the bot.** Validate message shapes, rate-limit customers, and only accept `resolve`
   from authenticated agents.
6. **Add logging and monitoring.** Turn on `logs: true` for AI session logging, plus alerts on
   disconnects and AI errors.

---

## Deployment

- **Backend**: deploy to Render or Railway as a **long-running service** (not serverless, because it
  holds a WebSocket).
  - Root directory: `backend`
  - Start command: `npm start`
  - Health check: `/health`
  - Set `DNOTIFIER_APP_ID` and `DNOTIFIER_SECRET` as environment variables.
- **Agent console**: deploy to Vercel or Netlify.
  - Root directory: `agent-console`
  - Build command: `npm run build`
  - Output directory: `dist`
  - Set the `VITE_DNOTIFIER_*` variables.
- **Mobile**: run through Expo Go for the demo (`npx expo start --tunnel` works across networks),
  or build with EAS.
