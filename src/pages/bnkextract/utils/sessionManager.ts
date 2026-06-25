/* Session persistence for BnkExtract.

   Backed by an on-disk store under %APPDATA%/Quartz/bnk_sessions (one JSON file
   per session), matching the Electron build's bnk_sessions folder. The public
   API mirrors the original (saveSession / loadAllSessions / loadSessionDetail /
   deleteSession). */

import { invoke } from '@tauri-apps/api/core';
import { log } from '@/lib/util/logger';
import type { BnkNode, SessionMeta, SessionState } from '../types';

interface StoredSession {
    name: string;
    created: string;
    treeData: BnkNode[];
    rightTreeData: BnkNode[];
    paths: { bnk: string; wpk: string; bin: string };
    viewMode: string;
    activePane: string;
    isDelta: boolean;
}

export interface SessionDetail extends StoredSession {
    isDelta: boolean;
}

export async function saveSession(state: SessionState, name: string): Promise<void> {
    const isAutoSave = name === 'AutoSave_Exit';
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = isAutoSave ? 'autosave_exit' : `${sanitizedName}_${Date.now()}`;
    const created = new Date().toISOString();

    const payload: StoredSession = {
        name,
        created,
        treeData: state.treeData,
        rightTreeData: state.rightTreeData,
        paths: { bnk: state.bnkPath, wpk: state.wpkPath, bin: state.binPath },
        viewMode: state.viewMode,
        activePane: state.activePane,
        isDelta: true,
    };

    try {
        await invoke('bnk_session_save', { filename, payload: JSON.stringify(payload) });
    } catch (e) {
        log.error('[SessionManager] failed to save session', e);
    }
}

export async function loadAllSessions(): Promise<SessionMeta[]> {
    try {
        const entries = await invoke<[string, string][]>('bnk_session_list');
        const metas: SessionMeta[] = [];
        for (const [filename, content] of entries) {
            try {
                const stored = JSON.parse(content) as StoredSession;
                metas.push({ filename, name: stored.name, created: Date.parse(stored.created) });
            } catch (e) {
                log.error('[SessionManager] bad session payload', filename, e);
            }
        }
        return metas.sort((a, b) => b.created - a.created);
    } catch (e) {
        log.error('[SessionManager] failed to list sessions', e);
        return [];
    }
}

export async function loadSessionDetail(filename: string): Promise<SessionDetail | null> {
    try {
        const raw = await invoke<string | null>('bnk_session_load', { filename });
        return raw ? (JSON.parse(raw) as SessionDetail) : null;
    } catch (e) {
        log.error('[SessionManager] failed to load session', e);
        return null;
    }
}

export async function deleteSession(filename: string): Promise<boolean> {
    try {
        await invoke('bnk_session_delete', { filename });
        return true;
    } catch (e) {
        log.error('[SessionManager] failed to delete session', e);
        return false;
    }
}
