// Milestone 2 smoke test: a fake customer sends "hello" to the bot over WebSocket.
// Run the bot (npm run dev) in one terminal, then `npm run hello` in another.
// Optional: npm run hello -- "Delivery charges kitne hain?"
import WebSocket from "ws";
import { DNotifier } from "@dnotifier-realtime/dnotifier";
import { creds, BOT_ID } from "./config.js";

const ME = "customer-hello-test";
const TEXT = process.argv[2] || "hello";
let ready;
const connected = new Promise((r) => (ready = r));
const client = new DNotifier({
  ...creds,
  transport: "ws",
  userId: ME,
  WebSocketImpl: WebSocket,
  onConnected: () => {
    console.log("✅ Connected as", ME);
    ready();
  },
  onMessage: (msg) =>
    console.log("📩 from", msg.metadata.sender, JSON.stringify(msg.payload.toJSON())),
  onDisconnected: () => {},
});

await client.connect();
await connected; // connect() can resolve before the socket is open
console.log("aiEnabled:", client.aiEnabled, "| isConnected:", client.isConnected);
await client.send({ senderId: ME, receiverId: BOT_ID, data: { type: "text", text: TEXT } });
console.log(`➡️  Sent "${TEXT}" to`, BOT_ID, "— waiting 25s for replies...");
setTimeout(() => process.exit(0), 25000);
