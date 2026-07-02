import { useState } from 'react';
import { Info as InfoIcon } from 'lucide-react';

interface DonorPrefixFieldProps {
    value: string;
    sanitized: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}

export default function DonorPrefixField({ value, sanitized, onChange, disabled }: DonorPrefixFieldProps) {
    const [showInfo, setShowInfo] = useState(false);
    const ok = sanitized.length > 0;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.72rem', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                Porting prefix
                <button
                    type="button"
                    onClick={() => setShowInfo((v) => !v)}
                    className="dl-btn dl-btn--icon dl-btn--ghost dl-btn--sm"
                    title="Why a prefix is required"
                    aria-pressed={showInfo}
                >
                    <span className="dl-icon"><InfoIcon size={14} /></span>
                </button>
            </span>
            <input
                className="dl-input"
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="e.g. mymod, sera_kda"
                disabled={disabled}
                spellCheck={false}
                style={{ flex: 1, borderColor: ok ? undefined : 'color-mix(in oklab, var(--color-warning, #ff7766) 55%, transparent)' }}
            />
            <span style={{ fontSize: '0.66rem', color: ok ? 'var(--text-muted)' : 'var(--color-warning, #ff7766)', minWidth: 150, textAlign: 'right' }}>
                {ok ? `assets/${sanitized}/…` : 'required'}
            </span>

            {showInfo && (
                <div style={{ position: 'absolute', top: '100%', left: 16, right: 16, zIndex: 10, marginTop: 6, padding: 12, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.5, boxShadow: '0 12px 32px -12px rgba(0,0,0,0.6)' }}>
                    The porting prefix folds every VFX asset the donor references into a single
                    predictable folder (<code>assets/&lt;prefix&gt;/…</code>). This keeps emitters you
                    port into your target bin from colliding with the target's own asset paths.
                    Lowercase letters, digits, and underscores only.
                </div>
            )}
        </div>
    );
}
