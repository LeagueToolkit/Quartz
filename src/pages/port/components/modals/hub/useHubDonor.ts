import { useState, useCallback } from 'react';
import githubApi from '@/pages/vfxhub/lib/githubApi';
import { insertVFXSystemIntoFile } from '@/pages/vfxhub/lib/vfxInsertSystem';
import { portStageHubDonor, type HubAssetBytes } from '@/lib/api/portHub';

/* Bridge: turn one or more picked hub systems into a Port donor. Downloads each
   system's .py + assets, merges multiple systems into one .py, stages them into
   a temp tree, then loads that as the donor session (mirrors Load-Donor-From-
   Game). The caller wires cleanup via setDonorTempRoot -> portCleanupDonorTemp. */

export interface HubPick { name: string; collectionFile: string }

async function fetchAssetBase64(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
        return btoa(binary);
    } catch {
        return null;
    }
}

export function useHubDonor(deps: {
    processDonorBin: (path: string, recordRecent?: boolean) => Promise<void>;
    setDonorTempRoot: (root: string) => void;
    setStatus: (msg: string) => void;
}) {
    const { processDonorBin, setDonorTempRoot, setStatus } = deps;
    const [staging, setStaging] = useState(false);

    const loadSystemsAsDonor = useCallback(async (picks: HubPick[]) => {
        if (!picks.length) return;
        setStaging(true);
        try {
            setStatus('Downloading VFX system...');
            let merged = '';
            const assetMap = new Map<string, string>(); // relPath -> downloadUrl
            for (const pick of picks) {
                const { pythonContent, assets } = await githubApi.downloadVFXSystem(pick.name, pick.collectionFile);
                merged = merged ? insertVFXSystemIntoFile(merged, pythonContent, pick.name) : pythonContent;
                for (const a of assets) {
                    if (a.downloadUrl) assetMap.set(a.name, a.downloadUrl);
                }
            }

            setStatus('Downloading assets...');
            const assetBytes: HubAssetBytes[] = [];
            for (const [relPath, url] of assetMap) {
                const base64 = await fetchAssetBase64(url);
                if (base64) assetBytes.push({ relPath, base64 });
            }

            setStatus('Staging donor...');
            const staged = await portStageHubDonor(merged, assetBytes);
            setDonorTempRoot(staged.tempRoot);
            await processDonorBin(staged.binPath, false);
            setStatus('Hub donor loaded');
        } catch (e) {
            setStatus(`Hub load failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setStaging(false);
        }
    }, [processDonorBin, setDonorTempRoot, setStatus]);

    return { loadSystemsAsDonor, staging };
}
