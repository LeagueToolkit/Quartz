import { useState, useRef, useEffect, useCallback } from 'react';
import { wemToOgg } from '../utils/wemConverter';

export function useBnkAudioPlayback({ autoPlay, setStatusMessage }) {
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('bnk-extract-volume');
        return saved !== null ? parseInt(saved, 10) : 100;
    });

    const audioContextRef = useRef(null);
    const currentSourceRef = useRef(null);
    const currentGainRef = useRef(null);
    const currentAudioRef = useRef(null);
    const codebookDataRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('bnk-extract-volume', volume.toString());
        if (currentGainRef.current) {
            currentGainRef.current.gain.value = volume / 100;
        }
        if (currentAudioRef.current) {
            currentAudioRef.current.volume = volume / 100;
        }
    }, [volume]);

    const stopAudio = useCallback(() => {
        if (currentSourceRef.current) {
            try {
                currentSourceRef.current.stop();
            } catch (_) {
                // Already stopped.
            }
            currentSourceRef.current = null;
        }
        currentGainRef.current = null;
        currentAudioRef.current = null;
        setStatusMessage('Playback stopped');
    }, [setStatusMessage]);

    const playAudio = useCallback(async (node) => {
        if (!autoPlay || !node.audioData) return;

        stopAudio();

        try {
            setStatusMessage(`Playing ${node.name}...`);

            const rawData = node.audioData.data;
            let audioData = null;
            let conversionNeeded = true;

            const nameLower = node.name.toLowerCase();
            if (nameLower.endsWith('.wav') || nameLower.endsWith('.ogg')) {
                const magic = String.fromCharCode(rawData[0], rawData[1], rawData[2], rawData[3]);
                if (magic === 'RIFF' || magic === 'OggS') {
                    audioData = rawData;
                    conversionNeeded = false;
                }
            }

            if (conversionNeeded) {
                try {
                    audioData = wemToOgg(rawData, codebookDataRef.current);
                    if (!audioData || audioData.length === 0) {
                        throw new Error('Conversion result empty');
                    }
                } catch (error) {
                    console.warn('[BnkExtract] WEM conversion failed:', error.message);
                    setStatusMessage(`Cannot play: WEM format not yet decodable (${node.name})`);
                    return;
                }
            }

            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }

            const audioCtx = audioContextRef.current;

            try {
                const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                const source = audioCtx.createBufferSource();
                const gainNode = audioCtx.createGain();

                gainNode.gain.value = volume / 100;
                source.buffer = audioBuffer;

                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                source.start(0);
                currentSourceRef.current = source;
                currentGainRef.current = gainNode;

                source.onended = () => {
                    setStatusMessage('Ready');
                    currentGainRef.current = null;
                };
                return;
            } catch (decodeError) {
                console.warn('[BnkExtract] Web Audio decode failed, trying HTML5 Audio:', decodeError.message);
            }

            try {
                const isWav = audioData[0] === 0x52 && audioData[1] === 0x49 && audioData[2] === 0x46 && audioData[3] === 0x46;
                const mimeType = isWav ? 'audio/wav' : 'audio/ogg';

                const blob = new Blob([audioData], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const audio = new Audio();

                audio.onerror = (error) => {
                    URL.revokeObjectURL(url);
                    setStatusMessage(`Cannot play: format not supported (${node.name})`);
                    console.warn('[BnkExtract] HTML5 Audio failed:', error);
                };

                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    setStatusMessage('Ready');
                };

                audio.oncanplaythrough = () => {
                    audio.volume = volume / 100;
                    audio.play().catch((error) => {
                        setStatusMessage(`Playback failed: ${error.message}`);
                    });
                };

                audio.src = url;
                currentAudioRef.current = audio;
                currentSourceRef.current = {
                    stop: () => {
                        audio.pause();
                        currentAudioRef.current = null;
                        URL.revokeObjectURL(url);
                    },
                };
            } catch (htmlAudioError) {
                setStatusMessage(`Cannot play audio: ${htmlAudioError.message}`);
            }
        } catch (error) {
            console.error('[BnkExtract] Playback error:', error);
            setStatusMessage(`Playback error: ${error.message}`);
        }
    }, [autoPlay, stopAudio, volume, setStatusMessage]);

    return {
        volume,
        setVolume,
        codebookDataRef,
        stopAudio,
        playAudio,
    };
}
