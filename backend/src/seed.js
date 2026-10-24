// Uploads the FAQs into the DNotifier knowledge base: `npm run seed`
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
console.log("aiEnabled:", kb.aiEnabled);

let first = true;
for (const f of faqs) {
  const doc = {
    senderId: BOT_ID,
    recordId: f.recordId,
    content: f.content,
    type: "text",
    metadata: f.metadata,
  };
  let res;
  try {
    res = await kb.addDocument(doc);
  } catch (e) {
    // addDocument fails if the recordId already exists -> update instead
    console.log(`  add failed (${e.message}), updating…`);
    res = await kb.updateDocument(doc);
  }
  if (first) {
    console.log("Raw addDocument response:", JSON.stringify(res, null, 2));
    first = false;
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
