"use client";

import { useSyncExternalStore } from "react";

type ToastItem = { id: string; title: string; body: string; createdAt: number };

type State = {
  whatsappBadge: number;
  toasts: ToastItem[];
};

const state: State = {
  whatsappBadge: 0,
  toasts: [],
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function getSnapshot() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWhatsappNotifyStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function incWhatsappBadge() {
  state.whatsappBadge += 1;
  emit();
}

export function clearWhatsappBadge() {
  if (state.whatsappBadge === 0) return;
  state.whatsappBadge = 0;
  emit();
}

export function pushToast(input: { title: string; body: string }) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.toasts = [{ id, title: input.title, body: input.body, createdAt: Date.now() }, ...state.toasts].slice(0, 3);
  emit();
  window.setTimeout(() => {
    dismissToast(id);
  }, 4500);
}

export function dismissToast(id: string) {
  const next = state.toasts.filter((t) => t.id !== id);
  if (next.length === state.toasts.length) return;
  state.toasts = next;
  emit();
}

