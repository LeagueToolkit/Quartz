/* Which fields of an event are writable, per class.
 *
 * The read side already has `eventFields()` in anmModel.ts, and this is
 * deliberately NOT a refactor of it. That function answers "what does this
 * event carry", including things no command can write: a particle event's bone
 * pairs live on a nested node with no name and no hash, and an unknown event's
 * class hash is identity, not data. This one answers "what can the user
 * change", which is the strict subset the `EventField` union names.
 *
 * Keep the labels identical to eventFields()' labels. The collapsed summary is
 * still built from that function, so a row the user opens must be labelled the
 * same as the summary line it came from.
 */

import type { AnimEvent } from '@/lib/api/vfxSession';
import type { EventField } from '@/lib/api/vfxAnm';

/** How a row renders and what it commits. `list` is a comma-separated string
 *  the backend splits; it is a text box to the user. */
export type AnmFieldType = 'text' | 'number' | 'bool' | 'list';

export interface AnmEditRow {
    field: EventField;
    label: string;
    type: AnmFieldType;
    /** Current value, in the shape the row's editor expects. */
    value: string | number | boolean | null;
}

/** Writable rows for an event, in the order the bin writes them. Returns [] for
 *  a class with nothing addressable, which is honest: an unknown event is
 *  preserved verbatim precisely because nothing here models it. */
export function eventEditRows(event: AnimEvent): AnmEditRow[] {
    const k = event.kind;
    switch (k.type) {
        case 'particle':
            return [
                { field: 'effectKey', label: 'Effect Key', type: 'text', value: k.effectKey },
                { field: 'startFrame', label: 'Start Frame', type: 'number', value: k.startFrame },
                { field: 'isLoop', label: 'Is Loop', type: 'bool', value: k.isLoop },
            ];
        case 'sound':
            return [
                { field: 'soundName', label: 'Sound Name', type: 'text', value: k.soundName },
                { field: 'isLoop', label: 'Is Loop', type: 'bool', value: k.isLoop },
            ];
        case 'submeshVisibility':
            return [
                { field: 'startFrame', label: 'Start Frame', type: 'number', value: k.startFrame },
                { field: 'endFrame', label: 'End Frame', type: 'number', value: k.endFrame },
                { field: 'show', label: 'Show', type: 'list', value: k.show.join(', ') },
                { field: 'hide', label: 'Hide', type: 'list', value: k.hide.join(', ') },
            ];
        case 'faceTarget':
            return [
                { field: 'endFrame', label: 'End Frame', type: 'number', value: k.endFrame },
                {
                    field: 'yRotationDegrees',
                    label: 'Y Rotation',
                    type: 'number',
                    value: k.yRotationDegrees,
                },
            ];
        case 'conformToPath':
            return [
                { field: 'maskDataName', label: 'Mask Data Name', type: 'text', value: k.maskDataName },
                { field: 'blendInTime', label: 'Blend In Time', type: 'number', value: k.blendInTime },
                { field: 'blendOutTime', label: 'Blend Out Time', type: 'number', value: k.blendOutTime },
            ];
        case 'lockRootOrientation':
            return [
                { field: 'startFrame', label: 'Start Frame', type: 'number', value: k.startFrame },
                { field: 'endFrame', label: 'End Frame', type: 'number', value: k.endFrame },
                { field: 'jointName', label: 'Joint Name', type: 'text', value: k.jointName },
                { field: 'blendOutTime', label: 'Blend Out Time', type: 'number', value: k.blendOutTime },
            ];
        case 'stopAnimation':
            return [
                {
                    field: 'stopAnimationName',
                    label: 'Animation',
                    type: 'text',
                    value: k.stopAnimationName,
                },
            ];
        default:
            return [];
    }
}

/* Classes a new event can be created as. Only classes the read layer models,
   so a created event is one the card can then edit rather than an opaque row. */
export const NEW_EVENT_KINDS: ReadonlyArray<{ kind: string; label: string }> = [
    { kind: 'particle', label: 'Particle' },
    { kind: 'sound', label: 'Sound' },
    { kind: 'submeshVisibility', label: 'Submesh Visibility' },
    { kind: 'faceTarget', label: 'Face Target' },
    { kind: 'conformToPath', label: 'Conform To Path' },
    { kind: 'lockRootOrientation', label: 'Lock Root Orientation' },
    { kind: 'stopAnimation', label: 'Stop Animation' },
];
