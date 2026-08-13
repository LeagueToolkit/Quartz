import { ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

export const RUBY_DOWNLOAD_URL = 'https://github.com/RitoShark/RubyVFX/releases/latest';

interface Props {
    open: boolean;
    onClose: () => void;
}

/* Shown when the Ruby hand-off finds no installation: explains what RubyRe is and
   links its releases, rather than surfacing a raw launch failure. */
export function RubyMissingModal({ open, onClose }: Props) {
    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div style={{
                    height: 3, flexShrink: 0,
                    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                }} />

                <div className="dl-modal__head">
                    <img src="/ruby.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    <h2 className="dl-modal__title">RubyRe is not installed</h2>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="dl-modal__body">
                    <p style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                        RubyRe is a live VFX previewer for League bins: it renders a skin's
                        particle systems in real time, so you can see an edit as you make it.
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, fontSize: '0.82rem' }}>
                        Quartz looks for it in the Windows Start menu. Install it, or set a
                        portable path in Settings &gt; External Tools, and this button starts working.
                    </p>
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--primary" onClick={() => void openUrl(RUBY_DOWNLOAD_URL)}>
                        <span className="dl-icon"><ExternalLink size={16} /></span>
                        <span>Download RubyRe</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
