/* Clip search.
 *
 * Structurally the same idea as usePort's `filterSystems` (match the parent, or
 * narrow it to its matching children) but over a different vocabulary, because
 * what identifies a clip is not what identifies a VFX system.
 *
 * WHAT IS SEARCHABLE, AND WHY IT IS TIERED
 * A clip's name is frequently an unresolved hash, so name-only search is close
 * to useless on a real bin: in Yasuo skin36 most keys read as `0x1a2b3c4d`. The
 * things a user actually knows are the `.anm` filename and the CONTENT of the
 * events (an effect key, a sound name, a submesh). Those live at different
 * depths, so a single flat "does any string contain the term" pass would let a
 * deep incidental hit outrank an obvious one.
 *
 * Hence four tiers, most-identifying first:
 *   1. the clip's TITLE  - the map key, plus the `.anm` stem shown beside it
 *                         when that key is an unresolved hash. Both halves,
 *                         because the row displays `0x58fc2d21 (Recall)` and
 *                         typing either part must find it.
 *   2. its `.anm` FILENAME - the stem only. The full path is deliberately not
 *                         searched: every clip in a skin shares the same folders,
 *                         so a path match returns clips whose names have nothing
 *                         to do with the term.
 *   3. its events       - the event key, and the class's own values
 *   4. its track / mask - the least specific, and the noisiest: several clips
 *                         routinely share one track, so a track hit would
 *                         otherwise return half the bin and bury the tiers above.
 *
 * The first tier that produces anything wins, exactly as the VFX filter lets
 * name hits suppress texture hits. Within tier 2 the clip is narrowed to the
 * events that matched, so opening a search result shows the event you searched
 * for rather than all forty of them.
 *
 * Pure: no mutation, and a clip is only shallow-copied when its event list is
 * actually narrowed, so an unnarrowed row keeps its identity and React.memo
 * still holds.
 */

import type { AnimEvent } from '@/lib/api/vfxSession';
import { isAnmEmitter, type AnmSystem } from './anmModel';

/** Every value on an event worth matching, flattened. Mirrors the per-class
 *  field lists `anmModel.eventFields` renders, so what you see on a card is
 *  what you can search for. */
function eventHaystack(event: AnimEvent): string {
    const k = event.kind;
    const parts: Array<string | null | undefined> = [event.name];
    switch (k.type) {
        case 'particle':
            parts.push(k.effectKey);
            // The bone lives on the nested pair, never on the event itself.
            for (const p of k.pairs) parts.push(p.boneName, p.targetBoneName);
            break;
        case 'sound':
            parts.push(k.soundName);
            break;
        case 'submeshVisibility':
            parts.push(...k.show, ...k.hide);
            break;
        case 'conformToPath':
            parts.push(k.maskDataName);
            break;
        case 'lockRootOrientation':
            parts.push(k.jointName);
            break;
        case 'stopAnimation':
            parts.push(k.stopAnimationName);
            break;
        case 'unknown':
            // An unmodelled class is still real data. Its hash is the only
            // handle a user has on it, so keep it findable.
            parts.push(`0x${k.classHash.toString(16).padStart(8, '0')}`);
            break;
        default:
            break;
    }
    return parts.filter(Boolean).join(' ').toLowerCase();
}

/** The `.anm` FILENAME, without its folders or extension. */
function anmStem(anmPath: string | null): string {
    if (!anmPath) return '';
    const file = anmPath.replace(/\\/g, '/').split('/').pop() ?? '';
    return file.replace(/\.anm$/i, '').toLowerCase();
}

/* Match everything the row TITLES itself with.
 *
 * `clip.name` is the map key, which for most League animation graphs is an
 * unresolved hash — the row shows `0x58fc2d21 (Recall)`, where "Recall" comes
 * from the `.anm` stem. Matching the key alone meant typing the name you can
 * plainly see on screen returned nothing, because the only thing being compared
 * was the hash. Both halves of the visible title are searchable. */
function clipMatches(clip: AnmSystem, term: string): boolean {
    if ((clip.name || clip.key || '').toLowerCase().includes(term)) return true;
    const label = clip.anm.anmLabel;
    return !!label && label.toLowerCase().includes(term);
}

function trackOrMaskMatches(clip: AnmSystem, term: string): boolean {
    const { trackDataName, maskDataName } = clip.anm;
    return (
        (trackDataName ?? '').toLowerCase().includes(term) ||
        (maskDataName ?? '').toLowerCase().includes(term)
    );
}

/** Filter clips by `rawTerm`. An empty term returns the list unchanged (same
 *  reference, so nothing re-renders). */
export function filterClips(list: AnmSystem[], rawTerm: string): AnmSystem[] {
    const term = rawTerm.trim().toLowerCase();
    if (!term) return list;

    // Tier 1: the clip's own name.
    const byClip = list.filter((clip) => clipMatches(clip, term));
    if (byClip.length > 0) return byClip;

    /* Tier 2: the `.anm` FILENAME, never the full path. Matching the whole path
       meant a folder segment counted as a hit, so searching "recall" returned
       every Joke/Dance/Taunt clip whose animation happened to live beside a
       recall one. The folders are identical across a skin's clips, so they can
       only ever add noise. */
    const byAnm = list.filter((clip) => anmStem(clip.anm.anmPath).includes(term));
    if (byAnm.length > 0) return byAnm;

    /* Tier 3: event content, narrowing each clip to the events that hit. A clip
       whose events all match is returned as-is rather than copied, so the common
       single-event case keeps its identity. */
    const byEvent: AnmSystem[] = [];
    for (const clip of list) {
        const matching = clip.emitters.filter(
            (e) => isAnmEmitter(e) && eventHaystack(e.anm.event).includes(term),
        );
        if (matching.length === 0) continue;
        byEvent.push(
            matching.length === clip.emitters.length
                ? clip
                : { ...clip, emitters: matching, anm: { ...clip.anm, eventCount: matching.length } },
        );
    }
    if (byEvent.length > 0) return byEvent;

    // Tier 4: shared references, last because one track can name half the bin.
    return list.filter((clip) => trackOrMaskMatches(clip, term));
}
