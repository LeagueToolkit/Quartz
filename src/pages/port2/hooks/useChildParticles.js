import { useState, useCallback } from 'react';
import {
    addChildParticleEffect,
    findAvailableVfxSystems,
    extractChildParticleData,
    updateChildParticleEmitter
} from '../../../utils/vfx/mutations/childParticlesManager.js';
import { parseVfxEmitters } from '../../../utils/vfx/vfxEmitterParser.js';

/**
 * useChildParticles — logic for the Child Particles modal in Port2.
 */
export default function useChildParticles(
    targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    deletedEmitters,
    saveStateToHistory,
    setTargetPyContent,
    setTargetSystems,
    setFileSaved,
    setStatusMessage
) {
    const [showChildModal, setShowChildModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedSystemForChild, setSelectedSystemForChild] = useState(null); // The system we are adding/editing in
    const [selectedChildSystem, setSelectedChildSystem] = useState('');     // The child system being referenced
    const [emitterName, setEmitterName] = useState('');                     // The name of the emitter
    const [availableVfxSystems, setAvailableVfxSystems] = useState([]);
    const [childParticleRate, setChildParticleRate] = useState('1');
    const [childParticleLifetime, setChildParticleLifetime] = useState('9999');
    const [childParticleBindWeight, setChildParticleBindWeight] = useState('1');
    const [childParticleIsSingle, setChildParticleIsSingle] = useState(true);
    const [childParticleTimeBeforeFirstEmission, setChildParticleTimeBeforeFirstEmission] = useState('0');
    const [childParticleTranslationOverrideX, setChildParticleTranslationOverrideX] = useState('0');
    const [childParticleTranslationOverrideY, setChildParticleTranslationOverrideY] = useState('0');
    const [childParticleTranslationOverrideZ, setChildParticleTranslationOverrideZ] = useState('0');

    const resetChildState = useCallback(() => {
        setShowChildModal(false);
        setIsEditMode(false);
        setSelectedSystemForChild(null);
        setSelectedChildSystem('');
        setEmitterName('');
        setChildParticleRate('1');
        setChildParticleLifetime('9999');
        setChildParticleBindWeight('1');
        setChildParticleIsSingle(true);
        setChildParticleTimeBeforeFirstEmission('0');
        setChildParticleTranslationOverrideX('0');
        setChildParticleTranslationOverrideY('0');
        setChildParticleTranslationOverrideZ('0');
        setAvailableVfxSystems([]);
    }, []);

    // Handle opening modal in ADD mode
    const handleAddChildParticles = useCallback((systemKey, systemName) => {
        if (!targetPyContent) {
            setStatusMessage('No target file loaded - Please open a target bin file first');
            return;
        }
        if (!hasResourceResolver || !hasSkinCharacterData) {
            setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }

        try {
            const systems = findAvailableVfxSystems(targetPyContent);
            setAvailableVfxSystems(systems);
            setSelectedSystemForChild({ key: systemKey, name: systemName });
            setIsEditMode(false);
            setEmitterName('');
            setChildParticleRate('1');
            setChildParticleLifetime('9999');
            setChildParticleBindWeight('1');
            setChildParticleIsSingle(true);
            setChildParticleTimeBeforeFirstEmission('0');
            setChildParticleTranslationOverrideX('0');
            setChildParticleTranslationOverrideY('0');
            setChildParticleTranslationOverrideZ('0');
            setShowChildModal(true);
            setStatusMessage(`Opening child particles modal for "${systemName}"`);
        } catch (error) {
            console.error('Error preparing child particles modal:', error);
            setStatusMessage(`Failed to prepare child particles: ${error.message}`);
        }
    }, [targetPyContent, hasResourceResolver, hasSkinCharacterData, setStatusMessage]);

    // Handle opening modal in EDIT mode
    const handleEditChildParticle = useCallback((systemKey, systemName, editingEmitterName) => {
        try {
            const currentData = extractChildParticleData(targetPyContent, systemKey, editingEmitterName);
            if (!currentData) {
                setStatusMessage(`Could not find child particle data for "${editingEmitterName}"`);
                return;
            }

            const systems = findAvailableVfxSystems(targetPyContent);
            setAvailableVfxSystems(systems);

            setSelectedSystemForChild({ key: systemKey, name: systemName });
            setEmitterName(editingEmitterName);
            setIsEditMode(true);

            const matchingSystem = systems.find(sys => sys.key === currentData.effectKey);
            setSelectedChildSystem(matchingSystem ? matchingSystem.key : currentData.effectKey);

            setChildParticleRate(currentData.rate.toString());
            setChildParticleLifetime(currentData.lifetime.toString());
            setChildParticleBindWeight(currentData.bindWeight.toString());
            setChildParticleIsSingle(currentData.isSingleParticle);
            setChildParticleTimeBeforeFirstEmission(currentData.timeBeforeFirstEmission.toString());
            setChildParticleTranslationOverrideX(currentData.translationOverrideX.toString());
            setChildParticleTranslationOverrideY(currentData.translationOverrideY.toString());
            setChildParticleTranslationOverrideZ(currentData.translationOverrideZ.toString());
            setShowChildModal(true);

            setStatusMessage(`Editing child particle "${editingEmitterName}" in "${systemName}"`);
        } catch (error) {
            console.error('Error preparing child particle edit:', error);
            setStatusMessage(`Failed to prepare child particle edit: ${error.message}`);
        }
    }, [targetPyContent, setStatusMessage]);

    // Combined Confirm handler
    const handleConfirmChildParticles = useCallback(() => {
        if (!selectedSystemForChild || !selectedChildSystem || !emitterName.trim()) {
            setStatusMessage('Please fill in all fields (VFX system and emitter name)');
            return;
        }

        try {
            saveStateToHistory(`${isEditMode ? 'Edit' : 'Add'} child particles ${isEditMode ? `"${emitterName}" in` : 'to'} "${selectedSystemForChild.name}"`);

            let updated;
            if (isEditMode) {
                updated = updateChildParticleEmitter(
                    targetPyContent,
                    selectedSystemForChild.key,
                    emitterName,
                    selectedChildSystem,
                    parseFloat(childParticleRate),
                    parseFloat(childParticleLifetime),
                    parseFloat(childParticleBindWeight),
                    childParticleIsSingle,
                    parseFloat(childParticleTimeBeforeFirstEmission),
                    parseFloat(childParticleTranslationOverrideX),
                    parseFloat(childParticleTranslationOverrideY),
                    parseFloat(childParticleTranslationOverrideZ)
                );
            } else {
                updated = addChildParticleEffect(
                    targetPyContent,
                    selectedSystemForChild.key,
                    selectedChildSystem,
                    emitterName.trim(),
                    deletedEmitters,
                    parseFloat(childParticleRate),
                    parseFloat(childParticleLifetime),
                    parseFloat(childParticleBindWeight),
                    childParticleIsSingle,
                    parseFloat(childParticleTimeBeforeFirstEmission),
                    parseFloat(childParticleTranslationOverrideX),
                    parseFloat(childParticleTranslationOverrideY),
                    parseFloat(childParticleTranslationOverrideZ)
                );
            }

            setTargetPyContent(updated);
            try { setFileSaved(false); } catch { }

            try {
                const systems = parseVfxEmitters(updated);
                setTargetSystems(systems);
            } catch (err) {
                console.warn('Failed to re-parse systems after mutation:', err);
            }

            setStatusMessage(`${isEditMode ? 'Updated' : 'Added'} child particle "${emitterName}" in "${selectedSystemForChild.name}"`);
            resetChildState();
        } catch (error) {
            console.error('Error confirming child particles:', error);
            setStatusMessage(`Failed to process child particles: ${error.message}`);
        }
    }, [isEditMode, selectedSystemForChild, selectedChildSystem, emitterName, targetPyContent, deletedEmitters, childParticleRate, childParticleLifetime, childParticleBindWeight, childParticleIsSingle, childParticleTimeBeforeFirstEmission, childParticleTranslationOverrideX, childParticleTranslationOverrideY, childParticleTranslationOverrideZ, saveStateToHistory, setTargetPyContent, setTargetSystems, setFileSaved, setStatusMessage, resetChildState]);

    return {
        showChildModal,
        isEditMode,
        selectedSystemForChild,
        selectedChildSystem,
        setSelectedChildSystem,
        emitterName,
        setEmitterName,
        availableVfxSystems,
        childParticleRate,
        setChildParticleRate,
        childParticleLifetime,
        setChildParticleLifetime,
        childParticleBindWeight,
        setChildParticleBindWeight,
        childParticleIsSingle,
        setChildParticleIsSingle,
        childParticleTimeBeforeFirstEmission,
        setChildParticleTimeBeforeFirstEmission,
        childParticleTranslationOverrideX,
        setChildParticleTranslationOverrideX,
        childParticleTranslationOverrideY,
        setChildParticleTranslationOverrideY,
        childParticleTranslationOverrideZ,
        setChildParticleTranslationOverrideZ,
        handleAddChildParticles,
        handleConfirmChildParticles,
        handleEditChildParticle,
        resetChildState
    };
}
