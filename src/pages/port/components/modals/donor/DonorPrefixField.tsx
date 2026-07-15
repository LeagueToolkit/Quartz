import { type ReactNode, useState } from 'react';
import { Info as InfoIcon } from 'lucide-react';

interface DonorPrefixFieldProps {
    value: string;
    sanitized: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    action?: ReactNode;
}

export default function DonorPrefixField({ value, sanitized, onChange, disabled, action }: DonorPrefixFieldProps) {
    const [showInfo, setShowInfo] = useState(false);
    const ok = sanitized.length > 0;

    return (
        <div className="donor-prefix">
            <span className="donor-prefix__label">
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
                className={`dl-input ${ok ? '' : 'dl-input--error'}`}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="e.g. mymod, sera_kda"
                disabled={disabled}
                spellCheck={false}
            />
            <span className={`donor-prefix__hint ${ok ? '' : 'donor-prefix__hint--missing'}`}>
                {ok ? `assets/${sanitized}/…` : 'required'}
            </span>

            {action}

            {showInfo && (
                <div className="donor-prefix__info">
                    The porting prefix folds every VFX asset the donor references into a single
                    predictable folder (<code>assets/&lt;prefix&gt;/…</code>). This keeps emitters you
                    port into your target bin from colliding with the target's own asset paths.
                    Lowercase letters, digits, and underscores only.
                </div>
            )}
        </div>
    );
}
