function registerWadBumpathChannels({
  ipcMain,
  fs,
  getHashPath,
  loadWadModule,
  loadJsRitoModule,
  loadBumpathModule,
}) {
  // WAD extraction handler - Using JavaScript implementation instead of Python backend
  ipcMain.handle('wad:extract', async (_event, data) => {
    try {
      console.log('WAD extraction request received:', JSON.stringify(data, null, 2));

      // Validate required parameters
      if (!data || !data.wadPath || !data.outputDir || data.skinId === undefined || data.skinId === null) {
        console.error('Missing required parameters:', {
          wadPath: data?.wadPath,
          outputDir: data?.outputDir,
          skinId: data?.skinId,
        });
        return { error: 'Missing required parameters: wadPath, outputDir, skinId' };
      }

      // Validate WAD file exists
      if (!fs.existsSync(data.wadPath)) {
        return { error: `WAD file not found: ${data.wadPath}` };
      }

      // Use integrated hash location if not provided
      const hashPath = getHashPath(data.hashPath);
      console.log('Using hash path:', hashPath);

      // Import ES modules
      const { unpackWAD } = await loadWadModule();
      const { loadHashtables } = await loadJsRitoModule();

      // Load hashtables if hash path exists
      let hashtables = null;
      if (hashPath && fs.existsSync(hashPath)) {
        try {
          console.log('Loading hashtables from:', hashPath);
          hashtables = await loadHashtables(hashPath);
          console.log('Hashtables loaded successfully');
        } catch (hashError) {
          console.warn('Failed to load hashtables, continuing without them:', hashError.message);
        }
      } else {
        console.log('No hashtables path provided, files will use hash names');
      }

      // Progress callback
      let lastProgress = 0;
      const progressCallback = (count, message) => {
        if (count > lastProgress + 50 || message) {
          console.log(`[WAD Progress] ${message || `Extracted ${count} files...`}`);
          lastProgress = count;
        }
      };

      // Extract WAD file using JavaScript implementation
      console.log('Starting WAD extraction with JavaScript implementation...');
      const result = await unpackWAD(
        data.wadPath,
        data.outputDir,
        hashtables,
        null, // no filter
        progressCallback
      );

      console.log('WAD extraction completed:', {
        extractedCount: result.extractedCount,
        outputDir: result.outputDir,
        hashedFilesCount: Object.keys(result.hashedFiles || {}).length,
      });

      return {
        success: true,
        extractedCount: result.extractedCount,
        outputDir: result.outputDir,
        hashedFiles: result.hashedFiles || {},
      };
    } catch (error) {
      console.error('WAD extraction error:', error);
      return { error: error.message, stack: error.stack };
    }
  });

  // Bumpath repath handler - Using JavaScript implementation instead of Python backend
  ipcMain.handle('bumpath:repath', async (_event, data) => {
    try {
      console.log('Bumpath repath request received:', JSON.stringify(data, null, 2));

      // Validate required parameters
      if (!data || !data.sourceDir || !data.outputDir || !data.selectedSkinIds) {
        console.error('Missing required parameters:', {
          sourceDir: data?.sourceDir,
          outputDir: data?.outputDir,
          selectedSkinIds: data?.selectedSkinIds,
        });
        return { error: 'Missing required parameters: sourceDir, outputDir, selectedSkinIds' };
      }

      // Validate source directory exists
      if (!fs.existsSync(data.sourceDir)) {
        return { error: `Source directory not found: ${data.sourceDir}` };
      }

      // Use integrated hash location if not provided
      const hashPath = getHashPath(data.hashPath);
      console.log('Using hash path:', hashPath);

      const ignoreMissing = data.ignoreMissing !== false; // Default true
      const combineLinked = data.combineLinked !== false; // Default true
      const customPrefix = data.customPrefix || 'bum';
      const processTogether = data.processTogether || false;

      // Import ES modules
      const { BumpathCore } = await loadBumpathModule();

      // Progress callback
      let lastProgress = 0;
      const progressCallback = (count, message) => {
        if (count > lastProgress + 10 || message) {
          console.log(`[Bumpath Progress] ${message || `Processed ${count} files...`}`);
          lastProgress = count;
        }
      };

      if (processTogether) {
        // Process all skins together
        console.log(`Processing ${data.selectedSkinIds.length} skins together...`);

        const bumInstance = new BumpathCore();

        // Add source directory
        console.log(`Adding source directory: ${data.sourceDir}`);
        await bumInstance.addSourceDirs([data.sourceDir]);

        // Reset all BIN files to unselected
        const binSelections = {};
        for (const unifyFile in bumInstance.sourceBins) {
          binSelections[unifyFile] = false;
        }

        // Select BIN files matching selected skin IDs
        let selectedCount = 0;
        for (const unifyFile in bumInstance.sourceBins) {
          const fileInfo = bumInstance.sourceFiles[unifyFile];
          if (fileInfo && fileInfo.relPath.toLowerCase().endsWith('.bin')) {
            const relPath = fileInfo.relPath.toLowerCase();
            if (relPath.includes('skin')) {
              const skinMatch = relPath.match(/\/skins\/skin(\d+)\.bin/);
              if (skinMatch) {
                const skinId = parseInt(skinMatch[1]);
                if (data.selectedSkinIds.includes(skinId)) {
                  binSelections[unifyFile] = true;
                  selectedCount++;
                  console.log(`  Selected: ${fileInfo.relPath} (skin ${skinId})`);
                }
              }
            }
          }
        }

        bumInstance.updateBinSelection(binSelections);
        console.log(`Marked ${selectedCount} BIN files for skins ${data.selectedSkinIds.join(', ')}`);

        // Scan
        console.log('Scanning BIN files...');
        await bumInstance.scan(hashPath);
        console.log(`Found ${Object.keys(bumInstance.scannedTree).length} entries`);

        // Apply custom prefix if provided
        if (customPrefix !== 'bum') {
          console.log(`Applying custom prefix '${customPrefix}' to all entries...`);
          const allEntryHashes = Object.keys(bumInstance.entryPrefix).filter(hash => hash !== 'All_BINs');
          bumInstance.applyPrefix(allEntryHashes, customPrefix);
          console.log(`Applied prefix to ${allEntryHashes.length} entries`);
        }

        // Process
        console.log('Starting Bumpath process...');
        await bumInstance.process(data.outputDir, ignoreMissing, combineLinked, progressCallback);
        console.log('Bumpath repath completed');

        return {
          success: true,
          message: `Processed ${data.selectedSkinIds.length} skins together`,
        };
      }

      // Process each skin individually
      console.log(`Processing ${data.selectedSkinIds.length} skins individually...`);
      const results = [];
      for (let i = 0; i < data.selectedSkinIds.length; i++) {
        const skinId = data.selectedSkinIds[i];
        console.log(`\n--- Processing skin ${skinId} (${i + 1}/${data.selectedSkinIds.length}) ---`);

        const bumInstance = new BumpathCore();
        await bumInstance.addSourceDirs([data.sourceDir]);

        // Reset all BIN files to unselected
        const binSelections = {};
        for (const unifyFile in bumInstance.sourceBins) {
          binSelections[unifyFile] = false;
        }

        // Select only the current skin's BIN file
        let selectedCount = 0;
        for (const unifyFile in bumInstance.sourceBins) {
          const fileInfo = bumInstance.sourceFiles[unifyFile];
          if (fileInfo && fileInfo.relPath.toLowerCase().endsWith('.bin')) {
            const relPath = fileInfo.relPath.toLowerCase();
            if (relPath.includes('skin')) {
              const skinMatch = relPath.match(/\/skins\/skin(\d+)\.bin/);
              if (skinMatch) {
                const currentSkinId = parseInt(skinMatch[1]);
                if (currentSkinId === skinId) {
                  binSelections[unifyFile] = true;
                  selectedCount++;
                  console.log(`  Selected: ${fileInfo.relPath} (skin ${currentSkinId})`);
                }
              }
            }
          }
        }

        bumInstance.updateBinSelection(binSelections);
        console.log(`Marked ${selectedCount} BIN files for skin ${skinId}`);

        // Scan
        console.log(`Scanning BIN files for skin ${skinId}...`);
        await bumInstance.scan(hashPath);
        console.log(`Found ${Object.keys(bumInstance.scannedTree).length} entries`);

        // Apply custom prefix if provided
        if (customPrefix !== 'bum') {
          console.log(`Applying custom prefix '${customPrefix}' to all entries...`);
          const allEntryHashes = Object.keys(bumInstance.entryPrefix).filter(hash => hash !== 'All_BINs');
          bumInstance.applyPrefix(allEntryHashes, customPrefix);
        }

        // Process
        console.log(`Starting Bumpath process for skin ${skinId}...`);
        await bumInstance.process(data.outputDir, ignoreMissing, combineLinked, progressCallback);
        console.log(`Completed skin ${skinId}`);

        results.push({ skinId, success: true });
      }

      console.log('Bumpath repath completed for all skins');
      return {
        success: true,
        message: `Processed ${data.selectedSkinIds.length} skins individually`,
        results,
      };
    } catch (error) {
      console.error('Bumpath repath error:', error);
      return { error: error.message, stack: error.stack };
    }
  });
}

module.exports = {
  registerWadBumpathChannels,
};
