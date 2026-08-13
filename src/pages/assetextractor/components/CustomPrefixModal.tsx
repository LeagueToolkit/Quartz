import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info as InfoIcon, X as CloseIcon, Check } from 'lucide-react';

/* The "Repath Mode" step. Steps through each selected skin so the user can set a
   per-skin prefix, then Start Repath runs the extract -> combine -> repath ->
   (split) -> consolidate pipeline. Options mirror the old modal; output path
   override + recent paths included. */

export interface RepathSkin {
    championName: string;
    skinId: number;
    skinName: string;
    chromaId: number | null;
    /** Backend champion id — see ExtractionModeModal.PendingSkin: display names
     *  are not unique across the modern and legacy ("Jade") champion sets. */
    championId?: string;
    /** TFT companion WAD folder alias (e.g. petbunny); undefined for champions. */
    petAlias?: string;
    /** TFT skin index (itemId % 1000). */
    tier?: number;
}

export interface RepathOptionsPayload {
    prefixesBySkinId: Record<number, string>;
    skipSfxRepath: boolean;
    extractVoiceover: boolean;
    preserveHudIcons2D: boolean;
    splitVfx: boolean;
    splitAnm: boolean;
    consolidateAssets: boolean;
    outputOverride: { enabled: boolean; keepForAll: boolean; path: string; perSkinPaths: Record<string, string> };
    /** Name for the mod folder, replacing the generated
     *  `<champ>_skin<N>_extracted`. Empty keeps it. Single-skin runs only. */
    folderName: string;
}

interface Props {
    open: boolean;
    skins: RepathSkin[];
    defaultOutputPath: string;
    recentOutputPaths: string[];
    onBrowseOutputPath: () => Promise<string>;
    onStart: (payload: RepathOptionsPayload) => void;
    onCancel: () => void;
}

const sanitizePrefix = (v: string) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
const skinKeyOf = (s: RepathSkin) => `${s.championId || s.championName}_${s.skinId}`;

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

