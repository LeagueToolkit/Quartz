/*
 * Floating model-viewer controls. A vertical stack of icon buttons in the
 * top-right of the viewport; each opens a popover to its left. Replaces the old
 * bloaty model-inspect sidebar. One popover open at a time; Esc / click-away
 * closes. Groups that have nothing to show (no chroma, not animatable) hide
 * their button.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Info, Image as ImageIcon, SlidersHorizontal, Play, Pause, RotateCcw, FolderOpen, ImagePlus,
} from 'lucide-react';
import type { ModelPreviewData } from '@/lib/api/modelInspect';
import type { ModelInspectChromaOption } from '@/lib/model/modelInspectEvent';
import { Dropdown } from '@/components/ui/Dropdown';
import './model-inspect.css';

function formatCount(value: number): string {
    return new Intl.NumberFormat().format(value);
}

type PanelId = 'anim' | 'render' | 'materials' | 'info';

export interface ModelControlsProps {
    model: ModelPreviewData | null;
    // Render
    wireframe: boolean; setWireframe: (v: boolean) => void;
    showGrid: boolean; setShowGrid: (v: boolean) => void;
    showSkybox: boolean; setShowSkybox: (v: boolean) => void;
    autoRotate: boolean; setAutoRotate: (v: boolean) => void;
    showTexture: boolean; setShowTexture: (v: boolean) => void;
    hasTextures: boolean;
    // Materials / submeshes
    hiddenGroups: Set<string>;
    toggleGroup: (name: string) => void;
    allGroupsVisible: boolean;
    toggleAllGroups: () => void;
    /** Open a file picker to replace a submesh's texture (`*` = base). */
    onPickTexture: (group: string) => void;
    /** Manually re-decode + re-apply all textures from disk. */
    onReloadTextures: () => void;
    // Chroma
    chromaOptions: ModelInspectChromaOption[];
    selectedChromaId: number | null;
    switchingChroma: boolean;
    onSelectChroma: (id: number | null) => void;
    // Animation
    animatable: boolean;
    anms: string[];
    animName: (p: string) => string;
    selectedAnm: string; setSelectedAnm: (p: string) => void;
    animError: string | null;
    hasClip: boolean;
    playing: boolean; setPlaying: (v: boolean) => void;
    resetAnim: () => void;
    currentTime: number; durationSeconds: number; scrubTo: (s: number) => void;
    playRate: number; setPlayRate: (r: number) => void;
    showSkeleton: boolean; setShowSkeleton: (v: boolean) => void;
    // Info
    onReveal: () => void;
}

