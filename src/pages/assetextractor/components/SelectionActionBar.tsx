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
    onInspectModel: () => void;
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
    onInspectModel,
    onClearAll,
}: Props) {
    const hasSelection = selectedSkins.length > 0;
    const busy = isExtracting || isRepathing || isPreviewing;
    const disabledAction = busy || !isSetupValid || !hasSelection;
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

            {statusMessage && <span className="ae-bottom-bar__status">{statusMessage}</span>}

            <div className="ae-bottom-bar__group">
                <button className="dl-btn dl-btn--sm ae-extract-btn" onClick={onExtract} disabled={disabledAction}>
                    {isExtracting ? 'Extracting...' : 'Extract'}
                </button>
                <button className="dl-btn dl-btn--sm dl-btn--primary" onClick={onRepath} disabled={disabledAction} title="Extract, combine, and repath into an installable mod">
                    {isRepathing ? 'Repathing...' : 'Repath'}
                </button>
                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={onInspectModel} disabled={disabledAction} title="Preview the first selected skin model">
                    {isPreviewing ? 'Preparing Model...' : 'Inspect Model'}
                </button>
                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={onClearAll} disabled={busy || !hasSelection}>
                    Clear All
                </button>
            </div>
        </div>
    );
}
