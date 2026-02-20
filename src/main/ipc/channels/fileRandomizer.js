function registerFileRandomizerChannels({ ipcMain, fs, path, processRef }) {
  ipcMain.handle('filerandomizer:createBackup', async (_event, { targetFolder }) => {
    try {
      console.log('Creating backup of target folder:', targetFolder);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFolder = path.join(path.dirname(targetFolder), `backup_${path.basename(targetFolder)}_${timestamp}`);

      if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder, { recursive: true });
      }

      const copyFolder = (src, dest) => {
        if (fs.statSync(src).isDirectory()) {
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          const files = fs.readdirSync(src);
          files.forEach((file) => {
            const srcPath = path.join(src, file);
            const destPath = path.join(dest, file);
            copyFolder(srcPath, destPath);
          });
        } else {
          fs.copyFileSync(src, dest);
        }
      };

      copyFolder(targetFolder, backupFolder);
      return { success: true, backupPath: backupFolder };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('filerandomizer:discoverFiles', async (_event, { targetFolder, replacementFiles, smartNameMatching, filterMode, filterKeywords, scanSubdirectories }) => {
    try {
      const isRenaming = !replacementFiles || replacementFiles.length === 0;

      console.log('Smart name matching:', smartNameMatching);
      console.log('Filter mode:', filterMode);
      console.log('Filter keywords:', filterKeywords);

      if (!targetFolder || !fs.existsSync(targetFolder)) {
        throw new Error('Target folder does not exist or is invalid');
      }

      const targetPath = path.resolve(targetFolder);
      const userProfile = processRef.env.USERPROFILE || processRef.env.HOME;
      const userProfilePath = path.resolve(userProfile);

      if (!targetPath.startsWith(userProfilePath)) {
        throw new Error('Target folder must be within your user profile directory for safety');
      }

      const discoveredFiles = {};
      let totalFiles = 0;
      let filteredFiles = 0;

      const keywords = filterKeywords ? filterKeywords.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k) : [];

      const shouldIncludeFile = (fileName) => {
        if (keywords.length === 0) return true;
        const fileNameLower = fileName.toLowerCase();
        const hasKeyword = keywords.some((keyword) => fileNameLower.includes(keyword));
        return filterMode === 'skip' ? !hasKeyword : hasKeyword;
      };

      let targetExtensions = [];
      if (isRenaming) {
        targetExtensions = null;
      } else {
        targetExtensions = [...new Set(replacementFiles.map((f) => f.extension))];
      }

      const scanDirectory = (dir) => {
        try {
          if (!fs.existsSync(dir)) return;

          const items = fs.readdirSync(dir);
          for (const item of items) {
            try {
              const fullPath = path.join(dir, item);
              const stat = fs.statSync(fullPath);

              if (stat.isDirectory()) {
                const skipPatterns = [
                  'node_modules', '.git', 'backup_', 'temp', 'tmp',
                  'AppData', 'ProgramData', 'Windows', 'System32', 'Program Files',
                  '$Recycle.Bin', 'System Volume Information', 'Recovery',
                  'Local Settings', 'Application Data', 'LocalLow',
                ];
                const shouldSkip = skipPatterns.some((skip) =>
                  item.toLowerCase().includes(skip.toLowerCase()) ||
                  fullPath.toLowerCase().includes(skip.toLowerCase()),
                );

                if (!shouldSkip && fullPath.startsWith(userProfilePath)) {
                  if (scanSubdirectories) {
                    scanDirectory(fullPath);
                  }
                }
              } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase();

                let shouldProcessFile = false;
                if (isRenaming) {
                  shouldProcessFile = true;
                } else {
                  shouldProcessFile = targetExtensions.includes(ext);
                }

                if (shouldProcessFile) {
                  if (shouldIncludeFile(item)) {
                    if (!discoveredFiles[ext]) {
                      discoveredFiles[ext] = [];
                    }
                    discoveredFiles[ext].push(fullPath);
                    totalFiles++;
                  } else {
                    filteredFiles++;
                  }
                }
              }
            } catch (_itemError) {
              continue;
            }
          }
        } catch (_dirError) {
          // ignore unreadable dirs
        }
      };

      scanDirectory(targetFolder);

      return { success: true, discoveredFiles, totalFiles, filteredFiles };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('filerandomizer:replaceFiles', async (event, { replacementFiles, discoveredFiles, smartNameMatching }) => {
    try {
      let replacedCount = 0;
      const errors = [];
      let totalFiles = 0;

      Object.values(discoveredFiles).forEach((files) => {
        totalFiles += files.length;
      });

      const baseNameToReplacement = new Map();

      for (const [extension, filePaths] of Object.entries(discoveredFiles)) {
        const extensionReplacementFiles = replacementFiles.filter((f) => f.extension === extension);
        if (extensionReplacementFiles.length === 0) {
          continue;
        }

        for (let i = 0; i < filePaths.length; i++) {
          const filePath = filePaths[i];
          try {
            let selectedReplacement;

            if (smartNameMatching) {
              const fileName = path.basename(filePath, extension);
              const baseName = fileName.replace(/_[^_]*$/, '');
              if (baseNameToReplacement.has(baseName)) {
                selectedReplacement = baseNameToReplacement.get(baseName);
              } else {
                selectedReplacement = extensionReplacementFiles[Math.floor(Math.random() * extensionReplacementFiles.length)];
                baseNameToReplacement.set(baseName, selectedReplacement);
              }
            } else {
              const randomIndex = Math.floor(Math.random() * extensionReplacementFiles.length);
              selectedReplacement = extensionReplacementFiles[randomIndex];
            }

            fs.copyFileSync(selectedReplacement.path, filePath);
            replacedCount++;

            if (replacedCount % 10 === 0 || replacedCount === totalFiles) {
              event.sender.send('filerandomizer:progress', {
                current: replacedCount,
                total: totalFiles,
                percentage: Math.round((replacedCount / totalFiles) * 100),
              });
            }
          } catch (error) {
            errors.push({ file: filePath, error: error.message });
          }
        }
      }

      return { success: true, replacedCount, errors };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('filerandomizer:stop', async () => {
    try {
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('filerandomizer:renameFiles', async (event, { textToFind, textToReplaceWith, prefixToAdd, suffixToAdd, discoveredFiles }) => {
    try {
      let renamedCount = 0;
      const errors = [];
      let totalFiles = 0;

      Object.values(discoveredFiles).forEach((files) => {
        totalFiles += files.length;
      });

      for (const [_extension, filePaths] of Object.entries(discoveredFiles)) {
        for (let i = 0; i < filePaths.length; i++) {
          const filePath = filePaths[i];
          try {
            const dir = path.dirname(filePath);
            const oldFileName = path.basename(filePath);
            let newFileName = oldFileName;

            if (textToFind && textToReplaceWith !== undefined) {
              newFileName = oldFileName.replace(new RegExp(textToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), textToReplaceWith || '');
            }

            if (prefixToAdd) {
              newFileName = prefixToAdd + newFileName;
            }

            if (suffixToAdd) {
              const lastDotIndex = newFileName.lastIndexOf('.');
              if (lastDotIndex !== -1) {
                newFileName = newFileName.substring(0, lastDotIndex) + suffixToAdd + newFileName.substring(lastDotIndex);
              } else {
                newFileName += suffixToAdd;
              }
            }

            if (newFileName === oldFileName) {
              continue;
            }

            const newFilePath = path.join(dir, newFileName);
            if (fs.existsSync(newFilePath)) {
              continue;
            }

            fs.renameSync(filePath, newFilePath);
            renamedCount++;

            if (renamedCount % 10 === 0 || renamedCount === totalFiles) {
              event.sender.send('filerandomizer:progress', {
                current: renamedCount,
                total: totalFiles,
                percentage: Math.round((renamedCount / totalFiles) * 100),
              });
            }
          } catch (error) {
            errors.push({ file: filePath, error: error.message });
          }
        }
      }

      return { success: true, renamedCount, errors };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerFileRandomizerChannels };

