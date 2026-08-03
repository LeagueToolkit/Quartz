/* The read-only one-liner that replaced the clip card's field block.
 *
 * The fields moved into ClipEditModal, but a card that showed nothing but its
 * events would hide what the clip IS — which track it drives, whether it loops,
 * which .anm it plays. This renders only the parts that are actually set, so a
 * sparse clip stays a short line instead of a column of em-dashes.
 */

import React from 'react';

interface ClipSummaryProps {
    trackDataName: string | null;
    maskDataName: string | null;
    anmPath: string | null;
    startFrame: number | null;
    endFrame: number | null;
    loops: boolean;
    trueClip?: string | null;
    falseClip?: string | null;
    isCondition: boolean;
}

/** `.anm` paths are long and the leaf is the identifying part. */
function anmLeaf(path: string): string {
    return path.split(/[\\/]/).pop() || path;
}

function ClipSummary(props: ClipSummaryProps) {
    const {
        trackDataName, maskDataName, anmPath,
        startFrame, endFrame, loops, trueClip, falseClip, isCondition,
    } = props;

    const parts: Array<{ label: string; value: string; title?: string }> = [];

    if (trackDataName) parts.push({ label: 'Track', value: trackDataName });
    if (maskDataName) parts.push({ label: 'Mask', value: maskDataName });

    // One span for the pair: a clip with only an end frame is normal, and two
    // separate chips for what reads as one range is noisier than it is useful.
    if (startFrame != null || endFrame != null) {
        parts.push({
            label: 'Frames',
            value: `${startFrame ?? '·'}–${endFrame ?? '·'}`,
        });
    }

    // Only worth stating when true: every clip has the field, and "Loops false"
    // on every row would crowd out the parts that differ.
    if (loops) parts.push({ label: 'Loops', value: 'true' });

    if (isCondition) {
        if (trueClip) parts.push({ label: 'True', value: trueClip });
        if (falseClip) parts.push({ label: 'False', value: falseClip });
    }

    if (anmPath) parts.push({ label: 'Anm', value: anmLeaf(anmPath), title: anmPath });

    if (parts.length === 0) return null;

    return (
        <div className="anm-clip__summary">
            {parts.map((p) => (
                <span className="anm-clip__summary-part" key={p.label} title={p.title}>
                    <span className="anm-clip__summary-label">{p.label}</span>
                    <span className="anm-clip__summary-value">{p.value}</span>
                </span>
            ))}
        </div>
    );
}

export default React.memo(ClipSummary);
