import { useCallback, useEffect, useState } from 'react';
import {
    Box, Eye, EyeOff, Grid3X3, Image, Info, RotateCw, ScanLine, X,
} from 'lucide-react';
import { explorerReveal } from '@/lib/api/explorer';
import type { ModelPreviewData } from '@/lib/api/modelInspect';
import { ModelViewport } from './ModelViewport';

function formatCount(value: number): string {
    return new Intl.NumberFormat().format(value);
}

function Toggle({ active, title, onClick, disabled = false, children }: {
    active: boolean;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={`model-inspect__tool ${active ? 'is-active' : ''}`}
            title={title}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export function ModelInspectModal({ path, initialTexturePath, onClose }: {
    path: string;
    initialTexturePath?: string | null;
    onClose: () => void;
}) {
    const [model, setModel] = useState<ModelPreviewData | null>(null);
    const [texturePath, setTexturePath] = useState<string | null>(initialTexturePath ?? null);
    const [showTexture, setShowTexture] = useState(true);
    const [wireframe, setWireframe] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [autoRotate, setAutoRotate] = useState(false);
    const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const handleLoaded = useCallback((loaded: ModelPreviewData) => {
        setModel((current) => current === loaded ? current : loaded);
        setTexturePath((current) => current ?? loaded.suggestedTexture);
    }, []);

    const toggleGroup = (name: string) => {
        setHiddenGroups((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const fileName = path.split(/[/\\]/).pop() || path;
    return (
        <div className="model-inspect-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section className="model-inspect" role="dialog" aria-modal="true" aria-label={`Inspect ${fileName}`}>
                <header className="model-inspect__head">
                    <div className="model-inspect__heading">
                        <span className="model-inspect__mark"><Box size={18} /></span>
                        <div>
                            <h2>{fileName}</h2>
                            <span>{model ? `${model.kind === 'skinned' ? 'SKN' : 'SCB/SCO'} · version ${model.version}` : 'Model inspector'}</span>
                        </div>
                    </div>
                    <div className="model-inspect__tools">
                        <Toggle
                            active={showTexture && !!texturePath}
                            title={!texturePath ? 'No companion texture found' : showTexture ? 'Hide texture' : 'Show texture'}
                            disabled={!texturePath}
                            onClick={() => setShowTexture((v) => !v)}
                        >
                            {showTexture && texturePath ? <Eye size={16} /> : <EyeOff size={16} />}
                        </Toggle>
                        <Toggle active={wireframe} title="Toggle wireframe" onClick={() => setWireframe((v) => !v)}>
                            <ScanLine size={16} />
                        </Toggle>
                        <Toggle active={showGrid} title="Toggle grid" onClick={() => setShowGrid((v) => !v)}>
                            <Grid3X3 size={16} />
                        </Toggle>
                        <Toggle active={autoRotate} title="Toggle auto rotate" onClick={() => setAutoRotate((v) => !v)}>
                            <RotateCw size={16} />
                        </Toggle>
                        <button type="button" className="model-inspect__tool" title="Close" onClick={onClose}><X size={17} /></button>
                    </div>
                </header>

                <div className="model-inspect__body">
                    <div className="model-inspect__stage">
                        <ModelViewport
                            path={path}
                            texturePath={showTexture ? texturePath : null}
                            autoRotate={autoRotate}
                            wireframe={wireframe}
                            showGrid={showGrid}
                            hiddenGroups={hiddenGroups}
                            onLoaded={handleLoaded}
                        />
                        <div className="model-inspect__hint">Drag to orbit · wheel to zoom · right-drag to pan</div>
                    </div>

                    <aside className="model-inspect__side">
                        <div className="model-inspect__section">
                            <h3><Info size={14} /> Geometry</h3>
                            <dl className="model-inspect__stats">
                                <div><dt>Vertices</dt><dd>{model ? formatCount(model.vertexCount) : '—'}</dd></div>
                                <div><dt>Triangles</dt><dd>{model ? formatCount(model.triangleCount) : '—'}</dd></div>
                                <div><dt>Submeshes</dt><dd>{model ? formatCount(model.groups.length) : '—'}</dd></div>
                            </dl>
                        </div>

                        <div className="model-inspect__section model-inspect__section--grow">
                            <h3><Box size={14} /> Submeshes</h3>
                            <div className="model-inspect__groups">
                                {model?.groups.map((group, index) => {
                                    const hidden = hiddenGroups.has(group.name);
                                    return (
                                        <button key={`${group.name}-${index}`} type="button" className={hidden ? 'is-hidden' : ''} onClick={() => toggleGroup(group.name)}>
                                            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                            <span title={group.name}>{group.name}</span>
                                            <small>{formatCount(Math.floor(group.indexCount / 3))}</small>
                                        </button>
                                    );
                                })}
                                {model && model.groups.length === 0 && <span className="model-inspect__muted">No named submeshes</span>}
                            </div>
                        </div>

                        <div className="model-inspect__section">
                            <h3><Image size={14} /> Texture</h3>
                            <p className="model-inspect__path" title={texturePath ?? ''}>
                                {texturePath ? texturePath.split(/[/\\]/).pop() : 'No same-name texture found'}
                            </p>
                            <button
                                type="button"
                                className="model-inspect__option"
                                disabled={!texturePath}
                                aria-pressed={showTexture && !!texturePath}
                                onClick={() => setShowTexture((visible) => !visible)}
                            >
                                <span>{showTexture && texturePath ? <Eye size={14} /> : <EyeOff size={14} />} Show Texture</span>
                                <span className={`model-inspect__switch ${showTexture && texturePath ? 'is-on' : ''}`} aria-hidden="true"><i /></span>
                            </button>
                        </div>
                        <button type="button" className="dl-btn dl-btn--secondary" onClick={() => void explorerReveal(path)}>Reveal in Explorer</button>
                    </aside>
                </div>
            </section>
        </div>
    );
}
