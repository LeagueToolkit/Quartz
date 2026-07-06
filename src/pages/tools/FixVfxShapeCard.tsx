import { useState } from 'react';
import { Wand2, FolderOpen, Play, X, File as FileIcon, Folder as FolderIcon } from 'lucide-react';
import { pickPath } from '@/components/explorer';
import { Button } from '@/components/settings/primitives';
import { Checkbox } from '@/components/ui/Checkbox';
import { toolsFixVfxShape } from '@/lib/api/vfxTools';
import { log } from '@/lib/util/logger';
import './tools-cards.css';

interface NotifyArg { message: string; severity: 'info' | 'success' | 'error' | 'warning' }

const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;

async function pickBinFile(): Promise<string | null> {
    const r = await pickPath({ mode: 'file', title: 'Select .bin to fix', filters: [{ name: 'BIN Files', extensions: ['bin'] }], recentsKey: 'bin' });
    return typeof r === 'string' ? r : null;
}
async function pickFolder(): Promise<string | null> {
    const r = await pickPath({ mode: 'directory', title: 'Select folder (recursively scans for .bin)' });
    return typeof r === 'string' ? r : null;
}

interface FixResult {
    shapesRewrittenRadius: number;
    shapesRewrittenVec3: number;
    shapesRewrittenEmpty: number;
    birthTranslationsLifted: number;
}

export function FixVfxShapeCard({ onNotify }: { onNotify?: (a: NotifyArg) => void }) {
    const [mode, setMode] = useState<'file' | 'folder'>('file');
    const [targetPath, setTargetPath] = useState('');
    const [createBackup, setCreateBackup] = useState(true);
    const [busy, setBusy] = useState(false);
    const [lastResult, setLastResult] = useState<FixResult | null>(null);

    const notify = (message: string, severity: NotifyArg['severity'] = 'info') => onNotify?.({ message, severity });

    const handleRun = async () => {
        if (!targetPath) { notify(`Select a ${mode} first`, 'warning'); return; }
        setBusy(true);
        setLastResult(null);
        try {
            const res = await toolsFixVfxShape(
                mode === 'folder' ? { folderPath: targetPath } : { filePath: targetPath },
                createBackup,
            );
            const total = res.shapesRewrittenRadius + res.shapesRewrittenVec3 + res.shapesRewrittenEmpty;
            const where = mode === 'folder'
                ? `${res.filesModified}/${res.filesProcessed} file(s) in ${basename(targetPath)}`
                : basename(targetPath);
            const failed = res.filesFailed > 0 ? ` — ${res.filesFailed} failed` : '';
            notify(
                `Fixed ${total} shape(s), lifted ${res.birthTranslationsLifted} BirthTranslation(s) across ${where}${failed}`,
                res.filesFailed > 0 ? 'warning' : total > 0 || res.birthTranslationsLifted > 0 ? 'success' : 'info',
            );
            setLastResult({
                shapesRewrittenRadius: res.shapesRewrittenRadius,
                shapesRewrittenVec3: res.shapesRewrittenVec3,
                shapesRewrittenEmpty: res.shapesRewrittenEmpty,
                birthTranslationsLifted: res.birthTranslationsLifted,
            });
        } catch (e) {
            log.error('bin:fixVfxShape', e);
            notify(`Fix crashed: ${String((e as Error)?.message || e)}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    const pick = async () => { const p = mode === 'file' ? await pickBinFile() : await pickFolder(); if (p) setTargetPath(p); };

    return (
        <div className="tc-card">
            <div className="tc-card__head">
                <div className="tc-card__icon"><Wand2 size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="tc-card__title">Fix VFX Shape</h3>
                    <p className="tc-card__desc">Rewrites legacy Shape pointers (and lifts BirthTranslation) in VfxEmitterDefinitionData. Ports ltmao&apos;s FixVfxShape script.</p>
                </div>
            </div>

            <div className="tc-card__body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="dl-tabs tc-seg">
                        <button className={`dl-tab ${mode === 'file' ? 'dl-tab--active' : ''}`} onClick={() => { setMode('file'); setTargetPath(''); }}>
                            <FileIcon size={13} style={{ marginRight: 5 }} />Single .bin
                        </button>
                        <button className={`dl-tab ${mode === 'folder' ? 'dl-tab--active' : ''}`} onClick={() => { setMode('folder'); setTargetPath(''); }}>
                            <FolderIcon size={13} style={{ marginRight: 5 }} />Folder (recursive)
                        </button>
                    </div>
                    <div className="tc-picker" style={{ flex: 1 }}>
                        <input className="dl-input" placeholder={mode === 'file' ? '.bin file path…' : 'Folder path (scans for .bin)…'} value={targetPath} onChange={(e) => setTargetPath(e.target.value)} />
                        <button className="tc-iconbtn" title={`Browse for ${mode}`} onClick={pick}><FolderOpen size={16} /></button>
                        {targetPath && <button className="tc-iconbtn tc-iconbtn--danger" title="Clear" onClick={() => setTargetPath('')}><X size={16} /></button>}
                    </div>
                </div>

                <div className="tc-foot">
                    <div className="tc-foot__opts">
                        <Checkbox label="Create .bak backup before write" checked={createBackup} onChange={setCreateBackup} />
                    </div>
                    <div className="tc-foot__spacer" />
                    {lastResult && (
                        <span className="tc-foot__result">
                            Radius:{lastResult.shapesRewrittenRadius} · Vec3:{lastResult.shapesRewrittenVec3} · Empty:{lastResult.shapesRewrittenEmpty} · BT:{lastResult.birthTranslationsLifted}
                        </span>
                    )}
                    <div className="tc-foot__run">
                        <Button icon={<Play size={16} />} variant="primary" disabled={busy || !targetPath} onClick={handleRun}>
                            {busy ? 'Fixing…' : 'Run Fix'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FixVfxShapeCard;
