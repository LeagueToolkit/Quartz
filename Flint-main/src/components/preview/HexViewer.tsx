/**
 * Flint - Hex Viewer Component
 */

import React, { useState, useEffect } from 'react';
import * as api from '../../lib/api';
import { getIcon } from '../../lib/fileIcons';

interface HexViewerProps {
    filePath: string;
}

const MAX_BYTES = 16 * 1024; // 16KB max display

export const HexViewer: React.FC<HexViewerProps> = ({ filePath }) => {
    const [data, setData] = useState<Uint8Array | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const bytes = await api.readFileBytes(filePath);
                if (bytes.length > MAX_BYTES) {
                    setData(bytes.slice(0, MAX_BYTES));
                    setIsTruncated(true);
                } else {
                    setData(bytes);
                    setIsTruncated(false);
                }
            } catch (err) {
                console.error('[HexViewer] Error:', err);
                setError((err as Error).message || 'Failed to load file');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [filePath]);

    if (loading) {
        return (
            <div className="hex-viewer__loading">
                <div className="spinner" />
                <span>Loading binary data...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="hex-viewer__error">
                <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                <span>{error}</span>
            </div>
        );
    }

    if (!data) return null;

    // Generate rows (16 bytes each)
    const rows: Array<{
        offset: string;
        hex: string;
        ascii: string;
    }> = [];

    for (let i = 0; i < data.length; i += 16) {
        const slice = data.slice(i, i + 16);
        const offset = i.toString(16).padStart(8, '0').toUpperCase();
        const hex = Array.from(slice)
            .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
        const ascii = Array.from(slice)
            .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
            .join('');

        rows.push({ offset, hex, ascii });
    }

    return (
        <div className="hex-viewer">
            <div className="hex-viewer__toolbar">
                <span>{data.length} bytes{isTruncated ? ' (truncated)' : ''}</span>
            </div>
            <div className="hex-viewer__header">
                <span className="hex-viewer__offset-col">Offset</span>
                <span className="hex-viewer__hex-col">00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F</span>
                <span className="hex-viewer__ascii-col">ASCII</span>
            </div>
            <div className="hex-viewer__content">
                {rows.map((row) => (
                    <div key={row.offset} className="hex-viewer__row">
                        <span className="hex-viewer__offset">{row.offset}</span>
                        <span className="hex-viewer__hex">{row.hex.padEnd(47, ' ')}</span>
                        <span className="hex-viewer__ascii">{row.ascii}</span>
                    </div>
                ))}
            </div>
            {isTruncated && (
                <div className="hex-viewer__truncated">
                    Showing first {MAX_BYTES / 1024}KB of file
                </div>
            )}
        </div>
    );
};
