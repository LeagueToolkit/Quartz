import './StatusBar.css';

interface StatusBarProps {
    status?: string;
    errorCount?: number;
    fileType?: string;
    zoomLevel?: number;
    lineCount?: number;
    caretLine?: number;
    caretColumn?: number;
    ramUsage?: string;
}

export default function StatusBar({
    status = 'Ready',
    errorCount = 0,
    fileType = '',
    zoomLevel = 100,
    lineCount = 0,
    caretLine = 1,
    caretColumn = 1,
    ramUsage = '',
}: StatusBarProps) {
    // Truncate long error messages to prevent overflow
    const displayStatus = status.length > 100 ? status.substring(0, 97) + '...' : status;
    const isError = status.toLowerCase().includes('error');

    return (
        <div className="status-bar">
            <div
                className={`status-item status-text ${isError ? 'error-status' : ''}`}
                title={status.length > 100 ? status : undefined}
            >
                {displayStatus}
            </div>
            <div className="status-separator" />

            {errorCount > 0 && (
                <>
                    <div className="status-item error-count">{errorCount} errors</div>
                    <div className="status-separator" />
                </>
            )}

            {fileType && (
                <>
                    <div className="status-item">{fileType}</div>
                    <div className="status-separator" />
                </>
            )}

            <div className="status-item" title="Zoom Level (Ctrl+Scroll to change)">
                {zoomLevel}%
            </div>
            <div className="status-separator" />

            <div className="status-item">{lineCount} lines</div>
            <div className="status-separator" />

            <div className="status-item">
                Ln {caretLine}, Col {caretColumn}
            </div>

            {ramUsage && (
                <>
                    <div className="status-separator" />
                    <div className="status-item" title="Application RAM Usage">
                        {ramUsage}
                    </div>
                </>
            )}
        </div>
    );
}