function Toggle({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
    return (
        <button type="button" className="model-inspect__option" aria-pressed={active} disabled={disabled} onClick={onClick}>
            <span>{label}</span>
            <span className={`model-inspect__switch ${active ? 'is-on' : ''}`} aria-hidden="true"><i /></span>
        </button>
    );
}

export function ModelControls(props: ModelControlsProps) {
    const [open, setOpen] = useState<PanelId | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onDown);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
    }, [open]);

    const { model } = props;
    const buttons: { id: PanelId; icon: ReactNode; title: string; show: boolean }[] = [
        { id: 'anim', icon: <Play size={16} />, title: 'Animation', show: props.animatable },
        { id: 'render', icon: <SlidersHorizontal size={16} />, title: 'Render', show: true },
        { id: 'materials', icon: <ImageIcon size={16} />, title: 'Materials', show: true },
        { id: 'info', icon: <Info size={16} />, title: 'Info', show: true },
    ];

    const toggle = (id: PanelId) => setOpen((cur) => (cur === id ? null : id));

    return (
        <div className="model-controls" ref={rootRef}>
            <div className="model-controls__bar">
                {buttons.filter((b) => b.show).map((b) => (
                    <button
                        key={b.id}
                        type="button"
                        className={`model-controls__btn ${open === b.id ? 'is-active' : ''}`}
                        title={b.title}
                        aria-pressed={open === b.id}
                        onClick={() => toggle(b.id)}
                    >
                        {b.icon}
                    </button>
                ))}
            </div>

            {open && (
                <div className="model-controls__panel" role="dialog">
                    {open === 'anim' && props.animatable && (
                        <>
                            <h4>Animation</h4>
                            <Dropdown
                                width="100%"
                                searchable
                                searchPlaceholder="Search animations…"
                                value={props.selectedAnm}
                                onChange={props.setSelectedAnm}
                                options={[
                                    { value: '', label: 'None (bind pose)' },
                                    ...props.anms.map((p) => ({ value: p, label: props.animName(p), text: props.animName(p) })),
                                ]}
                            />
                            {props.anms.length === 0 && <span className="model-inspect__muted">No animations found</span>}
                            {props.animError && <span className="model-inspect__muted">{props.animError}</span>}
                            {props.hasClip && (
                                <>
                                    <div className="model-inspect__anim-controls">
                                        <button type="button" className="model-inspect__anim-btn" title={props.playing ? 'Pause' : 'Play'} onClick={() => props.setPlaying(!props.playing)}>
                                            {props.playing ? <Pause size={14} /> : <Play size={14} />}
                                        </button>
                                        <button type="button" className="model-inspect__anim-btn" title="Reset" onClick={props.resetAnim}>
                                            <RotateCcw size={14} />
                                        </button>
                                        <input type="range" className="model-inspect__anim-scrub" min={0} max={props.durationSeconds} step={0.001} value={props.currentTime} onChange={(e) => props.scrubTo(Number(e.target.value))} />
                                        <span className="model-inspect__anim-time">{props.currentTime.toFixed(2)}s / {props.durationSeconds.toFixed(2)}s</span>
                                    </div>
                                    <div className="model-inspect__anim-rate">
                                        <span>Rate {props.playRate.toFixed(2)}x</span>
                                        <input type="range" min={0.25} max={2} step={0.25} value={props.playRate} onChange={(e) => props.setPlayRate(Number(e.target.value))} />
                                    </div>
                                </>
                            )}
                            <Toggle label="Show Skeleton" active={props.showSkeleton} onClick={() => props.setShowSkeleton(!props.showSkeleton)} />
                        </>
                    )}

                    {open === 'render' && (
                        <>
                            <h4>Render</h4>
                            <Toggle label="Show Textures" active={props.showTexture && props.hasTextures} disabled={!props.hasTextures} onClick={() => props.setShowTexture(!props.showTexture)} />
                            <Toggle label="Wireframe" active={props.wireframe} onClick={() => props.setWireframe(!props.wireframe)} />
                            <Toggle label="Ground" active={props.showGrid} onClick={() => props.setShowGrid(!props.showGrid)} />
                            <Toggle label="Skybox" active={props.showSkybox} onClick={() => props.setShowSkybox(!props.showSkybox)} />
                            <Toggle label="Auto Rotate" active={props.autoRotate} onClick={() => props.setAutoRotate(!props.autoRotate)} />
                        </>
                    )}

                    {open === 'materials' && (
                        <>
                            <div className="model-controls__panel-head">
                                <h4>Materials ({model?.groups.length ?? 0})</h4>
                                <button type="button" disabled={!model?.groups.length} onClick={props.toggleAllGroups}>
                                    {props.allGroupsVisible ? 'Hide All' : 'Show All'}
                                </button>
                            </div>
                            <div className="model-inspect__groups">
                                {model?.groups.map((group, index) => {
                                    const hidden = props.hiddenGroups.has(group.name);
                                    return (
                                        <div key={`${group.name}-${index}`} className="model-inspect__group-row">
                                            <button type="button" className={`model-inspect__group-toggle ${hidden ? 'is-hidden' : ''}`} onClick={() => props.toggleGroup(group.name)}>
                                                <span className={`model-inspect__checkbox ${hidden ? '' : 'is-checked'}`} aria-hidden="true"><i /></span>
                                                <span className="model-inspect__group-name" title={group.name}>{group.name}</span>
                                                <small>{formatCount(Math.floor(group.indexCount / 3))}</small>
                                            </button>
                                            <button type="button" className="model-inspect__group-pick" title={`Open ${group.name} texture location (or pick one)`} aria-label={`Open ${group.name} texture location`} onClick={() => props.onPickTexture(group.name)}>
                                                <ImagePlus size={13} />
                                            </button>
                                        </div>
                                    );
                                })}
                                {model && model.groups.length === 0 && <span className="model-inspect__muted">No named submeshes</span>}
                            </div>
                            {props.chromaOptions.length > 0 && (
                                <>
                                    <h4 style={{ marginTop: 10 }}>Chroma</h4>
                                    <Dropdown
                                        width="100%"
                                        disabled={props.switchingChroma}
                                        value={props.selectedChromaId != null ? String(props.selectedChromaId) : ''}
                                        onChange={(v) => props.onSelectChroma(v === '' ? null : Number(v))}
                                        options={[
                                            { value: '', label: 'Base' },
                                            ...props.chromaOptions.map((c) => ({ value: String(c.id), label: c.name || `Chroma ${c.id}` })),
                                        ]}
                                    />
                                    {props.switchingChroma && <span className="model-inspect__muted">Loading chroma textures…</span>}
                                </>
                            )}
                            <button type="button" className="dl-btn dl-btn--secondary dl-btn--sm" style={{ marginTop: 4 }} title="Re-read every texture from disk" onClick={props.onReloadTextures}>
                                <span className="dl-icon"><RotateCcw size={13} /></span> Reload Textures
                            </button>
                        </>
                    )}

                    {open === 'info' && (
                        <>
                            <h4>Info</h4>
                            <dl className="model-inspect__stats">
                                <div><dt>Vertices</dt><dd>{model ? formatCount(model.vertexCount) : '—'}</dd></div>
                                <div><dt>Triangles</dt><dd>{model ? formatCount(model.triangleCount) : '—'}</dd></div>
                                <div><dt>Submeshes</dt><dd>{model ? formatCount(model.groups.length) : '—'}</dd></div>
                            </dl>
                            <button type="button" className="dl-btn dl-btn--secondary dl-btn--sm" onClick={props.onReveal}>
                                <span className="dl-icon"><FolderOpen size={14} /></span> Reveal in Explorer
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
