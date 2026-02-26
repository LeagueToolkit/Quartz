import './UpdateToast.css';

interface UpdateToastProps {
    version: string;
    onOpenSettings: () => void;
    onDismiss: () => void;
}

export default function UpdateToast({ version, onOpenSettings, onDismiss }: UpdateToastProps) {
    const handleOpenSettings = () => {
        onDismiss();
        onOpenSettings();
    };

    return (
        <div className="update-toast">
            <div className="update-toast-icon">🚀</div>
            <div className="update-toast-body">
                <div className="update-toast-title">Update available — v{version}</div>
                <div className="update-toast-sub">Open Settings → Updates to download</div>
            </div>
            <div className="update-toast-actions">
                <button className="update-toast-btn-settings" onClick={handleOpenSettings}>
                    Open Settings
                </button>
                <button className="update-toast-btn-dismiss" onClick={onDismiss} title="Dismiss">
                    ✕
                </button>
            </div>
        </div>
    );
}
