import type {
  CoordinatedSession,
  SessionCoordination,
  SessionCoordinationEvent,
  SessionTokens,
} from './session-controller';

const CHANNEL_NAME = 'daevox.session';
const GENERATION_KEY = 'daevox.session.generation';
const LEASE_KEY = 'daevox.session.refresh-lease';
const MESSAGE_KEY = 'daevox.session.message';
const LEASE_MS = 10_000;

interface SessionMessage {
  sender: string;
  event: SessionCoordinationEvent;
}

interface MessageChannel {
  send(message: SessionMessage): void;
  close(): void;
  onmessage: ((event: MessageEvent<SessionMessage>) => void) | null;
}

interface LockAdapter {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface BrowserCoordinationOptions {
  storage?: Storage;
  locks?: LockAdapter;
  createChannel?: (name: string) => MessageChannel;
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  tabId?: string;
}

function parseGeneration(storage: Storage | undefined) {
  const value = Number(storage?.getItem(GENERATION_KEY) ?? '0');
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function createBrowserSessionCoordination(
  options: BrowserCoordinationOptions = {},
): SessionCoordination & { dispose(): void } {
  const storage = options.storage ?? (typeof window === 'undefined' ? undefined : localStorage);
  const locks =
    options.locks ??
    (typeof navigator === 'undefined' || !navigator.locks ? undefined : navigator.locks);
  const eventTarget = options.eventTarget ?? (typeof window === 'undefined' ? undefined : window);
  const now = options.now ?? Date.now;
  const delay =
    options.delay ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const tabId = options.tabId ?? globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36);
  const createChannel =
    options.createChannel ??
    (typeof BroadcastChannel === 'undefined'
      ? undefined
      : (name: string): MessageChannel => {
          const broadcastChannel = new BroadcastChannel(name);
          const send = broadcastChannel.postMessage.bind(broadcastChannel) as (
            message: SessionMessage,
          ) => void;
          return {
            send,
            close: () => broadcastChannel.close(),
            get onmessage() {
              return broadcastChannel.onmessage as
                | ((event: MessageEvent<SessionMessage>) => void)
                | null;
            },
            set onmessage(listener) {
              broadcastChannel.onmessage = listener as (event: MessageEvent) => void;
            },
          };
        });
  const channel = createChannel?.(CHANNEL_NAME);
  const listeners = new Set<(event: SessionCoordinationEvent) => void>();
  let latest: CoordinatedSession | null = null;
  let localGeneration = parseGeneration(storage);
  let localPending: Promise<CoordinatedSession> | null = null;

  const receive = (message: SessionMessage) => {
    if (message.sender === tabId || message.event.generation <= localGeneration) return;
    localGeneration = message.event.generation;
    if (message.event.type === 'tokens-updated') {
      latest = { tokens: message.event.tokens, generation: message.event.generation };
    } else {
      latest = null;
    }
    for (const listener of listeners) listener(message.event);
  };

  const send = (event: SessionCoordinationEvent) => {
    const message = { sender: tabId, event } satisfies SessionMessage;
    if (channel) {
      channel.send(message);
      return;
    }
    storage?.setItem(MESSAGE_KEY, JSON.stringify(message));
    storage?.removeItem(MESSAGE_KEY);
  };

  if (channel) channel.onmessage = (event) => receive(event.data);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== MESSAGE_KEY || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue) as SessionMessage);
    } catch {
      // Ignore malformed messages from unrelated same-origin code.
    }
  };
  eventTarget?.addEventListener('storage', onStorage as EventListener);

  const nextGeneration = () => {
    const next = Math.max(localGeneration, parseGeneration(storage)) + 1;
    localGeneration = next;
    storage?.setItem(GENERATION_KEY, String(next));
    return next;
  };

  const publish = (tokens: SessionTokens): CoordinatedSession => {
    const result = { tokens, generation: nextGeneration() };
    latest = result;
    send({ type: 'tokens-updated', ...result });
    return result;
  };

  const withLease = async <T>(callback: () => Promise<T>): Promise<T> => {
    while (true) {
      const timestamp = now();
      const current = storage?.getItem(LEASE_KEY);
      let lease: { owner: string; expiresAt: number } | null = null;
      try {
        lease = current ? (JSON.parse(current) as { owner: string; expiresAt: number }) : null;
      } catch {
        lease = null;
      }
      if (!lease || lease.expiresAt <= timestamp || lease.owner === tabId) {
        const candidate = JSON.stringify({ owner: tabId, expiresAt: timestamp + LEASE_MS });
        storage?.setItem(LEASE_KEY, candidate);
        await delay(25);
        if (storage?.getItem(LEASE_KEY) === candidate) {
          const heartbeat = setInterval(() => {
            storage?.setItem(
              LEASE_KEY,
              JSON.stringify({ owner: tabId, expiresAt: now() + LEASE_MS }),
            );
          }, LEASE_MS / 3);
          try {
            return await callback();
          } finally {
            clearInterval(heartbeat);
            const owned = storage?.getItem(LEASE_KEY);
            if (owned && (JSON.parse(owned) as { owner?: string }).owner === tabId) {
              storage?.removeItem(LEASE_KEY);
            }
          }
        }
      }
      await delay(50);
    }
  };

  const runExclusive = <T>(callback: () => Promise<T>) =>
    locks ? locks.request(`${CHANNEL_NAME}.refresh`, callback) : withLease(callback);

  return {
    publish,
    runRefresh(knownGeneration, refresh) {
      if (!localPending) {
        localPending = runExclusive(async () => {
          const sharedGeneration = parseGeneration(storage);
          if (sharedGeneration > knownGeneration && latest?.generation === sharedGeneration) {
            return latest;
          }
          const refreshGeneration = Math.max(localGeneration, sharedGeneration);
          const tokens = await refresh();
          if (
            localGeneration !== refreshGeneration ||
            parseGeneration(storage) !== refreshGeneration
          ) {
            throw new Error('Session changed during refresh');
          }
          return publish(tokens);
        }).finally(() => {
          localPending = null;
        });
      }
      return localPending;
    },
    end() {
      const generation = nextGeneration();
      latest = null;
      send({ type: 'session-ended', generation });
      return generation;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      channel?.close();
      eventTarget?.removeEventListener('storage', onStorage as EventListener);
      listeners.clear();
    },
  };
}
