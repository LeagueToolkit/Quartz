import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info as InfoIcon, X as CloseIcon, Check } from 'lucide-react';

export interface ExtractionDecision {
    skinKey: string;
    clean: boolean;
}

export interface ExtractionPayload {
    decisions: ExtractionDecision[];
    options: {
        extractVoiceover: boolean;
        /* Skip exporting SFX audio banks (default true). */
        skipSfx: boolean;
        /* Skin Files Only finalize options (used when clean === true). */
        preserveHudIcons2D: boolean;
        splitVfx: boolean;
        splitAnm: boolean;
        consolidateAssets: boolean;
        /* Name for the extraction's folder inside the output path. Empty = keep
           the generated `<champ>_skin<N>_extracted`. Single-skin runs only. */
        folderName: string;
        outputOverride: {
            enabled: boolean;
            keepForAll: boolean;
            path: string;
            perSkinPaths: Record<string, string>;
        };
    };
}

interface PendingSkin {
    championName: string;
    skinId: number;
    skinName: string;
    /** Backend champion id. Display names are not unique — the legacy ("Jade")
     *  champions reuse the modern champion's name — so this keys the per-skin
     *  decisions and output paths. */
    championId?: string;
}

interface Props {
    open: boolean;
    skins: PendingSkin[];
    defaultOutputPath: string;
    recentOutputPaths: string[];
    onBrowseOutputPath: () => Promise<string>;
    onDecide: (payload: ExtractionPayload) => void;
    onCancel: () => void;
}

/* A Design Lab styled checkbox row. */
function DlCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="dl-check">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="dl-check__box">
                <span className="dl-check__tick"><span className="dl-icon"><Check size={12} /></span></span>
            </span>
            <span>{label}</span>
        </label>
    );
}

/* The Rust backend extract_champion_assets supports voiceover + output dir; the
   Electron-only "Skin Files Only" clean mode and bin split/consolidate are not
   yet wired. The clean flag is still carried through for when a backend lands. */
