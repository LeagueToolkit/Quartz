import { useState, useCallback } from 'react';
import { downloadHubSystem, type HubSystem } from './hubApi';
import { portStageHubDonor, type HubAssetBytes } from '@/lib/api/portHub';

/* Bridge: turn a picked hub system into a Port donor. Downloads the compiled
   .bin + its assets, stages them into a temp tree, then loads that as the donor
   session (mirrors Load-Donor-From-Game). Cleanup is wired via setDonorTempRoot
   -> portCleanupDonorTemp by the caller. Multi-pick loads the first system (the
   .bin format is one system per file; merging bins is not supported yet). */

export function useHubDonor(deps: {
    processDonorBin: (path: string, recordRecent?: boolean) => Promise<void>;
    setDonorTempRoot: (root: string) => void;
    setStatus: (msg: string) => void;
}) {
    const { processDonorBin, setDonorTempRoot, setStatus } = deps;
    const [staging, setStaging] = useState(false);

    const loadSystemAsDonor = useCallback(async (system: HubSystem) => {
        setStaging(true);
        try {
            setStatus(`Downloading ${system.displayName}...`);
            const { binBase64, assets } = await downloadHubSystem(system);
            const assetBytes: HubAssetBytes[] = assets.map((a) => ({ relPath: a.relPath, base64: a.base64 }));

            setStatus('Staging donor...');
            const staged = await portStageHubDonor(binBase64, assetBytes);
            setDonorTempRoot(staged.tempRoot);
            await processDonorBin(staged.binPath, false);
            setStatus('Hub donor loaded');
        } catch (e) {
            setStatus(`Hub load failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setStaging(false);
        }
    }, [processDonorBin, setDonorTempRoot, setStatus]);

    return { loadSystemAsDonor, staging };
}
