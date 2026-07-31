/* The ANM column body: a list of clip cards.
 *
 * Mirrors ParticleSystemList, including its empty state, so the two modes render
 * the same shape inside the same column chrome.
 */

import React, { useRef, useState } from 'react';
import ClipItem, { takeDraggedClip } from './ClipItem';
import { useAnmEditContext } from './AnmEditContext';
import { usePortDropZone } from '../../usePortDrag';
import type { AnmSystem } from '../anmModel';

interface ClipListProps {
    clips: AnmSystem[];
    /** Clips the user has opened. Tracking EXPANDED rather than collapsed makes
     *  "everything shut on load" the natural default - a bin holds 100+ clips,
     *  and opening them all buries the list. */
    expandedKeys: Set<string>;
    toggleCollapse: (key: string) => void;
    /** Shown instead of the list while the projection is in flight. */
    loading?: boolean;
    error?: string | null;
}

function ClipList({ clips, expandedKeys, toggleCollapse, loading, error }: ClipListProps) {
    const edit = useAnmEditContext();
    const listRef = useRef<HTMLDivElement>(null);
    const [isDropOver, setIsDropOver] = useState(false);

    /* The column itself accepts a whole CLIP dropped from the other side. A
       clip has no single card to land on the way an event lands on its clip, so
       the list is the target: dropping anywhere in the target column ports the
       donor clip plus the VFX systems its particle events reference. */
    usePortDropZone(
        'anm-clip-list',
        listRef,
        (payload) => !!edit?.portClipIn && payload.kind === 'system',
        (payload) => {
            if (payload.kind !== 'system') return;
            const carried = takeDraggedClip();
            if (!carried || !edit?.portClipIn) return;
            // A same-column drop is a no-op: a clip already in this graph has
            // nothing to port, and reordering is a separate gesture.
            if (carried.sessionId === edit.sessionId) return;
            void edit.portClipIn(`anm-port-${payload.systemKey}`, carried.path);
        },
        setIsDropOver,
    );

    /* Every state renders inside the same ref'd container, including the empty
       and loading ones. The drop zone needs a live element, and a graph with no
       clips yet is exactly when the user most wants to drag one in. */
    let body: React.ReactNode;
    if (error) {
        body = (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-danger)', fontSize: '0.85rem' }}>
                {error}
            </div>
        );
    } else if (loading) {
        body = (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Reading animation graph…
            </div>
        );
    } else if (clips.length === 0) {
        // Matches ParticleSystemList's wording and placement: reached when a bin
        // is loaded but has no clips (or the filter matched nothing). The no-bin
        // empty state lives in the column components.
        body = (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No matching clips
            </div>
        );
    } else {
        body = clips.map((clip) => (
            <ClipItem
                key={clip.key}
                system={clip}
                isCollapsed={!expandedKeys.has(clip.key)}
                toggleCollapse={toggleCollapse}
            />
        ));
    }

    return (
        <div ref={listRef} className={isDropOver ? 'port-drop-active' : undefined}>
            {body}
        </div>
    );
}

export default React.memo(ClipList);
