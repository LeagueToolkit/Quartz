import { extractExistingPersistentConditions, insertMultiplePersistentEffects } from '../../../utils/vfx/mutations/persistentEffectsManager.js';
import { hasChangesToSave } from './save/pyContentMerge';
import { generateModifiedPythonFromSystems, loadEmitterData } from '../../../utils/vfx/vfxEmitterParser.js';

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
      const { spawn } = window.require('child_process');

      let ritoBinPath = null;
      try {
        ritoBinPath = await electronPrefs.get('RitoBinPath');
        if (!ritoBinPath) {
          const settings = ipcRenderer.sendSync('get-ssx');
          ritoBinPath = settings[0]?.RitoBinPath;
        }
      } catch {
        try {
          const settings = ipcRenderer.sendSync('get-ssx');
          ritoBinPath = settings[0]?.RitoBinPath;
        } catch {}
      }

      if (!ritoBinPath) {
        setStatusMessage('Error: RitoBin path not configured. Please configure it in Settings.');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      const outputBinPath = targetPath;
      const convertProcess = spawn(ritoBinPath, [outputPyPath, outputBinPath]);

      let hasStderrError = false;
      let stderrContent = '';

      convertProcess.stdout.on('data', () => {});
      convertProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderrContent += text;
        if (text.includes('Error:') || text.includes('error')) hasStderrError = true;
      });

      convertProcess.on('close', (code) => {
        const hasError = code !== 0 || hasStderrError;

        if (!hasError) {
          setStatusMessage(`Successfully saved: ${outputBinPath}`);
          setTimeout(() => setStatusMessage(''), 3000);
          setFileSaved(true);
          setIsProcessing(false);
          setProcessingText('');

          try {
            const binToPyProcess = spawn(ritoBinPath, [outputBinPath, outputPyPath]);
            binToPyProcess.stdout.on('data', () => {});
            binToPyProcess.stderr.on('data', () => {});
            binToPyProcess.on('close', () => {});
          } catch (error) {
            console.warn('Indentation fix failed (non-critical):', error?.message || error);
          }
        } else {
          console.error('RitoBin conversion failed:', stderrContent);
          const errorReason = hasStderrError ? 'RitoBin reported errors in stderr' : `exit code: ${code}`;
          setStatusMessage(`Error converting to .bin format (${errorReason})`);
          setFileSaved(false);
          setIsProcessing(false);
          setProcessingText('');
          setShowRitoBinErrorDialog(true);
        }
      });

      convertProcess.on('error', (error) => {
        console.error('Error running RitoBin:', error);
        setStatusMessage(`Error running RitoBin: ${error.message}`);
        setFileSaved(false);
        setIsProcessing(false);
        setProcessingText('');
      });
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
