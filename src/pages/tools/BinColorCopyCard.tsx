import { useState } from 'react';
import { Palette, FolderOpen, Play, X } from 'lucide-react';
import { pickPath } from '@/components/explorer';
import { Button } from '@/components/settings/primitives';
import { Checkbox } from '@/components/ui/Checkbox';
import { toolsBinCopyColors } from '@/lib/api/vfxTools';
import { log } from '@/lib/util/logger';
import './tools-cards.css';

interface NotifyArg { message: string; severity: 'info' | 'success' | 'error' | 'warning' }

const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
const dirname = (p: string) => {
    const norm = p.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(0, idx) : '';
};

async function pickBinFile(title: string): Promise<string | null> {
    const r = await pickPath({ mode: 'file', title, filters: [{ name: 'BIN Files', extensions: ['bin'] }], recentsKey: 'bin' });
    return typeof r === 'string' ? r : null;
}

async function pickSaveBinFile(defaultPath: string): Promise<string | null> {
    const r = await pickPath({ mode: 'save', title: 'Save modified BIN as', defaultPath, filters: [{ name: 'BIN Files', extensions: ['bin'] }], recentsKey: 'bin' });
    return typeof r === 'string' ? r : null;
}

function PathPicker({ label, value, onChange, onPick }: {
    label: string; value: string; onChange: (v: string) => void; onPick: () => void;
}) {
    return (
        <div className="tc-picker">
            <input className="dl-input" placeholder={`${label} .bin path…`} value={value} onChange={(e) => onChange(e.target.value)} />
            <button className="tc-iconbtn" title={`Browse for ${label.toLowerCase()} bin`} onClick={onPick}><FolderOpen size={16} /></button>
            {value && <button className="tc-iconbtn tc-iconbtn--danger" title="Clear" onClick={() => onChange('')}><X size={16} /></button>}
        </div>
    );
}

interface CopyResult { fieldsCopied: number; entriesMatched: number; entriesSkipped: number }

export function BinColorCopyCard({ onNotify }: { onNotify?: (a: NotifyArg) => void }) {
    const [sourcePath, setSourcePath] = useState('');
    const [targetPath, setTargetPath] = useState('');
    const [overwriteTarget, setOverwriteTarget] = useState(true);
    const [createBackup, setCreateBackup] = useState(true);
    const [busy, setBusy] = useState(false);
    const [lastResult, setLastResult] = useState<CopyResult | null>(null);

    const notify = (message: string, severity: NotifyArg['severity'] = 'info') => onNotify?.({ message, severity });

    const handleRun = async () => {
        if (!sourcePath || !targetPath) { notify('Select both source and target bins first', 'warning'); return; }
        let outputPath: string | null = null;
        if (!overwriteTarget) {
            const base = basename(targetPath).replace(/\.bin$/i, '');
            outputPath = await pickSaveBinFile(`${dirname(targetPath)}/${base}_colored.bin`);
            if (!outputPath) return;
        }
        setBusy(true);
        setLastResult(null);
        try {
            const res = await toolsBinCopyColors(sourcePath, targetPath, outputPath, createBackup);
            notify(
                `Copied ${res.fieldsCopied} color field(s) — ${res.entriesMatched} entr(ies) matched, ${res.entriesSkipped} skipped → ${basename(res.outputPath)}`,
                res.fieldsCopied > 0 ? 'success' : 'info',
            );
            setLastResult({ fieldsCopied: res.fieldsCopied, entriesMatched: res.entriesMatched, entriesSkipped: res.entriesSkipped });
        } catch (e) {
            log.error('bin:copyColors', e);
            notify(`Copy crashed: ${String((e as Error)?.message || e)}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="tc-card">
            <div className="tc-card__head">
                <div className="tc-card__icon"><Palette size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="tc-card__title">Copy BIN Colors</h3>
                    <p className="tc-card__desc">Copy VFX colors (RGBA + named VEC4 fields) from a source bin into a structurally identical target bin. Inspired by ltmao&apos;s hapibin.</p>
                </div>
            </div>

            <div className="tc-card__body">
                <div className="tc-fields">
                    <div>
                        <label className="tc-field__label">Source (donor colors)</label>
                        <PathPicker label="Source" value={sourcePath} onChange={setSourcePath} onPick={async () => { const p = await pickBinFile('Select source bin (donor)'); if (p) setSourcePath(p); }} />
                    </div>
                    <div>
                        <label className="tc-field__label">Target (gets recolored)</label>
                        <PathPicker label="Target" value={targetPath} onChange={setTargetPath} onPick={async () => { const p = await pickBinFile('Select target bin (will be recolored)'); if (p) setTargetPath(p); }} />
                    </div>
                </div>

                <div className="tc-foot">
                    <div className="tc-foot__opts">
                        <Checkbox label="Overwrite target in place" checked={overwriteTarget} onChange={setOverwriteTarget} />
                        <Checkbox label="Create .bak backup" checked={createBackup} disabled={!overwriteTarget} onChange={setCreateBackup} />
                    </div>
                    <div className="tc-foot__spacer" />
                    {lastResult && (
                        <span className="tc-foot__result">
                            {lastResult.fieldsCopied} field(s) · {lastResult.entriesMatched} matched · {lastResult.entriesSkipped} skipped
                        </span>
                    )}
                    <div className="tc-foot__run">
                        <Button icon={<Play size={16} />} variant="primary" disabled={busy || !sourcePath || !targetPath} onClick={handleRun}>
                            {busy ? 'Copying…' : 'Copy Colors'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BinColorCopyCard;
