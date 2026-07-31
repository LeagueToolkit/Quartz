/* The clip's own editable fields, in the order the bin writes them.
 *
 * Split out of ClipItem purely for size: the card was heading past 450 lines
 * and the field block is the part with no coupling to the card's chrome, its
 * drag wiring or its event list. It takes primitives rather than the AnmSystem
 * so React.memo can actually skip it - a card re-rendering because a sibling
 * event opened must not re-render eight field rows.
 */

import React from 'react';
import AnmFieldRow from './AnmFieldRow';
import type { AnmValue, ClipField } from '@/lib/api/vfxAnm';

interface ClipFieldsProps {
    name: string;
    trackDataName: string | null;
    maskDataName: string | null;
    startFrame: number | null;
    endFrame: number | null;
    loops: boolean;
    /** Set only on a conditionBool clip; the two branch fields exist nowhere
     *  else, and offering them everywhere would invite rejected writes. */
    trueClip?: string | null;
    falseClip?: string | null;
    isCondition: boolean;
    busy: boolean;
    editable: boolean;
    onCommit: (field: ClipField, value: AnmValue) => void;
    onRename: (value: AnmValue) => void;
}

function ClipFields({
    name,
    trackDataName,
    maskDataName,
    startFrame,
    endFrame,
    loops,
    trueClip,
    falseClip,
    isCondition,
    busy,
    editable,
    onCommit,
    onRename,
}: ClipFieldsProps) {
    return (
        <div className="anm-clip__props">
            <AnmFieldRow
                label="Name"
                value={name}
                type="text"
                busy={busy}
                editable={editable}
                title="Rekeys the clip. References to the old name are not updated."
                onCommit={onRename}
            />
            <AnmFieldRow
                label="Track"
                value={trackDataName}
                type="text"
                busy={busy}
                editable={editable}
                onCommit={(v) => onCommit('trackDataName', v)}
            />
            <AnmFieldRow
                label="Mask"
                value={maskDataName}
                type="text"
                busy={busy}
                editable={editable}
                onCommit={(v) => onCommit('maskDataName', v)}
            />
            {/* The clip's own frame span. `AnmSystemMeta` does not carry
                startFrame / endFrame today - toSystem() drops the two fields
                ClipInfo already has - so these rows write fine but read back
                empty until anmModel.ts forwards them. */}
            <AnmFieldRow
                label="Start Frame"
                value={startFrame}
                type="number"
                busy={busy}
                editable={editable}
                onCommit={(v) => onCommit('startFrame', v)}
            />
            <AnmFieldRow
                label="End Frame"
                value={endFrame}
                type="number"
                busy={busy}
                editable={editable}
                onCommit={(v) => onCommit('endFrame', v)}
            />
            <AnmFieldRow
                label="Loops"
                value={loops}
                type="bool"
                busy={busy}
                editable={editable}
                onCommit={(v) => onCommit('loops', v)}
            />
            {isCondition && (
                <>
                    <AnmFieldRow
                        label="True Clip"
                        value={trueClip ?? null}
                        type="text"
                        busy={busy}
                        editable={editable}
                        onCommit={(v) => onCommit('trueClip', v)}
                    />
                    <AnmFieldRow
                        label="False Clip"
                        value={falseClip ?? null}
                        type="text"
                        busy={busy}
                        editable={editable}
                        onCommit={(v) => onCommit('falseClip', v)}
                    />
                </>
            )}
        </div>
    );
}

export default React.memo(ClipFields);
