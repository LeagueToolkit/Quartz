import { create } from 'zustand';

export interface Notification {
    id: number;
    kind: 'info' | 'success' | 'error';
    message: string;
}

interface NotificationState {
    items: Notification[];
    push: (kind: Notification['kind'], message: string) => void;
    dismiss: (id: number) => void;
}

let nextId = 1;

export const useNotificationStore = create<NotificationState>((set) => ({
    items: [],
    push: (kind, message) =>
        set((s) => ({ items: [...s.items, { id: nextId++, kind, message }] })),
    dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
}));
