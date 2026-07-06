import './skeleton.css';

/* Global shimmer skeleton primitive. Reads the app theme (accent/bg tokens) so
   it matches everywhere. Use <Skeleton /> for a single block, or the row/list
   helpers for common shapes. Pair with a delay (see useDelayedFlag) so quick
   loads never flash a placeholder. */

export function Skeleton({ width, height, radius = 6, className = '', style, delayClass }: {
    width?: number | string;
    height?: number | string;
    radius?: number;
    className?: string;
    style?: React.CSSProperties;
    /** 1|2|3 staggers the shimmer sweep so a grid doesn't pulse as one block. */
    delayClass?: 1 | 2 | 3;
}) {
    return (
        <span
            className={`q-skel ${delayClass ? `q-skel--d${delayClass}` : ''} ${className}`}
            style={{ width, height, borderRadius: radius, ...style }}
        />
    );
}

/** A list-row skeleton: small leading square + a text line. */
export function SkeletonRow({ index = 0 }: { index?: number }) {
    const d = ((index % 3) + 1) as 1 | 2 | 3;
    return (
        <div className="q-skel-row">
            <Skeleton width={28} height={28} radius={6} delayClass={d} />
            <Skeleton height={11} delayClass={d} style={{ flex: 1, maxWidth: `${70 - (index % 4) * 8}%` }} />
        </div>
    );
}

/** A vertical stack of `count` row skeletons. */
export function SkeletonList({ count = 6 }: { count?: number }) {
    return (
        <div className="q-skel-list">
            {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} index={i} />)}
        </div>
    );
}

/** Delay a boolean: true only after `active` stays true for `delay` ms. Lets
 *  quick operations pass with no skeleton flash. */
import { useEffect, useState } from 'react';
export function useDelayedFlag(active: boolean, delay = 180): boolean {
    const [flag, setFlag] = useState(false);
    useEffect(() => {
        if (!active) { setFlag(false); return; }
        const t = setTimeout(() => setFlag(true), delay);
        return () => clearTimeout(t);
    }, [active, delay]);
    return flag;
}
