/* Session persistence for BnkExtract.

   The Electron build wrote session JSON to %APPDATA%/Quartz/bnk_sessions via
   Node fs. Until a Rust-side session store command lands we back this with
   localStorage so the Session Manager UI is fully functional today. The public
   API matches the original (saveSession / loadAllSessions / loadSessionDetail /
   deleteSession). TODO(backend): move to an on-disk store under the shared
   RitoShark data dir once the command exists. */

import { log } from '@/lib/util/logger';
import type { BnkNode, SessionMeta, SessionState } from '../types';

const INDEX_KEY = 'bnk-sessions-index';
const SESSION_PREFIX = 'bnk-session:';

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

const readIndex = (): SessionMeta[] => {
    try {
        const raw = localStorage.getItem(INDEX_KEY);
        return raw ? (JSON.parse(raw) as SessionMeta[]) : [];
    } catch (e) {
        log.error('[SessionManager] failed to read index', e);
        return [];
    }
};

const writeIndex = (index: SessionMeta[]) => {
    try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (e) {
        log.error('[SessionManager] failed to write index', e);
    }
};

export function saveSession(state: SessionState, name: string): void {
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

    localStorage.setItem(SESSION_PREFIX + filename, JSON.stringify(payload));

    let index = readIndex().filter((s) => s.filename !== filename);
    index = [{ filename, name, created: Date.parse(created) }, ...index];
    writeIndex(index);
}

export function loadAllSessions(): SessionMeta[] {
    return readIndex().sort((a, b) => b.created - a.created);
}

export function loadSessionDetail(filename: string): SessionDetail | null {
    try {
        const raw = localStorage.getItem(SESSION_PREFIX + filename);
        if (!raw) return null;
        return JSON.parse(raw) as SessionDetail;
    } catch (e) {
        log.error('[SessionManager] failed to load session', e);
        return null;
    }
}

export function deleteSession(filename: string): boolean {
    localStorage.removeItem(SESSION_PREFIX + filename);
    writeIndex(readIndex().filter((s) => s.filename !== filename));
    return true;
}