export function CustomPrefixModal({
    open,
    skins = [],
    defaultOutputPath = '',
    recentOutputPaths = [],
    onBrowseOutputPath,
    onStart,
    onCancel,
}: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [prefixesBySkinId, setPrefixesBySkinId] = useState<Record<number, string>>({});
    const [prefixInput, setPrefixInput] = useState('');
    const [applyToAll, setApplyToAll] = useState(false);
    const [skipSfxRepath, setSkipSfxRepath] = useState(true);
    const [extractVoiceover, setExtractVoiceover] = useState(false);
    const [preserveHudIcons2D, setPreserveHudIcons2D] = useState(true);
    const [splitVfx, setSplitVfx] = useState(false);
    const [splitAnm, setSplitAnm] = useState(false);
    const [consolidateAssets, setConsolidateAssets] = useState(true);
    const [outputOverrideEnabled, setOutputOverrideEnabled] = useState(false);
    const [outputKeepForAll, setOutputKeepForAll] = useState(true);
    const [outputPath, setOutputPath] = useState('');
    const [outputPathsBySkin, setOutputPathsBySkin] = useState<Record<string, string>>({});
    /** Blank = keep the generated `<champ>_skin<N>_extracted` name. */
    const [folderName, setFolderName] = useState('');
    const [infoOpen, setInfoOpen] = useState(false);

    // Reset when (re)opened.
    React.useEffect(() => {
        if (open) {
            setCurrentIndex(0);
            setPrefixesBySkinId({});
            setPrefixInput('');
            setApplyToAll(false);
            setFolderName('');
            setSkipSfxRepath(true);
            setExtractVoiceover(false);
            setPreserveHudIcons2D(true);
            setSplitVfx(false);
            setSplitAnm(false);
            setConsolidateAssets(true);
            setOutputOverrideEnabled(false);
            setOutputKeepForAll(true);
            setOutputPath(String(defaultOutputPath || ''));
            setOutputPathsBySkin({});
            setInfoOpen(false);
        }
    }, [open, defaultOutputPath]);

    if (!open || skins.length === 0) return null;

    const total = skins.length;
    const multiSkin = total > 1;
    const current = skins[currentIndex];
    /* Placeholder only, so the field reads as "leave blank for this". Approximates
       the backend name, which also appends `_chroma_<id>` / `_clean`. */
    const defaultFolderName = multiSkin
        ? ''
        : `${(current.petAlias || current.championId || current.championName || '').toLowerCase()}_skin${current.skinId}_extracted`;
    const isLast = currentIndex === total - 1;
    const sanitized = sanitizePrefix(prefixInput);
    const isPrefixValid = sanitized.length > 0;

    const commitCurrent = () => {
        const nextPrefixes = { ...prefixesBySkinId, [current.skinId]: sanitized };
        const nextPaths = { ...outputPathsBySkin };
        if (outputOverrideEnabled) nextPaths[skinKeyOf(current)] = outputPath || defaultOutputPath;
        return { nextPrefixes, nextPaths };
    };

    const buildPayload = (prefixes: Record<number, string>, paths: Record<string, string>): RepathOptionsPayload => ({
        prefixesBySkinId: prefixes,
        skipSfxRepath,
        extractVoiceover,
        preserveHudIcons2D,
        splitVfx,
        splitAnm,
        consolidateAssets,
        outputOverride: { enabled: outputOverrideEnabled, keepForAll: outputKeepForAll, path: outputPath, perSkinPaths: paths },
        // One name cannot serve several skins - they would collide and each get an
        // auto-versioned suffix - so it is only sent for a single-skin run.
        folderName: multiSkin ? '' : folderName.trim(),
    });

    const handleNextOrStart = () => {
        if (!isPrefixValid) return;
        const { nextPrefixes, nextPaths } = commitCurrent();

        if (applyToAll) {
            // Fill every remaining skin with this prefix (+ path) and start now.
            const prefixes = { ...nextPrefixes };
            const paths = { ...nextPaths };
            for (const s of skins.slice(currentIndex)) {
                prefixes[s.skinId] = sanitized;
                if (outputOverrideEnabled) paths[skinKeyOf(s)] = outputPath || defaultOutputPath;
            }
            onStart(buildPayload(prefixes, paths));
            return;
        }

        if (isLast) {
            onStart(buildPayload(nextPrefixes, nextPaths));
            return;
        }

        setPrefixesBySkinId(nextPrefixes);
        setOutputPathsBySkin(nextPaths);
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        // Prefill next skin's prefix if it was already set (going back and forth).
        setPrefixInput(nextPrefixes[skins[nextIndex].skinId] || '');
        if (outputOverrideEnabled && !outputKeepForAll) {
            setOutputPath(nextPaths[skinKeyOf(skins[nextIndex])] || outputPath || defaultOutputPath);
        }
    };

    const handlePrevious = () => {
        if (currentIndex === 0) return;
        const { nextPrefixes, nextPaths } = commitCurrent();
        setPrefixesBySkinId(nextPrefixes);
        setOutputPathsBySkin(nextPaths);
        const prevIndex = currentIndex - 1;
        setCurrentIndex(prevIndex);
        setPrefixInput(nextPrefixes[skins[prevIndex].skinId] || '');
        if (outputOverrideEnabled && !outputKeepForAll) {
            setOutputPath(nextPaths[skinKeyOf(skins[prevIndex])] || outputPath || defaultOutputPath);
        }
    };

    const sectionStyle: React.CSSProperties = { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14, marginTop: 16 };
    const sectionTitle: React.CSSProperties = { color: 'var(--accent-primary)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 8px' };

    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dl-modal">
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">
                        {multiSkin ? `Repath Skin ${currentIndex + 1} of ${total}` : 'Repath Mode'}
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
                                <strong style={{ color: 'var(--accent-primary)' }}>Entry Prefix:</strong> the segment inserted into every file path (e.g. myskin). Pick something unique so your mod does not collide with the base game or other mods.
                            </div>
                            <div>
                                <strong style={{ color: 'var(--accent-primary)' }}>Skip SFX Repath:</strong> leave sound paths untouched. Keep on unless you actually changed sounds.
                            </div>
                        </div>
                    )}

                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{current.championName} — {current.skinName}</p>

                    <div style={sectionStyle}>
                        <h4 style={sectionTitle}>Entry Prefix</h4>
                        <input
                            className="dl-input"
                            value={prefixInput}
                            onChange={(e) => setPrefixInput(e.target.value)}
                            placeholder="e.g. myskin_v2"
                            autoFocus
                        />
                        {prefixInput && sanitized !== prefixInput.trim().toLowerCase() && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                Will be used as: <strong style={{ color: 'var(--accent-primary)' }}>{sanitized || '(empty, required)'}</strong>
                            </div>
                        )}
                        {multiSkin && (
                            <div style={{ marginTop: 10 }}>
                                <DlCheck checked={applyToAll} onChange={setApplyToAll} label="Use this prefix for all remaining skins" />
                            </div>
                        )}
                    </div>

                    <div style={sectionStyle}>
                        <h4 style={sectionTitle}>Options</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <DlCheck checked={skipSfxRepath} onChange={setSkipSfxRepath} label="Skip SFX Repath" />
                            <DlCheck checked={extractVoiceover} onChange={setExtractVoiceover} label="Extract Voiceover" />
                            <DlCheck checked={preserveHudIcons2D} onChange={setPreserveHudIcons2D} label="Preserve HUD ability icons" />
                            <DlCheck checked={splitVfx} onChange={setSplitVfx} label="Split VFX into a separate bin" />
                            <DlCheck checked={splitAnm} onChange={setSplitAnm} label="Split animations into a separate bin" />
                            <DlCheck checked={consolidateAssets} onChange={setConsolidateAssets} label="Consolidate VFX assets into per-skin folders" />

                            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
                                <DlCheck checked={outputOverrideEnabled} onChange={setOutputOverrideEnabled} label="Override Output Path" />
                            </div>
                            {outputOverrideEnabled && multiSkin && (
                                <div style={{ marginLeft: 20 }}>
                                    <DlCheck checked={outputKeepForAll} onChange={setOutputKeepForAll} label="Keep same output path for all skins" />
                                </div>
                            )}
                            {outputOverrideEnabled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 4 }}>
                                    <input
                                        className="dl-input"
                                        list="ae-recent-paths-repath"
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
                                        <datalist id="ae-recent-paths-repath">
                                            {recentOutputPaths.map((p) => (<option key={p} value={p} />))}
                                        </datalist>
                                    )}
                                </div>
                            )}

                            {/* Names the mod folder INSIDE the output path. The repath
                                runs in place on the extracted folder, so this is the
                                finished mod's folder name. Blank keeps the generated one. */}
                            <div style={{ marginTop: 8 }}>
                                <label
                                    htmlFor="ae-repath-folder-name"
                                    style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}
                                >
                                    Folder name {multiSkin && <span>(single skin only)</span>}
                                </label>
                                <input
                                    id="ae-repath-folder-name"
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

                <div className="dl-modal__foot" style={{ justifyContent: 'space-between' }}>
                    <button className="dl-btn dl-btn--secondary" onClick={onCancel}>Cancel</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {multiSkin && currentIndex > 0 && (
                            <button className="dl-btn dl-btn--secondary" onClick={handlePrevious}>Previous</button>
                        )}
                        <button className="dl-btn dl-btn--primary" onClick={handleNextOrStart} disabled={!isPrefixValid}>
                            {isLast || applyToAll ? 'Start Repath' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
