import { useEffect, useState } from 'react';
import { explorerThumbnail, type FsEntry } from '@/lib/api/explorer';
import { iconFor } from './fileIcons';
import { ModelViewport } from '@/components/model-inspect/ModelViewport';
import { openModelInspect } from '@/lib/model/modelInspectEvent';
import { openBinInJade } from '@/lib/jade/jadeInterop';

const MODEL_EXTS = new Set(['scb', 'sco', 'skn']);
const THUMB_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'tex', 'dds']);
const BIN_EXTS = new Set(['bin', 'py', 'ritobin']);

const fmtSize = (bytes: number): string => {
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
};

/* Right-side preview pane. Images and game textures use decoded thumbnails;
   League model formats use the shared native-parser/Three.js viewport. */
export function PreviewPane({ entry, onInspect }: {
    entry: FsEntry | null;
    onInspect?: (entry: FsEntry) => void;
}) {
    const [thumb, setThumb] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setThumb(null);
        setLoading(false);
        if (!entry || entry.isDirectory || !THUMB_EXTS.has(entry.extension)) return;
        let alive = true;
        setLoading(true);
        explorerThumbnail(entry.path)
            .then((u) => { if (alive) setThumb(u); })
            .catch(() => { /* icon fallback */ })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [entry?.path]);

    if (!entry) {
        return <div className="dl-explorer-preview dl-explorer-preview--empty">Select a file to preview</div>;
    }

    const { Icon, color } = iconFor(entry);
    const isModel = MODEL_EXTS.has(entry.extension.replace(/^\./, '').toLowerCase());
    const isBin = BIN_EXTS.has(entry.extension.replace(/^\./, '').toLowerCase());

    return (
        <div className="dl-explorer-preview">
            <div className="dl-explorer-preview__stage">
                {isModel
                    ? <ModelViewport path={entry.path} interactive autoRotate showGrid={false} />
                    : thumb
                    ? <img src={thumb} alt={entry.name} />
                    : loading
                        ? <div className="dl-explorer-preview__spinner" />
                        : <Icon size={72} style={{ color }} />}
            </div>
            <div className="dl-explorer-preview__meta">
                <strong className="dl-explorer-preview__name">{entry.name}</strong>
                {!entry.isDirectory && (
                    <span className="dl-explorer-preview__size">{fmtSize(entry.size)}</span>
                )}
                {isModel && (
                    <button
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        onClick={() => onInspect ? onInspect(entry) : openModelInspect(entry.path)}
                    >
                        Inspect Model
                    </button>
                )}
                {isBin && (
                    <button
                        className="dl-btn dl-btn--secondary dl-btn--sm dl-explorer-preview__jade"
                        onClick={() => void openBinInJade(entry.path).catch((error) => {
                            window.alert(error instanceof Error ? error.message : String(error));
                        })}
                    >
                        <img src="/jade.webp" alt="" />
                        Open in Jade
                    </button>
                )}
            </div>
        </div>
    );
}
