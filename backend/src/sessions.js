// In-memory session store (use Redis/DB in production).
// customerId -> { mode: "bot" | "human", agentId?, reason?, lastMessage?, handoffAt?, history? }
const sessions = new Map();

export const getSession = (id) => {
  if (!sessions.has(id)) sessions.set(id, { mode: "bot" });
  return sessions.get(id);
};

// Customers currently waiting for / talking to a human.
export const activeHandoffs = () =>
  [...sessions.entries()].filter(([, s]) => s.mode === "human");
