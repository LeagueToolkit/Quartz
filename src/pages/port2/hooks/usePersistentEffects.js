import { useState, useCallback, useRef, useEffect } from 'react';
import {
    scanEffectKeys,
    extractSubmeshes,
    insertOrUpdatePersistentEffect,
    ensureResolverMapping,
    resolveEffectKey,
    extractExistingPersistentConditions
} from '../../../utils/vfx/mutations/persistentEffectsManager.js';

/**
 * usePersistentEffects — logic for the Persistent Effects modal in Port2.
 */
export default function usePersistentEffects(
    targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    saveStateToHistory,
    setTargetPyContent,
    setFileSaved,
    setStatusMessage
) {
    const [showPersistentModal, setShowPersistentModal] = useState(false);
    const [persistentPreset, setPersistentPreset] = useState({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
    const [persistentVfx, setPersistentVfx] = useState([]);
    const [persistentShowSubmeshes, setPersistentShowSubmeshes] = useState([]);
    const [persistentHideSubmeshes, setPersistentHideSubmeshes] = useState([]);
    const [customShowSubmeshInput, setCustomShowSubmeshInput] = useState('');
    const [customHideSubmeshInput, setCustomHideSubmeshInput] = useState('');
    const [vfxSearchTerms, setVfxSearchTerms] = useState({}); // {index: searchTerm}
    const [vfxDropdownOpen, setVfxDropdownOpen] = useState({}); // {index: boolean}
    const [existingConditions, setExistingConditions] = useState([]);
    const [showExistingConditions, setShowExistingConditions] = useState(false);
    const [editingConditionIndex, setEditingConditionIndex] = useState(null);
    const [effectKeyOptions, setEffectKeyOptions] = useState([]);
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
    const typeDropdownRef = useRef(null);
    const [availableSubmeshes, setAvailableSubmeshes] = useState([]);

    const typeOptions = [
        {
            value: 'IsAnimationPlaying',
            label: 'Animation Playing',
            description: 'Trigger when specific animation is playing'
        },
        {
            value: 'HasBuffScript',
            label: 'Has Buff',
            description: 'Trigger when character has a specific buff'
        },
        {
            value: 'LearnedSpell',
            label: 'Learned Spell',
            description: 'Trigger when character has learned a spell'
        },
        {
            value: 'HasGear',
            label: 'Has Gear',
            description: 'Trigger when character has specific gear equipped'
        },
        {
            value: 'FloatComparison',
            label: 'Spell Rank Comparison',
            description: 'Compare spell rank with a value'
        },
        {
            value: 'BuffCounterFloatComparison',
            label: 'Buff Counter Comparison',
            description: 'Compare buff counter with a value'
        }
    ];

    // Handle adding custom show submesh
    const handleAddCustomShowSubmesh = useCallback(() => {
        const trimmed = customShowSubmeshInput.trim();
        if (trimmed && !persistentShowSubmeshes.includes(trimmed)) {
            setPersistentShowSubmeshes(prev => [...prev, trimmed]);
            setCustomShowSubmeshInput('');
        }
    }, [customShowSubmeshInput, persistentShowSubmeshes]);

    // Handle adding custom hide submesh
    const handleAddCustomHideSubmesh = useCallback(() => {
        const trimmed = customHideSubmeshInput.trim();
        if (trimmed && !persistentHideSubmeshes.includes(trimmed)) {
            setPersistentHideSubmeshes(prev => [...prev, trimmed]);
            setCustomHideSubmeshInput('');
        }
    }, [customHideSubmeshInput, persistentHideSubmeshes]);

    // Handle removing custom submesh
    const handleRemoveCustomSubmesh = useCallback((submesh, type) => {
        if (type === 'show') {
            setPersistentShowSubmeshes(prev => prev.filter(s => s !== submesh));
        } else if (type === 'hide') {
            setPersistentHideSubmeshes(prev => prev.filter(s => s !== submesh));
        }
    }, []);

    // Handle opening persistent modal
    const handleOpenPersistent = useCallback(() => {
        if (!targetPyContent) {
            setStatusMessage('No target file loaded');
            return;
        }
        if (!hasResourceResolver || !hasSkinCharacterData) {
            setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
            return;
        }
        try {
            // Reset form state (but preserve custom submeshes)
            setPersistentPreset({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
            setPersistentVfx([]);
            setCustomShowSubmeshInput('');
            setCustomHideSubmeshInput('');
            setVfxSearchTerms({});
            setVfxDropdownOpen({});
            setEditingConditionIndex(null);
            setShowExistingConditions(false);

            // Load data
            setEffectKeyOptions(scanEffectKeys(targetPyContent));
            const newAvailableSubmeshes = extractSubmeshes(targetPyContent);
            setAvailableSubmeshes(newAvailableSubmeshes);

            // Only clear submeshes that are in availableSubmeshes, keep custom ones
            setPersistentShowSubmeshes(prev => prev.filter(s => !newAvailableSubmeshes.includes(s)));
            setPersistentHideSubmeshes(prev => prev.filter(s => !newAvailableSubmeshes.includes(s)));

            const existing = extractExistingPersistentConditions(targetPyContent);
            setExistingConditions(existing);

            setShowPersistentModal(true);
        } catch (e) {
            console.error('Error preparing Persistent editor:', e);
            setStatusMessage('Error preparing Persistent editor');
        }
    }, [targetPyContent, hasResourceResolver, hasSkinCharacterData, setStatusMessage]);

    // Handle loading existing condition
    const handleLoadExistingCondition = useCallback((condition) => {
        // Clear existing state first
        setVfxSearchTerms({});
        setVfxDropdownOpen({});

        // Load the condition data
        setPersistentPreset(condition.preset);
        setPersistentVfx(condition.vfx.map((v, idx) => ({
            ...v,
            id: effectKeyOptions.find(o => o.key === v.key)?.id || `custom:${v.key}`
        })));
        setPersistentShowSubmeshes([...condition.submeshesShow]); // Force array copy
        setPersistentHideSubmeshes([...condition.submeshesHide]); // Force array copy
        setEditingConditionIndex(condition.index);
        setShowExistingConditions(false);

        setStatusMessage(`Loaded condition: ${condition.label}`);
    }, [effectKeyOptions, setStatusMessage]);

    // Handle applying persistent effects
    const handleApplyPersistent = useCallback(() => {
        if (!targetPyContent) return;
        try {
            // Save state before applying persistent effects
            const action = editingConditionIndex !== null ? 'Update persistent effects' : 'Add persistent effects';
            saveStateToHistory(action);

            let updated = targetPyContent;
            const normalizedVfx = persistentVfx.map(v => {
                const selected = effectKeyOptions.find(o => o.id === v.id) || { key: v.key, type: v.type, value: v.value };
                const resolved = resolveEffectKey(updated, selected);
                return { ...v, key: resolved.key, value: resolved.value };
            }).filter(v => !!v.key);

            for (const v of normalizedVfx) {
                if (v && v.key && !/^0x[0-9a-fA-F]+$/.test(v.key) && v.value) {
                    updated = ensureResolverMapping(updated, v.key, v.value);
                }
            }

            updated = insertOrUpdatePersistentEffect(updated, {
                ownerPreset: persistentPreset,
                submeshesShow: persistentShowSubmeshes,
                submeshesHide: persistentHideSubmeshes,
                vfxList: normalizedVfx,
                editingIndex: editingConditionIndex
            });

            setTargetPyContent(updated);
            try { setFileSaved(false); } catch { }
            setShowPersistentModal(false);
            const actionResult = editingConditionIndex !== null ? 'Updated' : 'Added';
            setStatusMessage(`${actionResult} PersistentEffectConditions`);
        } catch (e) {
            console.error('Error applying persistent effect:', e);
            setStatusMessage(`Failed to apply Persistent effect: ${e.message}`);
        }
    }, [targetPyContent, editingConditionIndex, saveStateToHistory, persistentVfx, effectKeyOptions, persistentPreset, persistentShowSubmeshes, persistentHideSubmeshes, setTargetPyContent, setFileSaved, setStatusMessage]);

    // Handle click outside for type dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
                setTypeDropdownOpen(false);
            }
        };

        if (typeDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [typeDropdownOpen]);

    return {
        showPersistentModal,
        setShowPersistentModal,
        persistentPreset,
        setPersistentPreset,
        persistentVfx,
        setPersistentVfx,
        persistentShowSubmeshes,
        setPersistentShowSubmeshes,
        persistentHideSubmeshes,
        setPersistentHideSubmeshes,
        customShowSubmeshInput,
        setCustomShowSubmeshInput,
        customHideSubmeshInput,
        setCustomHideSubmeshInput,
        vfxSearchTerms,
        setVfxSearchTerms,
        vfxDropdownOpen,
        setVfxDropdownOpen,
        existingConditions,
        setExistingConditions,
        showExistingConditions,
        setShowExistingConditions,
        editingConditionIndex,
        setEditingConditionIndex,
        effectKeyOptions,
        setEffectKeyOptions,
        typeDropdownOpen,
        setTypeDropdownOpen,
        typeDropdownRef,
        availableSubmeshes,
        setAvailableSubmeshes,
        typeOptions,
        handleOpenPersistent,
        handleAddCustomShowSubmesh,
        handleAddCustomHideSubmesh,
        handleRemoveCustomSubmesh,
        handleLoadExistingCondition,
        handleApplyPersistent
    };
}
