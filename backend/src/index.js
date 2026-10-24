import WebSocket from "ws";
import express from "express";
import { DNotifier } from "@dnotifier-realtime/dnotifier";
import { creds, BOT_ID, AGENT_ID, PORT } from "./config.js";
import { supportWorkflow } from "./workflow.js";
import { getSession, activeHandoffs } from "./sessions.js";

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
  onConnected: () => {
    console.log("✅ Bot online as", BOT_ID);
    reconnectAttempt = 0;
  },
  onMessage: (msg) => {
    // metadata.sender arrives as "<appId>:<userId>" — keep only the userId
    const sender = String(msg?.metadata?.sender ?? "").split(":").pop();
    const body = msg?.payload?.toJSON?.();
    console.log("📩", sender, JSON.stringify(body));
    route(sender, body).catch((e) => console.error("route error:", e));
  },
  onDisconnected: (info) => {
    console.log("⚠️ Bot disconnected", info ?? "");
    scheduleReconnect();
  },
});

// The SDK does not auto-reconnect — retry with exponential backoff (max 30s).
let reconnectTimer = null;
let reconnectAttempt = 0;
let shuttingDown = false;
function scheduleReconnect() {
  if (reconnectTimer || shuttingDown) return;
  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt++);
  console.log(`↻ Reconnecting in ${delay / 1000}s…`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await chat.connect();
    } catch (e) {
      console.error("Reconnect failed:", e.message);
      scheduleReconnect();
    }
  }, delay);
}

const send = async (to, data, saveHistory = true) => {
  if (!chat.isConnected) {
    console.error("send skipped (offline):", to, data.type);
    return;
  }
  return chat.send({ senderId: BOT_ID, receiverId: to, data, saveHistory });
};

async function route(sender, body) {
  if (!sender || !body?.type) return;
  if (sender === AGENT_ID && body.type === "resolve")
    return resolve(body.customerId);
  if (sender === AGENT_ID && body.type === "agent-online") return resendHandoffs();
  if (sender.startsWith("customer-") && body.type === "text")
    return handleCustomer(sender, body.text);
}

async function handleCustomer(customerId, text) {
  const s = getSession(customerId);
  if (s.mode === "human") return; // customer talks to agent directly now

  await send(customerId, { type: "typing" }, false);
  let result;
  const t0 = Date.now();
  try {
    const run = await ai.runWorkflow({ workflow: supportWorkflow, input: text });
    result = run?.result;
    console.log(`🧠 workflow ${Date.now() - t0}ms →`, JSON.stringify(result));
  } catch (e) {
    console.error("workflow failed:", e);
  }
  if (!result) result = { handoff: true, reason: "AI error" };

  if (!result.handoff)
    return send(customerId, { type: "text", text: result.answer });

  let history = [];
  try {
    const raw = await ai.fetchChatHistory({
      senderId: BOT_ID,
      receiverIds: [customerId],
    });
    history = cleanHistory(raw);
  } catch (e) {
    console.error("history failed:", e);
  }

  Object.assign(s, {
    mode: "human",
    agentId: AGENT_ID,
    reason: result.reason,
    lastMessage: text,
    handoffAt: Date.now(),
    history,
  });
  await send(customerId, {
    type: "agent-joined",
    agentId: AGENT_ID,
    text: "Connecting you to a human agent. Please wait a moment...",
  });
  await sendHandoff(customerId, s);
  console.log("🙋 handoff", customerId, "→", AGENT_ID, `(${result.reason})`);
}

const sendHandoff = (customerId, s) =>
  send(
    AGENT_ID,
    {
      type: "handoff",
      customerId,
      reason: s.reason,
      lastMessage: s.lastMessage,
      at: s.handoffAt,
      history: s.history,
    },
    false,
  );

// The agent console just connected — replay handoffs it may have missed while offline.
async function resendHandoffs() {
  const open = activeHandoffs();
  for (const [customerId, s] of open) await sendHandoff(customerId, s);
  console.log(`👋 agent online — resent ${open.length} open handoff(s)`);
}

// Raw history rows carry per-message auth tokens — never forward them. Keep only
// the text messages as { from, text, at }, oldest first, last 30.
function cleanHistory(raw) {
  const rows = raw?.data?.history;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      let body;
      try {
        body = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
      } catch {
        return null;
      }
      if (body?.type !== "text" || !body.text) return null;
      return {
        from: String(row.sender ?? "").split(":").pop(),
        text: body.text,
        at: row.metadata?.timestamp ?? Date.parse(row.created_at),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
    .slice(-30);
}

async function resolve(customerId) {
  if (!customerId) return;
  const s = getSession(customerId);
  s.mode = "bot";
  for (const k of ["agentId", "reason", "lastMessage", "handoffAt", "history"]) delete s[k];
  await send(customerId, {
    type: "resolved",
    text: "Your chat with our agent has ended. I'm the AI assistant again — ask me anything!",
  });
  console.log("✔️ resolved", customerId);
}

// Health endpoint (needed for Render/Railway)
const app = express();
app.get("/health", (_, res) =>
  res.json({ ok: true, bot: BOT_ID, connected: chat.isConnected }),
);
app.listen(PORT, () => console.log("Health server on", PORT));

process.on("SIGINT", () => {
  shuttingDown = true;
  process.exit(0);
});

await ai.connect();
console.log("AI client ready (aiEnabled:", ai.aiEnabled + ")");
try {
  await chat.connect();
} catch (e) {
  console.error("Initial connect failed:", e.message);
  scheduleReconnect();
}
