import { CustomCursor } from './CustomCursor';

export function GlobalCursorEffect({ enabled, path = '', size = 32 }: { enabled: boolean; path?: string; size?: number }) {
    if (!enabled || !path) return null;
    return <CustomCursor path={path} size={size} />;
}

export default GlobalCursorEffect;
