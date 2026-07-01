import { useState, useEffect, useRef } from 'react';

interface Props {
    open: boolean;
    count: number;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}

export default function BnkGroupNameModal({ open, count, onConfirm, onCancel }: Props) {
    const [name, setName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setName('');
            setTimeout(() => inputRef.current?.focus(), 60);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); if (name.trim()) onConfirm(name.trim()); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, name, onConfirm, onCancel]);

    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onCancel}>
            <div className="dl-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Create Group</h2>
                    <button className="dl-modal__close" onClick={onCancel} aria-label="Close">✕</button>
                </div>
                <div className="dl-modal__body">
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                        {count} file{count !== 1 ? 's' : ''} selected
                    </p>
                    <input
                        ref={inputRef}
                        className="dl-input"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Group name…"
                    />
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', margin: 0 }}>Enter to confirm · Esc to cancel</p>
                </div>
                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onCancel}>Cancel</button>
                    <button
                        className="dl-btn dl-btn--primary"
                        disabled={!name.trim()}
                        onClick={() => { if (name.trim()) onConfirm(name.trim()); }}
                    >Create</button>
                </div>
            </div>
        </div>
    );
}
