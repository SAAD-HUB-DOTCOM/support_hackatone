import { DNotifier } from '@dnotifier-realtime/dnotifier';

export const BOT_ID = 'bot-support';

const appId = process.env.EXPO_PUBLIC_DNOTIFIER_APP_ID;
const secret = process.env.EXPO_PUBLIC_DNOTIFIER_SECRET;

// Messages arrive with metadata.sender = "<appId>:<userId>" — keep only the userId.
export const bareId = (id: unknown) => String(id ?? '').split(':').pop() ?? '';

export type ChatBody = {
  type: 'text' | 'typing' | 'agent-joined' | 'resolved' | string;
  text?: string;
  agentId?: string;
};

// The SDK sets `socket.binaryType = "arrayBuffer"` (wrong casing). Browsers ignore
// invalid values, but React Native throws — so normalize it in a tiny subclass.
class RNWebSocket extends WebSocket {
  get binaryType(): BinaryType {
    return super.binaryType;
  }
  set binaryType(v: BinaryType) {
    super.binaryType = String(v).toLowerCase() as BinaryType;
  }
}

type Handlers = {
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (sender: string, body: ChatBody) => void;
};

// ⚠️ Demo only: the secret ships in the app bundle. Production should get a
// short-lived token from a backend instead (see README → Production hardening).
export function createClient(userId: string, h: Handlers) {
  if (!appId || !secret) {
    throw new Error('Missing EXPO_PUBLIC_DNOTIFIER_APP_ID / SECRET in mobile/.env');
  }
  return new DNotifier({
    appId,
    secret,
    transport: 'ws',
    userId,
    url: undefined, // SDK default endpoint
    WebSocketImpl: RNWebSocket, // RN's global WebSocket, with the binaryType fix
    onConnected: h.onConnected,
    onDisconnected: h.onDisconnected,
    onMessage: (msg: any) => h.onMessage(bareId(msg?.metadata?.sender), msg?.payload?.toJSON?.() ?? {}),
  });
}

export type Client = ReturnType<typeof createClient>;
