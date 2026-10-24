import { DNotifier } from "@dnotifier-realtime/dnotifier";
import { aiModel, OBSERVABILITY } from "./config.js";

// Log the raw AI response once so we can confirm its shape against the docs.
let loggedRaw = false;
const aiText = (r) => {
  if (!loggedRaw || process.env.DEBUG_AI) {
    console.log("Raw sendAI response:", JSON.stringify(r, null, 2));
    loggedRaw = true;
  }
  // AI failures come back as a normal response with data.type === "error"
  if (r?.data?.type === "error") throw new Error(`AI error: ${r.data.message}`);
  const c = r?.data?.content ?? r?.content ?? r?.data?.text ?? r?.payload?.content;
  return typeof c === "string" ? c : "";
};

const intentAgent = DNotifier.defineAgent({
  name: "intent-agent",
  async run(ctx) {
    const r = await ctx.sendAI({
      ...aiModel,
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
    const intent = aiText(r).toUpperCase().includes("HUMAN") ? "human" : "faq";
    ctx.state.intent = intent;
    return { intent };
  },
});

const faqAgent = DNotifier.defineAgent({
  name: "faq-agent",
  async run(ctx) {
    const r = await ctx.sendAI({
      ...aiModel,
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
    return { answer: (aiText(r) || "UNSURE").trim() };
  },
});

// The RAG step sometimes paraphrases "UNSURE" — treat these as "no answer" too.
const NO_ANSWER =
  /\bUNSURE\b|not (available|mentioned|found|covered|provided|specified)|no information|(don't|do not|doesn't|does not) (have|contain|know|mention)|(cannot|can't|unable to) (find|answer|help)|knowledge base|documentation|mujhe (nahi|nahin) pata|maloom nahi/i;

export const supportWorkflow = new DNotifier.Workflow({
  name: "support-router",
  description: "Classify intent, answer FAQ with RAG, or escalate to human",
  observability: OBSERVABILITY,
  async entry(ctx) {
    // Intent classification and the RAG answer run in parallel to keep latency low;
    // the intent decides which result we use.
    const {
      results: [{ intent }, { answer }],
    } = await ctx.runAgents([
      { name: "intent-agent" },
      { name: "faq-agent", input: { question: ctx.input } },
    ]);
    if (intent === "human")
      return { handoff: true, reason: "Customer asked for a human / upset" };

    if (!answer || NO_ANSWER.test(answer)) {
      return { handoff: true, reason: "AI could not find an answer" };
    }
    return { handoff: false, answer };
  },
}).registerAgents({ "intent-agent": intentAgent, "faq-agent": faqAgent });
