import React, { useState } from 'react';

/* Restored from the old FrogChanger CustomPrefixModal — the "Repath Mode" step.
   Steps through each selected skin so the user can set a per-skin prefix, then
   Start Repath runs the extract -> combine -> repath -> (split) -> consolidate
   pipeline. Options mirror the old modal; output path override + recent paths
   included. Styled to match ExtractionModeModal. */

export interface RepathSkin {
    championName: string;
    skinId: number;
    skinName: string;
    chromaId: number | null;
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
const skinKeyOf = (s: RepathSkin) => `${s.championName}_${s.skinId}`;

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
    const [infoOpen, setInfoOpen] = useState(false);

    // Reset when (re)opened.
    React.useEffect(() => {
        if (open) {
            setCurrentIndex(0);
            setPrefixesBySkinId({});
            setPrefixInput('');
            setApplyToAll(false);
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
        outputOverride: { enabled: outputOverrideEnabled, keepForAll: outputKeepForAll, path: outputPath, perSkinPaths: paths },
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

    const styles: Record<string, React.CSSProperties> = {
        overlay: { position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' },
        backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' },
        modal: { position: 'relative', width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', borderRadius: 16, boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)' },
        accentBar: { height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' },
        body: { padding: 24 },
        title: { fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', margin: 0 },
        subtitle: { fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 0 },
        section: { borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 14, marginTop: 16 },
        sectionTitle: { color: 'var(--accent2)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, marginBottom: 8 },
        infoBtn: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent2)', border: '1px solid color-mix(in srgb, var(--accent2), transparent 60%)', background: 'color-mix(in srgb, var(--accent2), transparent 90%)', cursor: 'pointer', marginLeft: 8 },
        infoSection: { marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 },
        input: { borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text)', fontFamily: 'inherit', width: '100%' },
    };
    const btnBase: React.CSSProperties = { padding: '7px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'color-mix(in srgb, var(--accent2), transparent 90%)', color: 'var(--accent2)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s ease' };
    const btnGhost: React.CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.15)' };
    const btnPrimary: React.CSSProperties = { ...btnBase, background: 'color-mix(in srgb, var(--accent), transparent 80%)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)', opacity: isPrefixValid ? 1 : 0.5, cursor: isPrefixValid ? 'pointer' : 'not-allowed' };
    const checkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' };
    const checkbox: React.CSSProperties = { width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' };

    return (
        <div style={styles.overlay}>
            <div style={styles.backdrop} onClick={onCancel} />
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.accentBar} />
                <div style={styles.body}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <h2 style={styles.title}>{multiSkin ? `Repath Skin ${currentIndex + 1} of ${total}` : 'Repath Mode'}</h2>
                            <button style={styles.infoBtn} onClick={() => setInfoOpen(!infoOpen)} title="Help Info">i</button>
                        </div>
                        <button
                            onClick={onCancel}
                            style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}
                        >
                            {'✕'}
                        </button>
                    </div>

                    {infoOpen && (
                        <div style={styles.infoSection}>
                            <div style={{ marginBottom: 6 }}>
                                <strong style={{ color: 'var(--accent2)' }}>Entry Prefix:</strong> the segment inserted into every file path (e.g. `myskin`). Pick something unique so your mod does not collide with the base game or other mods.
                            </div>
                            <div>
                                <strong style={{ color: 'var(--accent2)' }}>Skip SFX Repath:</strong> leave sound paths untouched. Keep on unless you actually changed sounds.
                            </div>
                        </div>
                    )}

                    <p style={styles.subtitle}>{current.championName} — {current.skinName}</p>

                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>Entry Prefix</h3>
                        <input
                            value={prefixInput}
                            onChange={(e) => setPrefixInput(e.target.value)}
                            placeholder="e.g. myskin_v2"
                            style={styles.input}
                            autoFocus
                        />
                        {prefixInput && sanitized !== prefixInput.trim().toLowerCase() && (
                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                                Will be used as: <strong style={{ color: 'var(--accent2)' }}>{sanitized || '(empty — required)'}</strong>
                            </div>
                        )}
                        {multiSkin && (
                            <label style={{ ...checkRow, marginTop: 10 }}>
                                <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} style={checkbox} />
                                Use this prefix for all remaining skins
                            </label>
                        )}
                    </div>

                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>Options</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <label style={checkRow}>
                                <input type="checkbox" checked={skipSfxRepath} onChange={(e) => setSkipSfxRepath(e.target.checked)} style={checkbox} />
                                Skip SFX Repath
                            </label>
                            <label style={checkRow}>
                                <input type="checkbox" checked={extractVoiceover} onChange={(e) => setExtractVoiceover(e.target.checked)} style={checkbox} />
                                Extract Voiceover
                            </label>
                            <label style={checkRow}>
                                <input type="checkbox" checked={preserveHudIcons2D} onChange={(e) => setPreserveHudIcons2D(e.target.checked)} style={checkbox} />
                                Preserve HUD ability icons
                            </label>

                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, paddingTop: 8 }}>
                                <label style={checkRow}>
                                    <input type="checkbox" checked={outputOverrideEnabled} onChange={(e) => setOutputOverrideEnabled(e.target.checked)} style={checkbox} />
                                    Override Output Path
                                </label>
                            </div>
                            {outputOverrideEnabled && multiSkin && (
                                <label style={{ ...checkRow, marginLeft: 20, color: 'rgba(255,255,255,0.8)' }}>
                                    <input type="checkbox" checked={outputKeepForAll} onChange={(e) => setOutputKeepForAll(e.target.checked)} style={checkbox} />
                                    Keep same output path for all skins
                                </label>
                            )}
                            {outputOverrideEnabled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 4 }}>
                                    <input
                                        list="ae-recent-paths-repath"
                                        value={outputPath}
                                        onChange={(e) => setOutputPath(e.target.value)}
                                        placeholder={defaultOutputPath || 'Select output path...'}
                                        style={styles.input}
                                    />
                                    <button
                                        type="button"
                                        style={{ ...btnBase, minWidth: 72 }}
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
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 20, paddingTop: 16, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <button style={btnGhost} onClick={onCancel}>Cancel</button>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {multiSkin && currentIndex > 0 && (
                                <button style={btnGhost} onClick={handlePrevious}>Previous</button>
                            )}
                            <button style={btnPrimary} onClick={handleNextOrStart} disabled={!isPrefixValid}>
                                {isLast || applyToAll ? 'Start Repath' : 'Next'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
