import React from 'react';
import MatrixEditorModal from './modals/MatrixEditorModal';
import { extractVFXSystem } from '../../../utils/vfx/vfxSystemParser.js';
import { upsertSystemMatrix, replaceSystemBlockInFile } from '../../../utils/vfx/mutations/matrixUtils.js';

const VfxMatrixEditorAdapter = ({
  showMatrixModal,
  setShowMatrixModal,
  matrixModalState,
  setMatrixModalState,
  targetSystems,
  setTargetSystems,
  targetPyContent,
  setTargetPyContent,
  setFileSaved,
  saveStateToHistory,
}) => {
  if (!showMatrixModal) return null;
  return (
    <MatrixEditorModal
      open={showMatrixModal}
      initialMatrix={matrixModalState.initial}
      onApply={(mat) => {
        try {
          const sys = targetSystems[matrixModalState.systemKey];
          if (!sys) { setShowMatrixModal(false); return; }
          saveStateToHistory(`Update matrix for "${sys.name}"`);
          const currentSysText = sys.rawContent || extractVFXSystem(targetPyContent, sys.key)?.fullContent || '';
          const updatedSystemText = upsertSystemMatrix(currentSysText, mat);
          const updatedFile = replaceSystemBlockInFile(targetPyContent || '', sys.key, updatedSystemText);
          setTargetPyContent(updatedFile);
          try { setFileSaved(false); } catch { }
          setTargetSystems(prev => {
            const copy = { ...prev };
            const old = copy[matrixModalState.systemKey];
            if (old) copy[matrixModalState.systemKey] = { ...old, rawContent: updatedSystemText };
            return copy;
          });
        } catch (err) {
          console.error('Apply matrix failed:', err);
        } finally {
          setShowMatrixModal(false);
          setMatrixModalState({ systemKey: null, initial: null });
        }
      }}
      onClose={() => {
        setShowMatrixModal(false);
        setMatrixModalState({ systemKey: null, initial: null });
      }}
    />
  );
};

export default VfxMatrixEditorAdapter;
