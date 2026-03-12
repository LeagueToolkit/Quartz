import React from 'react';
import CollectionBrowser from './CollectionBrowser';
import UploadModal from './UploadModal';
import localHubService from '../services/localHubService.js';

function VfxHubModalHosts({
  collections,
  localCollections,
  modalSize,
  isProcessing,
  hoveredPreview,
  setHoveredPreview,
  download,
  localDownload,
  handleMouseDown,
  downloadContentRef,
  saveDownloadScrollPos,
  upload,
  localUpload,
  targetSystemEntries,
  setStatusMessage,
  onOpenGitHubUpload,
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
        onUpload={onOpenGitHubUpload}
        uploadLabel="Upload to GitHub"
        onRefresh={collections.handleRefreshCollections}
        onClose={collections.handleCloseDownloadModal}
        onMouseDownResize={handleMouseDown}
        contentRef={downloadContentRef}
        saveScrollPos={saveDownloadScrollPos}
        onDeleteSystem={null}
      />

      <CollectionBrowser
        open={localCollections.showDownloadModal}
        modalSize={modalSize}
        isProcessing={isProcessing}
        isLoadingCollections={localCollections.isLoadingCollections}
        githubConnected={true}
        searchTerm={localCollections.searchTerm}
        selectedCategory={localCollections.selectedCategory}
        currentPage={localCollections.currentPage}
        totalPages={localCollections.getTotalPages()}
        filteredSystems={localCollections.filteredVfxSystems}
        paginatedSystems={localCollections.getPaginatedVFXSystems()}
        hoveredPreview={hoveredPreview}
        onSetHoveredPreview={setHoveredPreview}
        onSearchTerm={localCollections.setSearchTerm}
        onSelectedCategory={localCollections.setSelectedCategory}
        onPage={localCollections.setCurrentPage}
        onDownload={localDownload.downloadVFXSystem}
        onRefresh={localCollections.handleRefreshCollections}
        onClose={localCollections.handleCloseDownloadModal}
        onMouseDownResize={handleMouseDown}
        contentRef={downloadContentRef}
        saveScrollPos={saveDownloadScrollPos}
        title="Local Hub Collections"
        categories={localCollections.categoryOptions}
        onCreateCategory={localCollections.handleCreateCategory}
        onDeleteCategory={localCollections.handleDeleteCategory}
        onDeleteSystem={localCollections.handleDeleteSystem}
        onUpload={localUpload.handleUploadToLocalHub}
        uploadLabel="Upload to Local Hub"
        loadingText="Loading local VFX collections..."
        emptyText="No local VFX effects found"
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

      <UploadModal
        open={localUpload.showUploadModal}
        uploadMetadata={localUpload.uploadMetadata}
        setUploadMetadata={localUpload.setUploadMetadata}
        targetSystemEntries={targetSystemEntries}
        selectedTargetSystems={localUpload.selectedTargetSystems}
        onTargetSystemSelection={localUpload.handleTargetSystemSelection}
        selectedTargetCollection={localUpload.selectedTargetCollection}
        setSelectedTargetCollection={localUpload.setSelectedTargetCollection}
        uploadAssets={localUpload.uploadAssets}
        uploadPreparation={localUpload.uploadPreparation}
        isProcessing={isProcessing}
        onPrepareUpload={localUpload.prepareUpload}
        onExecuteUpload={localUpload.executeUpload}
        onClose={localUpload.handleCloseUploadModal}
        setStatusMessage={setStatusMessage}
        collectionOptions={localUpload.collectionOptions}
        categoryOptions={localUpload.categoryOptions}
        showCategoryField={false}
        onUploadPreview={async (base64, effectName, extension) => {
          await localHubService.uploadPreview(base64, effectName, extension);
          await localCollections.loadLocalCollections();
        }}
      />
    </>
  );
}

export default React.memo(VfxHubModalHosts);
