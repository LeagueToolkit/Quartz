import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({ icon: Icon, title, subtitle, actions }: {
    icon: LucideIcon;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
                <div
                    className="grid h-11 w-11 place-items-center rounded-xl"
                    style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}
                >
                    <Icon size={22} />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold leading-tight text-white">{title}</h1>
                    {subtitle && <p className="text-sm text-white/45">{subtitle}</p>}
                </div>
            </div>
            {actions}
        </div>
    );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`q-glass p-5 ${className}`}>{children}</div>;
}

export function Button({ children, onClick, variant = 'ghost', disabled, className = '' }: {
    children: ReactNode;
    onClick?: () => void;
    variant?: 'accent' | 'ghost';
    disabled?: boolean;
    className?: string;
}) {
    const base = 'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none';
    const styles = variant === 'accent'
        ? 'text-black hover:brightness-110'
        : 'bg-white/5 text-white/80 hover:bg-white/10';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${base} ${styles} ${className}`}
            style={variant === 'accent' ? { background: 'var(--accent-gradient)' } : undefined}
        >
            {children}
        </button>
    );
}
