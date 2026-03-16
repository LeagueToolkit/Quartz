import { useState, useCallback } from 'react';
import {
    addIdleParticleEffect,
    addIdleParticleEffectByKey,
    hasIdleParticleEffect,
    extractParticleName,
    getAllIdleParticleBones,
    removeAllIdleParticlesForSystem,
    removeAllIdleParticlesByEffectKey
} from '../../../utils/vfx/mutations/idleParticlesManager.js';

/**
 * useIdleParticles — logic for the Idle Particles modal in Port2.
 */
export default function useIdleParticles(targetPyContent, hasResourceResolver, hasSkinCharacterData, saveStateToHistory, setTargetPyContent, setFileSaved, setStatusMessage) {
    const [showIdleParticleModal, setShowIdleParticleModal] = useState(false);
    const [selectedSystemForIdle, setSelectedSystemForIdle] = useState(null);
    const [idleBonesList, setIdleBonesList] = useState([]);
    const [isEditingIdle, setIsEditingIdle] = useState(false);
    const [existingIdleBones, setExistingIdleBones] = useState([]);

    const normalizeBoneConfigs = useCallback((boneConfigs) => {
        const normalized = [];
        const seen = new Set();
        for (const cfg of Array.isArray(boneConfigs) ? boneConfigs : []) {
            const raw = String(cfg?.boneName || '').trim();
            if (!raw) continue;
            // Keep output safe for py string serialization.
            const safe = raw.replace(/[\r\n\t"]/g, '').trim();
            if (!safe) continue;
            const lower = safe.toLowerCase();
            if (seen.has(lower)) continue;
            seen.add(lower);
            normalized.push({ boneName: safe });
        }
        return normalized;
    }, []);

    // Handle adding idle particles to a VFX system (TARGET list only)
    const handleAddIdleParticles = useCallback((systemKey, systemName) => {
        if (!targetPyContent) {
            setStatusMessage('No target file loaded - Please open a target bin file first');
            return;
        }
        if (!hasResourceResolver || !hasSkinCharacterData) {
            setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }

        // Check if this system has a particleName (only when clicked)
        // IMPORTANT: Use the full system path (systemKey), not the short display name
        const particleName = extractParticleName(targetPyContent, systemKey);
        if (!particleName) {
            setStatusMessage(`VFX system "${systemName}" does not have particle emitters and cannot be used for idle particles. Only systems with particleName can be added as idle effects.`);
            return;
        }

        // If system already has idle particles, open edit flow with existing bones
        if (hasIdleParticleEffect(targetPyContent, systemKey)) {
            const currentBones = getAllIdleParticleBones(targetPyContent, systemKey);
            setIsEditingIdle(true);
            setExistingIdleBones(currentBones);
            // Populate list with existing bones for editing
            setIdleBonesList(currentBones.map((bone, idx) => ({ id: Date.now() + idx, boneName: bone, customBoneName: '' })));
            setSelectedSystemForIdle({ key: systemKey, name: systemName });
            setShowIdleParticleModal(true);
            setStatusMessage(`Editing ${currentBones.length} idle particle(s) for "${systemName}". Modify bones or add more.`);
            return;
        }

        setIsEditingIdle(false);
        setExistingIdleBones([]);
        setIdleBonesList([]); // Start with empty list - user clicks "Add Another Bone" to add
        setSelectedSystemForIdle({ key: systemKey, name: systemName });
        setShowIdleParticleModal(true);
    }, [targetPyContent, hasResourceResolver, hasSkinCharacterData, setStatusMessage]);

    // Confirm adding idle particles with selected bones
    const handleConfirmIdleParticles = useCallback(() => {
        if (!selectedSystemForIdle || !targetPyContent) return;

        try {
            // Save state before adding/updating idle particles
            const action = isEditingIdle ? 'Update idle particles' : 'Add idle particles';
            saveStateToHistory(`${action} for "${selectedSystemForIdle.name}"`);

            // Build bone configs from the list
            const boneConfigs = normalizeBoneConfigs(idleBonesList.map(item => ({
                boneName: (item.customBoneName && item.customBoneName.trim())
                    ? item.customBoneName.trim()
                    : item.boneName
            })));

            let updatedContent = targetPyContent;

            // If editing, remove all existing idle particles for this system first
            if (isEditingIdle) {
                updatedContent = removeAllIdleParticlesForSystem(updatedContent, selectedSystemForIdle.key);
            }

            // If user removed all entries, just remove idle particles and don't add any
            if (boneConfigs.length === 0) {
                setTargetPyContent(updatedContent);
                try { setFileSaved(false); } catch { }
                setStatusMessage(`Removed all idle particles from "${selectedSystemForIdle.name}"`);
            } else {
                // Add all the bones from the list (edited + new)
                updatedContent = addIdleParticleEffect(updatedContent, selectedSystemForIdle.key, boneConfigs);
                setTargetPyContent(updatedContent);
                try { setFileSaved(false); } catch { }

                const boneNames = boneConfigs.map(c => c.boneName).join(', ');
                setStatusMessage(`${isEditingIdle ? 'Updated' : 'Added'} ${boneConfigs.length} idle particle(s) for "${selectedSystemForIdle.name}" on bones: ${boneNames}`);
            }

            setShowIdleParticleModal(false);
            setSelectedSystemForIdle(null);
            setIsEditingIdle(false);
            setExistingIdleBones([]);
            setIdleBonesList([]);
        } catch (error) {
            console.error('Error adding idle particles:', error);
            setStatusMessage(`Failed to add idle particles: ${error.message}`);
        }
    }, [selectedSystemForIdle, targetPyContent, isEditingIdle, idleBonesList, normalizeBoneConfigs, saveStateToHistory, setTargetPyContent, setFileSaved, setStatusMessage]);

    const handleRemoveIdleParticlesForSystem = useCallback((systemKey, systemName = systemKey) => {
        if (!targetPyContent) {
            setStatusMessage('No target file loaded - Please open a target bin file first');
            return;
        }
        try {
            const hasIdle = hasIdleParticleEffect(targetPyContent, systemKey);
            if (!hasIdle) {
                setStatusMessage(`No idle particles found for "${systemName}"`);
                return;
            }

            saveStateToHistory(`Remove idle particles for "${systemName}"`);
            const updatedContent = removeAllIdleParticlesForSystem(targetPyContent, systemKey);
            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch { }
            setStatusMessage(`Removed all idle particles from "${systemName}"`);
        } catch (error) {
            console.error('Error removing idle particles:', error);
            setStatusMessage(`Failed to remove idle particles: ${error.message}`);
        }
    }, [targetPyContent, saveStateToHistory, setTargetPyContent, setFileSaved, setStatusMessage]);

    const handleUpsertIdleParticlesByEffectKey = useCallback((effectKey, boneConfigs) => {
        if (!targetPyContent) {
            setStatusMessage('No target file loaded - Please open a target bin file first');
            return;
        }
        const cleanKey = String(effectKey || '').replace(/^"|"$/g, '').trim();
        if (!cleanKey) {
            setStatusMessage('Select a VFX effect key first');
            return;
        }

        try {
            saveStateToHistory(`Upsert idle particles for "${cleanKey}"`);

            const safeBones = normalizeBoneConfigs(boneConfigs);
            let updatedContent = removeAllIdleParticlesByEffectKey(targetPyContent, cleanKey);
            if (safeBones.length > 0) {
                updatedContent = addIdleParticleEffectByKey(updatedContent, cleanKey, safeBones);
                setStatusMessage(`Applied ${safeBones.length} idle particle(s) for "${cleanKey}"`);
            } else {
                setStatusMessage(`Removed idle particles for "${cleanKey}"`);
            }

            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch { }
        } catch (error) {
            console.error('Error upserting idle particles by effect key:', error);
            setStatusMessage(`Failed to apply idle particles: ${error.message}`);
        }
    }, [targetPyContent, normalizeBoneConfigs, saveStateToHistory, setTargetPyContent, setFileSaved, setStatusMessage]);

    const handleRemoveIdleParticlesByEffectKey = useCallback((effectKey) => {
        const cleanKey = String(effectKey || '').replace(/^"|"$/g, '').trim();
        if (!cleanKey) return;
        handleUpsertIdleParticlesByEffectKey(cleanKey, []);
    }, [handleUpsertIdleParticlesByEffectKey]);

    const handleUpsertIdleParticlesForSystem = useCallback((systemKey, systemName, boneConfigs) => {
        if (!targetPyContent) {
            setStatusMessage('No target file loaded - Please open a target bin file first');
            return;
        }
        if (!systemKey) {
            setStatusMessage('Select a VFX system first');
            return;
        }
        const resolvedName = systemName || systemKey;

        try {
            saveStateToHistory(`Upsert idle particles for "${resolvedName}"`);

            const safeBones = normalizeBoneConfigs(boneConfigs);
            let updatedContent = removeAllIdleParticlesForSystem(targetPyContent, systemKey);
            if (safeBones.length === 0) {
                setStatusMessage('Add at least one valid bone before applying idle particles');
                return;
            }
            updatedContent = addIdleParticleEffect(updatedContent, systemKey, safeBones);
            setStatusMessage(`Applied ${safeBones.length} idle particle(s) for "${resolvedName}"`);

            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch { }
        } catch (error) {
            console.error('Error upserting idle particles for system:', error);
            setStatusMessage(`Failed to apply idle particles: ${error.message}`);
        }
    }, [targetPyContent, normalizeBoneConfigs, saveStateToHistory, setTargetPyContent, setFileSaved, setStatusMessage]);

    return {
        showIdleParticleModal,
        setShowIdleParticleModal,
        selectedSystemForIdle,
        setSelectedSystemForIdle,
        idleBonesList,
        setIdleBonesList,
        isEditingIdle,
        setIsEditingIdle,
        existingIdleBones,
        setExistingIdleBones,
        handleAddIdleParticles,
        handleConfirmIdleParticles,
        handleRemoveIdleParticlesForSystem,
        handleUpsertIdleParticlesForSystem,
        handleUpsertIdleParticlesByEffectKey,
        handleRemoveIdleParticlesByEffectKey
    };
}
