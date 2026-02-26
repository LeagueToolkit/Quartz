import { extractExistingPersistentConditions, insertMultiplePersistentEffects } from '../../../utils/vfx/mutations/persistentEffectsManager.js';
import { hasChangesToSave } from './save/pyContentMerge';
import { generateModifiedPythonFromSystems, loadEmitterData } from '../../../utils/vfx/vfxEmitterParser.js';
import { ToBin, ToPy } from '../../../utils/io/fileOperations.js';

export default function useVfxHubSave({
  deletedEmitters,
  targetSystems,
  targetPyContent,
  targetPath,
  setStatusMessage,
  setIsProcessing,
  setProcessingText,
  setFileSaved,
  setShowRitoBinErrorDialog,
  electronPrefs,
}) {
  const hasChangesToSaveFn = () => hasChangesToSave(targetSystems, deletedEmitters);

  const handleSave = async () => {
    try {
      setIsProcessing(true);
      setProcessingText('Saving .bin...');
      setStatusMessage('Saving modified target file...');
      setFileSaved(false);
      // Let React paint loading UI before any heavy synchronous work.
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (!targetPyContent || Object.keys(targetSystems).length === 0) {
        setStatusMessage('No target file loaded');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      if (!hasChangesToSaveFn()) {
        setStatusMessage('No changes to save');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      const existingPersistentConditions = extractExistingPersistentConditions(targetPyContent);
      let modifiedContent = targetPyContent;

      const hasDeletedEmitters = deletedEmitters.size > 0;

      let hasEmittersWithoutFullData = false;
      for (const sName in targetSystems) {
        if (targetSystems[sName].emitters?.some(e => !e.originalContent)) {
          hasEmittersWithoutFullData = true;
          break;
        }
      }

      // Do full regeneration only when required.
      // Port/move operations already keep targetPyContent in sync, so ported emitters
      // alone should not force a full rebuild on every save.
      if (hasDeletedEmitters || hasEmittersWithoutFullData) {
        const systemsForSave = {};
        for (const [key, sys] of Object.entries(targetSystems)) {
          const emitters = sys.emitters?.map(e => e.originalContent ? e : (loadEmitterData(sys, e.name) || e)) || [];
          systemsForSave[key] = { ...sys, emitters };
        }
        modifiedContent = generateModifiedPythonFromSystems(targetPyContent, systemsForSave);
      }

      let finalContent = modifiedContent;
      if (existingPersistentConditions.length > 0) {
        try {
          const currentPersistentInModified = extractExistingPersistentConditions(modifiedContent) || [];
          const beforeSig = existingPersistentConditions.map(c => c.originalText || '').join('\n---\n');
          const afterSig = currentPersistentInModified.map(c => c.originalText || '').join('\n---\n');
          const needsReinsert = currentPersistentInModified.length === 0 || beforeSig !== afterSig;
          if (needsReinsert) {
            finalContent = insertMultiplePersistentEffects(modifiedContent, existingPersistentConditions);
          }
        } catch {
          finalContent = insertMultiplePersistentEffects(modifiedContent, existingPersistentConditions);
        }
      }

      const fs = window.require('fs');
      const path = window.require('path');
      const targetDir = path.dirname(targetPath);
      const targetName = path.basename(targetPath, '.bin');
      const outputPyPath = path.join(targetDir, `${targetName}.py`);

      await fs.promises.writeFile(outputPyPath, finalContent, 'utf8');

      const { ipcRenderer } = window.require('electron');

      const outputBinPath = targetPath;
      try {
        await ToBin(outputPyPath, outputBinPath);

        setStatusMessage(`Successfully saved: ${outputBinPath}`);
        setTimeout(() => setStatusMessage(''), 3000);
        setFileSaved(true);
        setIsProcessing(false);
        setProcessingText('');

        try {
          ToPy(outputBinPath).catch(err => {
            console.warn('Indentation fix failed (non-critical):', err?.message || err);
          });
        } catch (error) {
          console.warn('Indentation fix failed (non-critical):', error?.message || error);
        }
      } catch (err) {
        console.error('RitoBin conversion failed:', err);
        setStatusMessage(`Error converting to .bin format`);
        setFileSaved(false);
        setIsProcessing(false);
        setProcessingText('');
        setShowRitoBinErrorDialog(true);
      }

    } catch (error) {
      console.error('Error saving file:', error);
      setStatusMessage(`Error saving file: ${error.message}`);
      setFileSaved(false);
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  return {
    hasChangesToSave: hasChangesToSaveFn,
    handleSave,
  };
}
