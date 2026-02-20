/**
 * Flint - Toast Notifications Component
 */

import React from 'react';
import { useAppState } from '../lib/state';
import { getToastIcon } from '../lib/fileIcons';

const ToastIcon: React.FC<{ type: string }> = ({ type }) => {
    const iconHtml = getToastIcon(type as 'info' | 'success' | 'warning' | 'error');
    return <span dangerouslySetInnerHTML={{ __html: iconHtml }} />;
};

export const ToastContainer: React.FC = () => {
    const { state, dismissToast } = useAppState();

    if (state.toasts.length === 0) {
        return null;
    }

    return (
        <div className="toast-container">
            {state.toasts.map(toast => (
                <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <div className="toast-icon">
                        <ToastIcon type={toast.type} />
                    </div>
                    <div className="toast-content">
                        <div className="toast-message">{toast.message}</div>
                        {toast.suggestion && (
                            <div className="toast-suggestion">{toast.suggestion}</div>
                        )}
                    </div>
                    <button
                        className="toast-dismiss"
                        onClick={() => dismissToast(toast.id)}
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};
