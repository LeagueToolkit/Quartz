import type { EditorNode, EditorSystem } from '@/lib/api/bineditor';
import { collectScalableLeaves, sameKey } from './nodes';

export { sameKey };

/* "Categories" are individual fields, not semantic buckets. Every distinct field
   name in the selected VFX system can be a tab, so bulk-scaling `birthScale0`
   touches ONLY `birthScale0`. Tabs are ORDERED: the common scalable fields first,
   then other bulk-relevant fields, then everything else behind "+ more".
   Ported from bineditorV3/model/categories.js. */

// Most-used fields, in preferred tab order.
const PRIORITY = [
    'birthScale0', 'scale0', 'particleLifetime', 'lifetime', 'rate', 'particleLinger',
    'bindWeight', 'pass', 'birthRotation0', 'birthVelocity',
];

/** The bulk-scope key for a field = the field's own name. */
export function classify(field: EditorNode): string {
    return field.key ?? 'other';
}

// --- Ability bucketing (for the left-list filter chips: Q/W/E/R/Passive/…) ---
const ABILITY_LETTERS: Record<string, string> = {
    BA: 'Basic Attack', Q: 'Q', W: 'W', E: 'E', R: 'R', P: 'Passive',
};
const ABILITY_ORDER = ['BA', 'Q', 'W', 'E', 'R', 'P', 'Recall', 'Emote', 'Other'];

/** Classify a VFX system into an ability bucket from its name (e.g. Ahri_Base_R_tar -> 'R'). */
export function abilityOf(systemName: string): string {
    const tail = String(systemName).split('/').pop() ?? '';
    const segs = tail.split('_');
    for (const s of segs) {
        const u = s.toUpperCase();
        if (ABILITY_LETTERS[u]) return u;
    }
    if (/recall/i.test(tail)) return 'Recall';
    if (/emote|dance|joke|laugh|taunt/i.test(tail)) return 'Emote';
    return 'Other';
}

export function abilityLabel(key: string): string {
    return ABILITY_LETTERS[key] ?? key;
}

export interface AbilityChip {
    key: string;
    label: string;
    count: number;
}

/** Ordered ability chips present among systems (no 'All' — the UI adds it). */
export function abilityChips(systems: EditorSystem[]): AbilityChip[] {
    const counts: Record<string, number> = {};
    for (const s of systems) {
        const a = abilityOf(s.name);
        counts[a] = (counts[a] ?? 0) + 1;
    }
    return ABILITY_ORDER.filter((k) => counts[k]).map((k) => ({
        key: k,
        label: abilityLabel(k),
        count: counts[k],
    }));
}

/** Human-friendly label for a field key, e.g. "birthScale0" -> "Birth Scale 0". Hashes pass through. */
export function prettyName(key: string): string {
    const s = String(key);
    if (/^0x[0-9a-f]+$/i.test(s)) return s; // unresolved hash — show as-is
    return s
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Za-z])(\d)/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
}

/** Is this field worth a bulk tab (scalable number, flag, or color)? */
export function isBulkRelevant(field: EditorNode): boolean {
    if (collectScalableLeaves(field).length > 0) return true;
    if (field.kind === 'primitive' && field.valueType === 'bool') return true;
    if (field.kind === 'vector' && (field.children?.length ?? 0) === 4) return true; // color
    return false;
}

function rank(field: EditorNode): number {
    const i = PRIORITY.indexOf(field.key ?? '');
    if (i !== -1) return i; // common scalable fields first
    if (isBulkRelevant(field)) return 100; // other bulk-relevant fields
    return 200; // strings/structs — behind "+ more"
}

/**
 * Distinct field names present among `fields`, ordered: priority scalable
 * fields, then other bulk-relevant fields, then the rest. The UI shows the
 * first ~10 and hides the rest behind a "+ more" expander.
 */
export function categoriesPresent(fields: EditorNode[]): string[] {
    const first = new Map<string, { key: string; field: EditorNode; order: number }>();
    fields.forEach((f, idx) => {
        const k = classify(f);
        const norm = k.toLowerCase();
        if (!first.has(norm)) first.set(norm, { key: k, field: f, order: idx });
    });
    return [...first.values()]
        .sort((a, b) => {
            const ra = rank(a.field);
            const rb = rank(b.field);
            return ra !== rb ? ra - rb : a.order - b.order;
        })
        .map((v) => v.key);
}
