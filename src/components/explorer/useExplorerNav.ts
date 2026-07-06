import { useCallback, useRef, useState } from 'react';
import { explorerListDir, explorerResolvePath, type FsEntry } from '@/lib/api/explorer';

const parentOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]+$/, '');
const basenameOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/^.*[\\/]/, '');

/** Directory navigation with back/forward/up history. Pure logic + fetch,
 *  no rendering. `extFilter` restricts which file extensions list. */
export function useExplorerNav(extFilter?: string[]) {
    const [currentPath, setCurrentPath] = useState('');
    const [entries, setEntries] = useState<FsEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const history = useRef<string[]>([]);
    const index = useRef(-1);
    const [tick, force] = useState(0);
    const filterRef = useRef(extFilter);
    filterRef.current = extFilter;

    const load = useCallback(async (path: string) => {
        setLoading(true);
        setError(null);
        try {
            const list = await explorerListDir(path, filterRef.current);
            setEntries(list);
            setCurrentPath(path);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    const navigateTo = useCallback((path: string) => {
        history.current = history.current.slice(0, index.current + 1);
        history.current.push(path);
        index.current = history.current.length - 1;
        force((n) => n + 1);
        void load(path);
    }, [load]);

    const back = useCallback(() => {
        if (index.current > 0) {
            index.current--;
            force((n) => n + 1);
            void load(history.current[index.current]);
        }
    }, [load]);

    const forward = useCallback(() => {
        if (index.current < history.current.length - 1) {
            index.current++;
            force((n) => n + 1);
            void load(history.current[index.current]);
        }
    }, [load]);

    const up = useCallback(() => {
        if (!currentPath) return;
        const parent = parentOf(currentPath);
        if (parent && parent !== currentPath) navigateTo(parent);
    }, [currentPath, navigateTo]);

    const refresh = useCallback(() => {
        if (currentPath) void load(currentPath);
    }, [currentPath, load]);

    /** Resolve typed address-bar input and navigate.
     *  - Directory  -> navigate in;            { ok: true, file: null }
     *  - File       -> navigate to its folder; { ok: true, file: <name> } (select it)
     *  - Nonexistent ->                         { ok: false, file: null } */
    const resolveAndGo = useCallback(async (input: string): Promise<{ ok: boolean; file: string | null }> => {
        const r = await explorerResolvePath(input);
        if (!r.exists) return { ok: false, file: null };
        if (r.isDir) {
            navigateTo(r.resolved);
            return { ok: true, file: null };
        }
        navigateTo(parentOf(r.resolved));
        return { ok: true, file: basenameOf(r.resolved) };
    }, [navigateTo]);

    // `tick` is referenced so canBack/canForward recompute on history changes.
    void tick;

    return {
        currentPath,
        entries,
        loading,
        error,
        canBack: index.current > 0,
        canForward: index.current < history.current.length - 1,
        navigateTo,
        back,
        forward,
        up,
        refresh,
        resolveAndGo,
    };
}
