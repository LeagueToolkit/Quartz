import { useEffect, useState } from 'react';

export function useBnkPersistence() {
    const [bnkPath, setBnkPath] = useState('');
    const [wpkPath, setWpkPath] = useState('');
    const [binPath, setBinPath] = useState('');

    const [extractFormats, setExtractFormats] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-formats');
        return saved ? new Set(JSON.parse(saved)) : new Set(['wem', 'ogg']);
    });

    const [mp3Bitrate, setMp3Bitrate] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-mp3-bitrate');
        return saved ? parseInt(saved, 10) : 192;
    });

    const [history, setHistory] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-history');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        const lastPaths = localStorage.getItem('bnk-extract-last-paths');
        if (!lastPaths) return;
        try {
            const { bin, wpk, bnk } = JSON.parse(lastPaths);
            if (bin) setBinPath(bin);
            if (wpk) setWpkPath(wpk);
            if (bnk) setBnkPath(bnk);
        } catch (e) {
            console.error('[BnkExtract] Failed to load last paths:', e);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('bnk-extract-history', JSON.stringify(history));
    }, [history]);

    return {
        bnkPath,
        setBnkPath,
        wpkPath,
        setWpkPath,
        binPath,
        setBinPath,
        extractFormats,
        setExtractFormats,
        mp3Bitrate,
        setMp3Bitrate,
        history,
        setHistory,
    };
}
