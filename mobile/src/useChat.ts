import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BOT_ID, ChatBody, Client, createClient } from './dnotifier';

export type Status = 'bot' | 'waiting' | 'human';
export type Message = {
  id: string;
  from: 'me' | 'bot' | 'agent' | 'system';
  text: string;
  at: number;
};

const ID_KEY = 'karachikart.customerId';
const ROUTE_KEY = 'karachikart.route'; // { target, status } survives app reloads mid-handoff
const MSGS_KEY = 'karachikart.messages'; // chat survives app reloads
const MAX_SAVED = 100;
const TYPING_TIMEOUT_MS = 10_000;

const uuid = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const msgId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

async function loadCustomerId() {
  let id = await AsyncStorage.getItem(ID_KEY);
  if (!id) {
    id = `customer-${uuid()}`;
    await AsyncStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function useChat() {
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [target, setTargetState] = useState(BOT_ID);
  const [status, setStatusState] = useState<Status>('bot');
  const [isTyping, setIsTyping] = useState(false);
  const [connected, setConnected] = useState(false);

  // Refs mirror state so the SDK's onMessage callback always sees current values.
  const targetRef = useRef(BOT_ID);
  const statusRef = useRef<Status>('bot');
  const clientRef = useRef<Client | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const add = useCallback((from: Message['from'], text: string) => {
    setMessages((m) => [...m, { id: msgId(), from, text, at: Date.now() }]);
  }, []);

  const setRoute = useCallback((t: string, s: Status) => {
    targetRef.current = t;
    statusRef.current = s;
    setTargetState(t);
    setStatusState(s);
    AsyncStorage.setItem(ROUTE_KEY, JSON.stringify({ target: t, status: s })).catch(() => {});
  }, []);

  const hideTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setIsTyping(false);
  }, []);

  const onMessage = useCallback(
    (sender: string, body: ChatBody) => {
      switch (body?.type) {
        case 'text':
          if (!body.text) return;
          hideTyping();
          if (sender === BOT_ID) add('bot', body.text);
          else {
            add('agent', body.text);
            if (statusRef.current === 'waiting') setRoute(sender, 'human');
          }
          break;
        case 'typing':
          setIsTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setIsTyping(false), TYPING_TIMEOUT_MS);
          break;
        case 'agent-joined':
          hideTyping();
          setRoute(body.agentId || 'agent-1', 'waiting');
          add('system', body.text || 'Connecting you to a human agent…');
          break;
        case 'resolved':
          hideTyping();
          setRoute(BOT_ID, 'bot');
          add('system', body.text || 'You are back with the AI assistant.');
          break;
      }
    },
    [add, hideTyping, setRoute],
  );

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let client: Client | null = null;

    // The SDK does not auto-reconnect — retry with exponential backoff (max 30s).
    const connect = async () => {
      if (cancelled || !client) return;
      try {
        await client.connect();
      } catch (e) {
        console.warn('connect failed', e);
        scheduleReconnect();
      }
    };
    const scheduleReconnect = () => {
      if (cancelled || retry) return;
      const delay = Math.min(30_000, 1000 * 2 ** attempt++);
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    };

    (async () => {
      const id = await loadCustomerId();
      const savedMsgs = await AsyncStorage.getItem(MSGS_KEY);
      if (savedMsgs) {
        try {
          const list = JSON.parse(savedMsgs);
          if (Array.isArray(list)) setMessages((m) => [...list, ...m]);
        } catch {}
      }
      const saved = await AsyncStorage.getItem(ROUTE_KEY);
      if (saved) {
        try {
          const r = JSON.parse(saved);
          if (r?.target && r?.status) setRoute(r.target, r.status);
        } catch {}
      }
      if (cancelled) return;
      setMyId(id);
      client = createClient(id, {
        onConnected: () => {
          attempt = 0;
          setConnected(true);
        },
        onDisconnected: () => {
          setConnected(false);
          scheduleReconnect();
        },
        onMessage,
      });
      clientRef.current = client;
      connect();
    })();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      // SDK 1.1.25 has no disconnect() despite the docs — close the socket directly.
      try {
        (client?.transport as { close?: () => void } | undefined)?.close?.();
      } catch {}
      clientRef.current = null;
    };
  }, [onMessage, setRoute]);

  useEffect(() => {
    if (!messages.length) return;
    AsyncStorage.setItem(MSGS_KEY, JSON.stringify(messages.slice(-MAX_SAVED))).catch(() => {});
  }, [messages]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const client = clientRef.current;
      if (!text || !myId) return;
      add('me', text);
      if (!client?.isConnected) {
        add('system', "You're offline — message not sent. Reconnecting…");
        return;
      }
      try {
        await client.send({
          senderId: myId,
          receiverId: targetRef.current,
          receiverIds: undefined,
          data: { type: 'text', text },
        });
      } catch (e: any) {
        add('system', `Message failed to send (${e?.message ?? 'error'}).`);
      }
    },
    [add, myId],
  );

  return { myId, messages, target, status, isTyping, connected, send };
}
