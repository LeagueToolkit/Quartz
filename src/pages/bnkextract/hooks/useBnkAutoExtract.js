import { useCallback } from 'react';
import { parseAudioFile, parseBinFile, groupAudioFiles, getEventMappings } from '../utils/bnkParser';
import { wemToOgg, wemToWav, wemToMp3 } from '../utils/wemConverter';

export function useBnkAutoExtract({
    activePane,
    setTreeData,
    setRightTreeData,
    setStatusMessage,
    setIsLoading,
    pushToHistory,
    extractFormats,
    codebookDataRef,
    mp3Bitrate,
}) {
    const handleAutoExtractProcess = useCallback(async (data) => {
        const { batchFiles, outputPath, loadToTree } = data;
        console.log(`[BnkExtract] Starting batch process for ${batchFiles.length} mods. Output path: ${outputPath || 'None (Parse Only)'}`);

        setIsLoading(true);
        if (loadToTree !== false) pushToHistory();

        const yieldThread = () => new Promise((resolve) => setTimeout(resolve, 50));

        try {
            if (!window.require) {
                throw new Error('File system access not available');
            }

            const fs = window.require('fs');
            const path = window.require('path');

            let totalExtracted = 0;

            for (const mod of batchFiles) {
                const { bin, audio, events, modFolderName } = mod;
                setStatusMessage(`Processing: ${modFolderName}...`);
                await yieldThread();

                let binStrings = [];
                if (bin && fs.existsSync(bin)) {
                    const binData = fs.readFileSync(bin);
                    binStrings = parseBinFile(binData);
                }

                let stringHashes = [];
                if (events && fs.existsSync(events)) {
                    const bnkData = fs.readFileSync(events);
                    stringHashes = getEventMappings(binStrings, bnkData);
                } else {
                    stringHashes = binStrings;
                }

                if (!audio || !fs.existsSync(audio)) continue;
                const audioData = fs.readFileSync(audio);
                const audioResult = parseAudioFile(audioData, audio);

                const tree = groupAudioFiles(audioResult.audioFiles, stringHashes, modFolderName);
                tree.isRoot = true;
                tree.originalPath = audio;
                tree.originalAudioFiles = audioResult.audioFiles;

                if (loadToTree !== false) {
                    if (activePane === 'left') {
                        setTreeData((prev) => [...prev, tree]);
                    } else {
                        setRightTreeData((prev) => [...prev, tree]);
                    }
                }

                if (outputPath) {
                    const modOutputDir = path.join(outputPath, modFolderName.replace(/[<>:"/\\|?*]/g, '_'));
                    if (!fs.existsSync(modOutputDir)) {
                        fs.mkdirSync(modOutputDir, { recursive: true });
                    }

                    setStatusMessage(`Extracting: ${modFolderName}...`);
                    await yieldThread();

                    const extractAll = async (node, curPath, isRoot = false) => {
                        const sanitized = node.name.replace(/[<>:"/\\|?*]/g, '_');
                        const target = isRoot ? curPath : path.join(curPath, sanitized);

                        if (node.audioData) {
                            const base = node.name.replace('.wem', '');

                            if (extractFormats.has('wem')) {
                                fs.writeFileSync(path.join(curPath, `${base}.wem`), Buffer.from(node.audioData.data));
                                totalExtracted++;
                            }

                            if (extractFormats.has('ogg')) {
                                try {
                                    const oggData = wemToOgg(node.audioData.data, codebookDataRef.current);
                                    const ext = oggData[0] === 0x52 && oggData[1] === 0x49 ? 'wav' : 'ogg';
                                    fs.writeFileSync(path.join(curPath, `${base}.${ext}`), Buffer.from(oggData));
                                    totalExtracted++;
                                } catch (_) {
                                    // Ignore per-file conversion errors and continue batch.
                                }
                            }

                            if (extractFormats.has('wav')) {
                                try {
                                    const wavData = await wemToWav(node.audioData.data, codebookDataRef.current);
                                    fs.writeFileSync(path.join(curPath, `${base}.wav`), Buffer.from(wavData));
                                    totalExtracted++;
                                } catch (_) {
                                    // Ignore per-file conversion errors and continue batch.
                                }
                            }

                            if (extractFormats.has('mp3')) {
                                try {
                                    const mp3Data = await wemToMp3(node.audioData.data, codebookDataRef.current, mp3Bitrate);
                                    fs.writeFileSync(path.join(curPath, `${base}.mp3`), Buffer.from(mp3Data));
                                    totalExtracted++;
                                } catch (_) {
                                    // Ignore per-file conversion errors and continue batch.
                                }
                            }
                        } else if (node.children) {
                            if (!isRoot && !fs.existsSync(target)) {
                                fs.mkdirSync(target, { recursive: true });
                            }
                            for (const child of node.children) {
                                await extractAll(child, target);
                            }
                        }
                    };

                    await extractAll(tree, modOutputDir, true);
                }
            }

            setStatusMessage(
                outputPath
                    ? `Successfully batch extracted ${totalExtracted} files.`
                    : `Successfully parsed ${batchFiles.length} mods into tree.`
            );
        } catch (error) {
            console.error(error);
            setStatusMessage(`Batch processing failed: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [
        activePane,
        setTreeData,
        setRightTreeData,
        setStatusMessage,
        setIsLoading,
        pushToHistory,
        extractFormats,
        codebookDataRef,
        mp3Bitrate,
    ]);

    return {
        handleAutoExtractProcess,
    };
}
