import React from 'react';
import CollectionBrowser from './CollectionBrowser';
import UploadModal from './UploadModal';

function VfxHubModalHosts({
  collections,
  modalSize,
  isProcessing,
  hoveredPreview,
  setHoveredPreview,
  download,
  handleMouseDown,
  downloadContentRef,
  saveDownloadScrollPos,
  upload,
  targetSystemEntries,
  setStatusMessage,
}) {
  return (
    <>
      <CollectionBrowser
        open={collections.showDownloadModal}
        modalSize={modalSize}
        isProcessing={isProcessing}
        isLoadingCollections={collections.isLoadingCollections}
        githubConnected={collections.githubConnected}
        searchTerm={collections.searchTerm}
        selectedCategory={collections.selectedCategory}
        currentPage={collections.currentPage}
        totalPages={collections.getTotalPages()}
        filteredSystems={collections.filteredVfxSystems}
        paginatedSystems={collections.getPaginatedVFXSystems()}
        hoveredPreview={hoveredPreview}
        onSetHoveredPreview={setHoveredPreview}
        onSearchTerm={collections.setSearchTerm}
        onSelectedCategory={collections.setSelectedCategory}
        onPage={collections.setCurrentPage}
        onDownload={download.downloadVFXSystem}
        onRefresh={collections.handleRefreshCollections}
        onClose={collections.handleCloseDownloadModal}
        onMouseDownResize={handleMouseDown}
        contentRef={downloadContentRef}
        saveScrollPos={saveDownloadScrollPos}
      />

      <UploadModal
        open={upload.showUploadModal}
        uploadMetadata={upload.uploadMetadata}
        setUploadMetadata={upload.setUploadMetadata}
        targetSystemEntries={targetSystemEntries}
        selectedTargetSystems={upload.selectedTargetSystems}
        onTargetSystemSelection={upload.handleTargetSystemSelection}
        selectedTargetCollection={upload.selectedTargetCollection}
        setSelectedTargetCollection={upload.setSelectedTargetCollection}
        uploadAssets={upload.uploadAssets}
        uploadPreparation={upload.uploadPreparation}
        isProcessing={isProcessing}
        onPrepareUpload={upload.prepareUpload}
        onExecuteUpload={upload.executeUpload}
        onClose={upload.handleCloseUploadModal}
        setStatusMessage={setStatusMessage}
      />
    </>
  );
}

export default React.memo(VfxHubModalHosts);
