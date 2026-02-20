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
    const [selectedSystemForChild, setSelectedSystemForChild] = useState(null);
    const [selectedChildSystem, setSelectedChildSystem] = useState('');
    const [childEmitterName, setChildEmitterName] = useState('');
    const [availableVfxSystems, setAvailableVfxSystems] = useState([]);
    const [childParticleRate, setChildParticleRate] = useState('1');
    const [childParticleLifetime, setChildParticleLifetime] = useState('9999');
    const [childParticleBindWeight, setChildParticleBindWeight] = useState('1');
    const [childParticleIsSingle, setChildParticleIsSingle] = useState(true);
    const [childParticleTimeBeforeFirstEmission, setChildParticleTimeBeforeFirstEmission] = useState('0');
    const [childParticleTranslationOverrideX, setChildParticleTranslationOverrideX] = useState('0');
    const [childParticleTranslationOverrideY, setChildParticleTranslationOverrideY] = useState('0');
    const [childParticleTranslationOverrideZ, setChildParticleTranslationOverrideZ] = useState('0');

    // Child particle edit states
    const [showChildEditModal, setShowChildEditModal] = useState(false);
    const [editingChildEmitter, setEditingChildEmitter] = useState(null);
    const [editingChildSystem, setEditingChildSystem] = useState(null);

    // Handle adding child particles to a VFX system (TARGET list only)
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
            setSelectedChildSystem('');
            setChildEmitterName('');
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

    // Confirm adding child particles
    const handleConfirmChildParticles = useCallback(() => {
        if (!selectedSystemForChild || !selectedChildSystem || !childEmitterName.trim()) {
            setStatusMessage('Please fill in all fields (VFX system and emitter name)');
            return;
        }

        try {
            // Save state before adding child particles
            saveStateToHistory(`Add child particles to "${selectedSystemForChild.name}"`);

            const updated = addChildParticleEffect(
                targetPyContent,
                selectedSystemForChild.key,
                selectedChildSystem,
                childEmitterName.trim(),
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

            setTargetPyContent(updated);
            try { setFileSaved(false); } catch { }

            // Re-parse systems to update UI and ensure child particles are properly reflected
            try {
                const systems = parseVfxEmitters(updated);
                setTargetSystems(systems);
            } catch (parseError) {
                console.warn('Failed to re-parse systems after adding child particles:', parseError);
            }

            setStatusMessage(`Added child particles "${childEmitterName}" to "${selectedSystemForChild.name}"`);
            setShowChildModal(false);
            setSelectedSystemForChild(null);
            setSelectedChildSystem('');
            setChildEmitterName('');
            setChildParticleRate('1');
            setChildParticleLifetime('9999');
            setChildParticleBindWeight('1');
            setChildParticleIsSingle(true);
            setChildParticleTimeBeforeFirstEmission('0');
            setChildParticleTranslationOverrideX('0');
            setChildParticleTranslationOverrideY('0');
            setChildParticleTranslationOverrideZ('0');
            setAvailableVfxSystems([]);
        } catch (error) {
            console.error('Error adding child particles:', error);
            setStatusMessage(`Failed to add child particles: ${error.message}`);
        }
    }, [selectedSystemForChild, selectedChildSystem, childEmitterName, targetPyContent, deletedEmitters, childParticleRate, childParticleLifetime, childParticleBindWeight, childParticleIsSingle, childParticleTimeBeforeFirstEmission, childParticleTranslationOverrideX, childParticleTranslationOverrideY, childParticleTranslationOverrideZ, saveStateToHistory, setTargetPyContent, setTargetSystems, setFileSaved, setStatusMessage]);

    // Handle editing a Quartz-created child particle emitter
    const handleEditChildParticle = useCallback((systemKey, systemName, emitterName) => {
        try {
            // Extract the current data from the emitter
            const currentData = extractChildParticleData(targetPyContent, systemKey, emitterName);

            if (!currentData) {
                setStatusMessage(`Could not find child particle data for "${emitterName}"`);
                return;
            }

            // Load available VFX systems for the dropdown
            const systems = findAvailableVfxSystems(targetPyContent);
            setAvailableVfxSystems(systems);

            // Set up the edit modal
            setEditingChildEmitter(emitterName);
            setEditingChildSystem({ key: systemKey, name: systemName });

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
            setShowChildEditModal(true);

            setStatusMessage(`Editing child particle "${emitterName}" in "${systemName}"`);
        } catch (error) {
            console.error('Error preparing child particle edit:', error);
            setStatusMessage(`Failed to prepare child particle edit: ${error.message}`);
        }
    }, [targetPyContent, setStatusMessage]);

    // Handle confirming child particle edit
    const handleConfirmChildParticleEdit = useCallback(() => {
        if (!editingChildEmitter || !editingChildSystem) {
            setStatusMessage('Missing emitter or system information');
            return;
        }

        try {
            // Save state before editing
            saveStateToHistory(`Edit child particle "${editingChildEmitter}" in "${editingChildSystem.name}"`);

            const updated = updateChildParticleEmitter(
                targetPyContent,
                editingChildSystem.key,
                editingChildEmitter,
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

            setTargetPyContent(updated);
            try { setFileSaved(false); } catch { }

            // Re-parse systems to update UI
            try {
                const systems = parseVfxEmitters(updated);
                setTargetSystems(systems);
            } catch (parseError) {
                console.warn('Failed to re-parse systems after editing child particles:', parseError);
            }

            setStatusMessage(`Updated child particle "${editingChildEmitter}" in "${editingChildSystem.name}"`);
            setShowChildEditModal(false);
            setEditingChildEmitter(null);
            setEditingChildSystem(null);
        } catch (error) {
            console.error('Error updating child particle:', error);
            setStatusMessage(`Failed to update child particle: ${error.message}`);
        }
    }, [editingChildEmitter, editingChildSystem, targetPyContent, selectedChildSystem, childParticleRate, childParticleLifetime, childParticleBindWeight, childParticleIsSingle, childParticleTimeBeforeFirstEmission, childParticleTranslationOverrideX, childParticleTranslationOverrideY, childParticleTranslationOverrideZ, saveStateToHistory, setTargetPyContent, setTargetSystems, setFileSaved, setStatusMessage]);

    return {
        showChildModal,
        setShowChildModal,
        selectedSystemForChild,
        setSelectedSystemForChild,
        selectedChildSystem,
        setSelectedChildSystem,
        childEmitterName,
        setChildEmitterName,
        availableVfxSystems,
        setAvailableVfxSystems,
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
        showChildEditModal,
        setShowChildEditModal,
        editingChildEmitter,
        setEditingChildEmitter,
        editingChildSystem,
        setEditingChildSystem,
        handleAddChildParticles,
        handleConfirmChildParticles,
        handleEditChildParticle,
        handleConfirmChildParticleEdit
    };
}
