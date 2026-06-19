"use client";

import { useSyncExternalStore } from "react";

export type SystemNotificationKind = "task_assigned" | "team_chat_message";

export type SystemNotificationItem = {
  id: string;
  kind: SystemNotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt: number;
  read: boolean;
  taskId?: string;
  assigneeAgentId?: string | null;
  senderAgentId?: string | null;
  channel?: string | null;
  actorName?: string | null;
};

type State = {
  notifications: SystemNotificationItem[];
  toasts: SystemNotificationItem[];
};

const STORAGE_KEY = "ca:system-notifications:v1";
const MAX_NOTIFICATIONS = 30;
const MAX_TOASTS = 3;
const TOAST_DURATION_MS = 3000;

let hydrated = false;

let state: State = {
  notifications: [],
  toasts: [],
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notifications));
  } catch {
    // ignore
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    state.notifications = parsed
      .filter((item): item is SystemNotificationItem => Boolean(item && typeof item === "object"))
      .slice(0, MAX_NOTIFICATIONS)
      .map((item) => ({ ...item, read: Boolean(item.read) }));
  } catch {
    // ignore
  }
}

function getSnapshot() {
  hydrate();
  return state;
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: State) {
  state = next;
  persist();
  emit();
}

export function useSystemNotificationsStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function pushSystemNotification(input: Omit<SystemNotificationItem, "id" | "createdAt" | "read"> & { createdAt?: number }) {
  hydrate();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = input.createdAt ?? Date.now();
  const item: SystemNotificationItem = {
    ...input,
    id,
    createdAt,
    read: false,
  };
  setState({
    notifications: [item, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
    toasts: [item, ...state.toasts].slice(0, MAX_TOASTS),
  });

  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      dismissSystemToast(id);
    }, TOAST_DURATION_MS);
  }

  return item;
}

export function dismissSystemToast(id: string) {
  const nextToasts = state.toasts.filter((toast) => toast.id !== id);
  if (nextToasts.length === state.toasts.length) return;
  setState({
    notifications: state.notifications.slice(),
    toasts: nextToasts,
  });
}

export function markAllNotificationsRead() {
  const next = state.notifications.map((notification) => (notification.read ? notification : { ...notification, read: true }));
  setState({
    notifications: next,
    toasts: state.toasts.slice(),
  });
}

export function clearNotification(id: string) {
  const next = state.notifications.filter((notification) => notification.id !== id);
  if (next.length === state.notifications.length) return;
  setState({
    notifications: next,
    toasts: state.toasts.filter((toast) => toast.id !== id),
  });
}

export function clearAllNotifications() {
  setState({
    notifications: [],
    toasts: [],
  });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
