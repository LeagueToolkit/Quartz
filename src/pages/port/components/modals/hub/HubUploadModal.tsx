import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Check, Image as ImageIcon } from 'lucide-react';
import { uploadHubSystem } from './hubApi';
import { textToBinBytes } from '@/lib/api';
import { useUiPrefsStore } from '@/lib/stores';
import './hub.css';

export interface UploadableSystem { key: string; name: string; fullContent: string }

// Wrap a single-system ritobin fragment into a valid document so it compiles.
const PY_HEADER = '#PROP_text\nversion: u32 = 3\nlinked: list[string] = {\n}\nentries: map[hash,embed] = {\n';
const PY_FOOTER = '\n}\n';

function bytesToBase64(bytes: number[]): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] & 0xff);
    return btoa(bin);
}

/* Upload one or more of the loaded Port TARGET's VFX systems to the hub. Needs a
   GitHub token (Settings -> GitHub Integration); otherwise shows a hint. */
export function HubUploadModal({ open, onClose, targetSystems, setStatus }: {
    open: boolean;
    onClose: () => void;
    targetSystems: UploadableSystem[];
    setStatus: (msg: string) => void;
}) {
    const token = useUiPrefsStore((s) => s.githubToken);
    const hasToken = Boolean(token && token.trim());

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [preview, setPreview] = useState<{ base64: string; ext: string } | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const picked = useMemo(() => targetSystems.filter((s) => selected.has(s.key)), [targetSystems, selected]);

    if (!open) return null;

    const toggle = (key: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const readPreviewFile = (file: File) => {
        if (!String(file.type || '').startsWith('image/')) return;
        const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : null;
            if (base64) setPreview({ base64, ext });
        };
        reader.readAsDataURL(file);
    };

    const submit = async () => {
        if (!picked.length) return;
        setBusy(true);
        try {
            for (let i = 0; i < picked.length; i++) {
                const sys = picked[i];
                // Name from the field only when uploading a single system.
                const effectName = (picked.length === 1 && name.trim()) ? name.trim() : sys.name;
                setStatus(`Compiling ${effectName}...`);
                const emitters = (sys.fullContent.match(/VfxEmitterDefinitionData\s*\{/g) || []).length;
                const bytes = await textToBinBytes(PY_HEADER + sys.fullContent + PY_FOOTER);
                setStatus(`Uploading ${effectName}...`);
                await uploadHubSystem({
                    name: effectName,
                    category: category.trim() || 'general',
                    description: description.trim(),
                    binBase64: bytesToBase64(bytes),
                    emitters,
                    previewBase64: i === 0 ? preview?.base64 ?? null : null,
                    previewExt: preview?.ext,
                });
            }
            setStatus(`Uploaded ${picked.length} system(s) to hub`);
            onClose();
        } catch (e) {
            setStatus(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    return createPortal(
        <div className="dl-modal-backdrop" style={{ zIndex: 10001 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dl-modal hub-modal" style={{ width: 560, height: 'auto', maxHeight: '88vh' }}>
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">Upload to VFX Hub</h3>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close"><X size={16} /></button>
                </div>

                {!hasToken ? (
                    <div className="hub-upload__notconnected">
                        A GitHub token is required to upload.
                        <br />Set one in Settings / GitHub Integration.
                    </div>
                ) : (
                    <div className="hub-upload-body">
                        <div className="hub-upload__field">
                            <span className="hub-upload__label">Systems from target ({picked.length} selected)</span>
                            {targetSystems.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: 12.5, padding: '8px 2px' }}>Load a target bin first.</div>
                            ) : (
                                <div className="hub-upload__systems">
                                    {targetSystems.map((s) => (
                                        <label key={s.key} className="hub-upload__sysrow" onClick={(e) => { e.preventDefault(); toggle(s.key); }}>
                                            <span style={{ width: 16, height: 16, display: 'grid', placeItems: 'center', border: '1px solid var(--border)', borderRadius: 4, background: selected.has(s.key) ? 'var(--accent-primary)' : 'transparent', color: '#fff' }}>
                                                {selected.has(s.key) && <Check size={11} />}
                                            </span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="hub-upload__field">
                            <span className="hub-upload__label">Name</span>
                            <input className="dl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={picked[0]?.name || 'Effect name'} />
                        </div>
                        <div className="hub-upload__field">
                            <span className="hub-upload__label">Description</span>
                            <textarea className="dl-textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
                        </div>
                        <div className="hub-upload__field">
                            <span className="hub-upload__label">Category</span>
                            <input className="dl-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. auras, missiles, explosions" />
                        </div>

                        <div className="hub-upload__field">
                            <span className="hub-upload__label">Preview image (optional)</span>
                            <div
                                className={`hub-upload__preview ${dragOver ? 'is-drag' : ''}`}
                                onClick={() => fileRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) readPreviewFile(f); }}
                            >
                                {preview
                                    ? <img src={`data:image/${preview.ext};base64,${preview.base64}`} alt="Preview" />
                                    : <span><ImageIcon size={22} style={{ opacity: 0.5, display: 'block', margin: '0 auto 6px' }} />Drop or click to add a preview</span>}
                                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readPreviewFile(f); }} />
                            </div>
                        </div>

                        <div className="dl-modal__foot" style={{ padding: 0, border: 'none' }}>
                            <button className="dl-btn" onClick={onClose}>Cancel</button>
                            <button className="dl-btn dl-btn--primary" disabled={picked.length === 0 || busy} onClick={() => void submit()}>
                                <Upload size={14} />{busy ? 'Uploading...' : 'Upload'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
