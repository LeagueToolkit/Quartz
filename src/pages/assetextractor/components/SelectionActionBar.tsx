import type { SelectedSkin } from '../types';

interface Props {
    selectedSkins: SelectedSkin[];
    statusMessage: string;
    isExtracting: boolean;
    isRepathing: boolean;
    isPreviewing: boolean;
    isSetupValid: boolean;
    onExtract: () => void;
    onRepath: () => void;
    onClearAll: () => void;
}

/* Bottom action bar (mirrors PortBottomControls). Left: selection count + names.
   Center: latest status message. Right: Extract / Repath / Clear. Renders only
   when at least one skin is selected. */
export function SelectionActionBar({
    selectedSkins,
    statusMessage,
    isExtracting,
    isRepathing,
    isPreviewing,
    isSetupValid,
    onExtract,
    onRepath,
    onClearAll,
}: Props) {
    const hasSelection = selectedSkins.length > 0;
    const busy = isExtracting || isRepathing || isPreviewing;
    const disabledAction = busy || !isSetupValid || !hasSelection;
    /* Say WHY the button is dead. A disabled Extract with a skin plainly
       selected reads as a broken button, and the missing setup is on a
       different page, so there is nothing on screen to connect it to. */
    const blockedReason = !isSetupValid
        ? 'Set the League folder and an output folder in Settings first'
        : !hasSelection
          ? 'Select at least one skin'
          : '';
    const names = selectedSkins
        .map((s) => `${s.name}${s.champion?.name ? ` (${s.champion.name})` : ''}`)
        .join(', ');

    return (
        <div className="ae-bottom-bar">
            <div className="ae-bottom-bar__group">
                <span className="dl-badge"><span className="dl-badge__dot" />{selectedSkins.length} selected</span>
                {hasSelection
                    ? <span className="ae-bottom-bar__names" title={names}>{names}</span>
                    : <span className="ae-bottom-bar__names" style={{ color: 'var(--text-muted)' }}>No skins selected</span>}
            </div>

            {statusMessage
                ? <span className="ae-bottom-bar__status">{statusMessage}</span>
                : blockedReason && <span className="ae-bottom-bar__status">{blockedReason}</span>}

            <div className="ae-bottom-bar__group">
                <button
                    className="dl-btn dl-btn--sm ae-extract-btn"
                    onClick={onExtract}
                    disabled={disabledAction}
                    title={blockedReason || 'Extract the selected skin files'}
                >
                    {isExtracting ? 'Extracting...' : 'Extract'}
                </button>
                <button
                    className="dl-btn dl-btn--sm dl-btn--primary"
                    onClick={onRepath}
                    disabled={disabledAction}
                    title={blockedReason || 'Extract, combine, and repath into an installable mod'}
                >
                    {isRepathing ? 'Repathing...' : 'Repath'}
                </button>
                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={onClearAll} disabled={busy || !hasSelection}>
                    Clear All
                </button>
            </div>
        </div>
    );
}
