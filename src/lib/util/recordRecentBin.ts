import { useUiPrefsStore } from '@/lib/stores/uiPrefsStore';
import { useExplorerStore } from '@/components/explorer/explorerStore';

/* Quartz tracks recently opened files in TWO independent places:

   - `uiPrefsStore.recentBins` — the "Recent bins" lists rendered on the bin
     pages (Paint, Bin Editor, FakeGear, Particle Randomizer).
   - `explorerStore.recents[bucket]` — the custom file explorer's own per-bucket
     recents, shown in its sidebar.

   The explorer fills its bucket from inside the picker, so a file chosen
   through the dialog lands in both. A drag-and-drop never opens the picker, so
   it used to reach only the first list and the file was missing from the
   explorer's Recent section. Route every non-picker open through here to keep
   the two in step. */

/** Record a bin opened outside the file picker (drag-and-drop, CLI handoff,
 *  "open with") into both recent lists. `bucket` must match the `recentsKey`
 *  that page passes to the picker, so the explorer shows it in the same place.
 */
export function recordRecentBin(path: string, bucket = 'bin'): void {
    if (!path) return;
    useUiPrefsStore.getState().pushRecentBin(path);
    useExplorerStore.getState().addRecent(bucket, path);
}