export function ExtractionModeModal({
    open,
    skins = [],
    defaultOutputPath = '',
    recentOutputPaths = [],
    onBrowseOutputPath,
    onDecide,
    onCancel,
}: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [decisions, setDecisions] = useState<ExtractionDecision[]>([]);
    const [extractVoiceover, setExtractVoiceover] = useState(false);
    const [skipSfx, setSkipSfx] = useState(true);
    const [preserveHudIcons2D, setPreserveHudIcons2D] = useState(true);
    const [splitVfx, setSplitVfx] = useState(false);
    const [splitAnm, setSplitAnm] = useState(false);
    const [consolidateAssets, setConsolidateAssets] = useState(true);
    const [outputOverrideEnabled, setOutputOverrideEnabled] = useState(false);
    const [outputKeepForAll, setOutputKeepForAll] = useState(true);
    const [outputPath, setOutputPath] = useState('');
    const [outputPathsBySkin, setOutputPathsBySkin] = useState<Record<string, string>>({});
    const [applyToAll, setApplyToAll] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    /** Blank = keep the generated `<champ>_skin<N>_extracted` name. */
    const [folderName, setFolderName] = useState('');

    useEffect(() => {
        if (open) {
            setCurrentIndex(0);
            setDecisions([]);
            setExtractVoiceover(false);
            setSkipSfx(true);
            setPreserveHudIcons2D(true);
            setSplitVfx(false);
            setSplitAnm(false);
            setConsolidateAssets(true);
            setOutputOverrideEnabled(false);
            setOutputKeepForAll(true);
            setOutputPath(String(defaultOutputPath || ''));
            setOutputPathsBySkin({});
            setApplyToAll(false);
            setInfoOpen(false);
            setFolderName('');
        }
    }, [open, defaultOutputPath]);

    if (!open || skins.length === 0) return null;

    const total = skins.length;
    const multiSkin = total > 1;
    const current = skins[currentIndex];
    /* Shown as the placeholder so the field reads as "leave blank for this".
       Approximates the backend's name (it also appends `_chroma_<id>`/`_clean`),
       which is enough for a hint. */
    const defaultFolderName = multiSkin
        ? ''
        : `${(current.championId || current.championName || '').toLowerCase()}_skin${current.skinId}_extracted`;
    const skinKey = (s: PendingSkin) => `${s.championId || s.championName}_${s.skinId}`;

    // A single custom folder name cannot serve several skins (they would collide and
    // each get an auto-versioned suffix), so it is only sent for a single-skin run.
    const finalizeOptions = {
        extractVoiceover, skipSfx, preserveHudIcons2D, splitVfx, splitAnm, consolidateAssets,
        folderName: multiSkin ? '' : folderName.trim(),
    };

    const resolvePayload = (nextDecisions: ExtractionDecision[]): ExtractionPayload => ({
        decisions: nextDecisions,
        options: {
            ...finalizeOptions,
            outputOverride: { enabled: outputOverrideEnabled, keepForAll: outputKeepForAll, path: outputPath, perSkinPaths: outputPathsBySkin },
        },
    });

    const handleDecision = (clean: boolean) => {
        const currentEntry: ExtractionDecision = { skinKey: skinKey(current), clean };

        if (applyToAll) {
            const remaining = skins.slice(currentIndex).map((s) => ({ skinKey: skinKey(s), clean }));
            const finalDecisions = [...decisions, ...remaining];
            const finalPathsBySkin = { ...outputPathsBySkin };
            if (outputOverrideEnabled) {
                skins.slice(currentIndex).forEach((s) => {
                    finalPathsBySkin[skinKey(s)] = outputPath || defaultOutputPath;
                });
            }
            onDecide({
                decisions: finalDecisions,
                options: {
                    ...finalizeOptions,
                    outputOverride: { enabled: outputOverrideEnabled, keepForAll: outputKeepForAll, path: outputPath, perSkinPaths: finalPathsBySkin },
                },
            });
            return;
        }

        const mappedPaths = { ...outputPathsBySkin };
        if (outputOverrideEnabled) {
            mappedPaths[skinKey(current)] = outputPath || defaultOutputPath;
            setOutputPathsBySkin(mappedPaths);
        }

        const next = [...decisions, currentEntry];
        if (currentIndex + 1 >= total) {
            onDecide(resolvePayload(next));
        } else {
            setDecisions(next);
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            if (outputOverrideEnabled && !outputKeepForAll) {
                const nextSkinKey = skinKey(skins[nextIndex]);
                setOutputPath(mappedPaths[nextSkinKey] || outputPath || defaultOutputPath);
            }
        }
    };

    const sectionStyle: React.CSSProperties = { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14, marginTop: 16 };
    const sectionTitle: React.CSSProperties = { color: 'var(--accent-primary)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 8px' };

    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dl-modal">
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">
                        {multiSkin ? `Extraction Skin ${currentIndex + 1} of ${total}` : 'Extraction Mode'}
                    </h3>
                    <button className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm" onClick={() => setInfoOpen(!infoOpen)} title="Help Info">
                        <span className="dl-icon"><InfoIcon size={15} /></span>
                    </button>
                    <button className="dl-modal__close" onClick={onCancel} aria-label="Close">
                        <span className="dl-icon"><CloseIcon size={16} /></span>
                    </button>
                </div>

                <div className="dl-modal__body">
                    {infoOpen && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            <div style={{ marginBottom: 6 }}>
                                <strong style={{ color: 'var(--accent-primary)' }}>Whole WAD:</strong> Extracts everything as-is. Best for finding missing assets.
                            </div>
                            <div>
                                <strong style={{ color: 'var(--accent-primary)' }}>Skin Files Only:</strong> Only extracts models and skins (recommended).
                            </div>
                        </div>
                    )}

                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{current.championName} — {current.skinName}</p>

                    <div style={sectionStyle}>
                        <h4 style={sectionTitle}>Options</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {multiSkin && (
                                <DlCheck checked={applyToAll} onChange={setApplyToAll} label="Apply mode to all remaining skins" />
                            )}
                            <DlCheck checked={extractVoiceover} onChange={setExtractVoiceover} label="Extract Voiceover" />
                            <DlCheck checked={skipSfx} onChange={setSkipSfx} label="Skip SFX export" />

                            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    Skin Files Only
                                </div>
                                <DlCheck checked={preserveHudIcons2D} onChange={setPreserveHudIcons2D} label="Preserve HUD ability icons" />
                                <DlCheck checked={consolidateAssets} onChange={setConsolidateAssets} label="Consolidate VFX assets into per-skin folders" />
                                <DlCheck checked={splitVfx} onChange={setSplitVfx} label="Split VFX into a separate bin" />
                                <DlCheck checked={splitAnm} onChange={setSplitAnm} label="Split animations into a separate bin" />
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                                    Output
                                </div>
                                <DlCheck checked={outputOverrideEnabled} onChange={setOutputOverrideEnabled} label="Override Output Path" />
                            </div>
                            {outputOverrideEnabled && multiSkin && (
                                <div style={{ marginLeft: 20 }}>
                                    <DlCheck checked={outputKeepForAll} onChange={setOutputKeepForAll} label="Keep same output path for all selected skins" />
                                </div>
                            )}
                            {outputOverrideEnabled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 4 }}>
                                    <input
                                        className="dl-input"
                                        list="ae-recent-paths-extract"
                                        value={outputPath}
                                        onChange={(e) => setOutputPath(e.target.value)}
                                        placeholder={defaultOutputPath || 'Select output path...'}
                                    />
                                    <button
                                        type="button"
                                        className="dl-btn dl-btn--secondary"
                                        onClick={async () => {
                                            const picked = await onBrowseOutputPath?.();
                                            if (picked) setOutputPath(String(picked));
                                        }}
                                    >
                                        Browse
                                    </button>
                                    {recentOutputPaths.length > 0 && (
                                        <datalist id="ae-recent-paths-extract">
                                            {recentOutputPaths.map((p) => (
                                                <option key={p} value={p} />
                                            ))}
                                        </datalist>
                                    )}
                                </div>
                            )}

                            {/* Names the extraction's own folder INSIDE the output path,
                                replacing the generated `<champ>_skin<N>_extracted`. Left
                                blank it keeps that name. Disabled for a multi-skin run:
                                one name for several skins would collide, and each would
                                just get an auto-versioned suffix. */}
                            <div style={{ marginTop: 8 }}>
                                <label
                                    htmlFor="ae-folder-name"
                                    style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}
                                >
                                    Folder name {multiSkin && <span>(single skin only)</span>}
                                </label>
                                <input
                                    id="ae-folder-name"
                                    className="dl-input"
                                    value={folderName}
                                    disabled={multiSkin}
                                    onChange={(e) => setFolderName(e.target.value)}
                                    placeholder={multiSkin ? 'Auto-named per skin' : defaultFolderName || 'e.g. my-aurora-mod'}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={() => handleDecision(false)}>Whole WAD</button>
                    <button className="dl-btn dl-btn--primary" onClick={() => handleDecision(true)}>Skin Files Only</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
