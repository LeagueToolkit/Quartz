import React from 'react';
import { CircularProgress, IconButton, Tooltip } from '@mui/material';
import { Apps as AppsIcon, Add as AddIcon, Folder as FolderIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';

function VfxFloatingActions({
  targetPyContent,
  isProcessing,
  handleOpenBackupViewer,
  handleOpenPersistent,
  handleOpenNewSystemModal,
  hasResourceResolver,
  hasSkinCharacterData,
  placement = 'left',
  showPortAllButton = false,
  onPortAll,
  isPortAllLoading = false,
  disablePortAll = false,
  portAllTooltip = 'Port All VFX Systems',
}) {
  if (!targetPyContent || isProcessing) return null;

  const tooltipProps = placement === 'top'
    ? { placement: 'top', componentsProps: { tooltip: { sx: { pointerEvents: 'none' } } } }
    : { placement: 'left' };

  return (
    <>
      <Tooltip title="Backup History" arrow {...tooltipProps}>
        <IconButton
          onClick={handleOpenBackupViewer}
          aria-label="View Backup History"
          sx={{
            position: 'fixed',
            bottom: 130,
            right: 24,
            width: 40,
            height: 40,
            borderRadius: '50%',
            zIndex: 4500,
            background: 'rgba(147, 51, 234, 0.15)',
            color: '#c084fc',
            border: '1px solid rgba(147, 51, 234, 0.3)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(147, 51, 234, 0.2)',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(147, 51, 234, 0.3)',
              background: 'rgba(147, 51, 234, 0.25)',
              border: '1px solid rgba(147, 51, 234, 0.5)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <FolderIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Persistent Effects" arrow {...tooltipProps}>
        <IconButton
          onClick={handleOpenPersistent}
          aria-label="Open Persistent Effects"
          disabled={!hasResourceResolver || !hasSkinCharacterData}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            width: 40,
            height: 40,
            borderRadius: '50%',
            zIndex: 4500,
            background: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.06)' : 'rgba(34, 197, 94, 0.15)',
            color: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.35)' : '#4ade80',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(34, 197, 94, 0.2)',
            '&:hover': {
              transform: (!hasResourceResolver || !hasSkinCharacterData) ? 'none' : 'translateY(-2px)',
              boxShadow: (!hasResourceResolver || !hasSkinCharacterData)
                ? '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(34, 197, 94, 0.2)'
                : '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(34, 197, 94, 0.3)',
              background: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.06)' : 'rgba(34, 197, 94, 0.25)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <AppsIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="New VFX System" arrow {...tooltipProps}>
        <IconButton
          onClick={handleOpenNewSystemModal}
          aria-label="Create New VFX System"
          disabled={!hasResourceResolver}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 72,
            width: 40,
            height: 40,
            borderRadius: '50%',
            zIndex: 4500,
            background: !hasResourceResolver ? 'rgba(255,255,255,0.06)' : 'rgba(236, 185, 106, 0.15)',
            color: !hasResourceResolver ? 'rgba(255,255,255,0.35)' : '#fbbf24',
            border: '1px solid rgba(236, 185, 106, 0.3)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(236, 185, 106, 0.2)',
            '&:hover': {
              transform: !hasResourceResolver ? 'none' : 'translateY(-2px)',
              boxShadow: !hasResourceResolver
                ? '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(236, 185, 106, 0.2)'
                : '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(236, 185, 106, 0.3)',
              background: !hasResourceResolver ? 'rgba(255,255,255,0.06)' : 'rgba(236, 185, 106, 0.25)',
              border: '1px solid rgba(236, 185, 106, 0.5)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <AddIcon sx={{ fontSize: 20, fontWeight: 700 }} />
        </IconButton>
      </Tooltip>

      {showPortAllButton && (
        <Tooltip
          title={isPortAllLoading ? 'Porting all systems...' : portAllTooltip}
          arrow
          {...tooltipProps}
        >
          <IconButton
            onClick={onPortAll}
            aria-label="Port All VFX Systems"
            disabled={disablePortAll || isPortAllLoading}
            sx={{
              position: 'fixed',
              bottom: 80,
              right: 120,
              width: 40,
              height: 40,
              borderRadius: '50%',
              zIndex: 4500,
              background: (disablePortAll || isPortAllLoading) ? 'rgba(255,255,255,0.06)' : 'rgba(59, 130, 246, 0.15)',
              color: (disablePortAll || isPortAllLoading) ? 'rgba(255,255,255,0.35)' : '#3b82f6',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(59, 130, 246, 0.2)',
              '&:hover': {
                transform: (disablePortAll || isPortAllLoading) ? 'none' : 'translateY(-2px)',
                boxShadow: (disablePortAll || isPortAllLoading)
                  ? '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(59, 130, 246, 0.2)'
                  : '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(59, 130, 246, 0.3)',
                background: (disablePortAll || isPortAllLoading) ? 'rgba(255,255,255,0.06)' : 'rgba(59, 130, 246, 0.25)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
              },
              transition: 'all 0.2s ease',
            }}
          >
            {isPortAllLoading ? (
              <CircularProgress size={18} sx={{ color: '#3b82f6' }} />
            ) : (
              <ArrowBackIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      )}
    </>
  );
}

export default React.memo(VfxFloatingActions);
