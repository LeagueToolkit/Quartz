import React from 'react';
import { createPortal } from 'react-dom';
import { X as CloseIcon } from 'lucide-react';

/* Search Help modal — rebuilt on the Design Lab modal chrome. */
export function SearchHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;

    const accent: React.CSSProperties = { color: 'var(--accent-primary)' };
    const li: React.CSSProperties = { margin: '2px 0' };

    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dl-modal">
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">Search Help</h3>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">
                        <span className="dl-icon"><CloseIcon size={16} /></span>
                    </button>
                </div>
                <div className="dl-modal__body" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <div>
                        <h4 style={{ fontWeight: 600, color: 'var(--accent-primary)', margin: '0 0 8px' }}>Search by Skinline</h4>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            <li style={li}>Coven, finds all Coven skins</li>
                            <li style={li}>Star Guardian, finds all Star Guardian skins</li>
                            <li style={li}>K/DA, finds all K/DA skins</li>
                            <li style={li}>Spirit Blossom, finds all Spirit Blossom skins</li>
                            <li style={li}>Project, finds all Project skins</li>
                        </ul>
                    </div>
                    <div>
                        <h4 style={{ fontWeight: 600, color: 'var(--accent-primary)', margin: '0 0 8px' }}>Search by Rarity</h4>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            <li style={li}>Epic, finds all Epic tier skins</li>
                            <li style={li}>Legendary, finds all Legendary tier skins</li>
                            <li style={li}>Mythic, finds all Mythic tier skins</li>
                            <li style={li}>Ultimate, finds all Ultimate tier skins</li>
                            <li style={li}>Base, finds all base tier skins</li>
                        </ul>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, borderLeft: '3px solid var(--accent-primary)' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                            <strong style={accent}>Tip:</strong> You can search for skinlines or rarities in the same search bar.
                            The search finds skins that match either the skinline name or the rarity tier.
                        </p>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
