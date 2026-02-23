# Flint - Troubleshooting Guide

Solutions to common issues you may encounter.

---

## League Path Issues

### "Could not detect League of Legends installation"

**Cause:** Flint couldn't find League automatically.

**Solution:**
1. Open Settings (**Ctrl+,**)
2. Click "Browse" next to League Path
3. Navigate to your League installation
4. Select the `Game` folder (e.g., `C:\Riot Games\League of Legends\Game`)
5. Click "Save"

### "The selected path is not a valid League installation"

**Cause:** The path doesn't contain expected League files.

**Solution:**
- Ensure you selected the `Game` folder, not the parent `League of Legends` folder
- Verify League is installed and the game files exist
- Try running League once to ensure files are downloaded

---

## Hash File Issues

### "Failed to download hash files"

**Cause:** Network issue or CommunityDragon servers unavailable.

**Solution:**
1. Check your internet connection
2. Try again in a few minutes
3. If persistent, manually download hashes:
   - Visit [CommunityDragon](https://raw.communitydragon.org/)
   - Download hash files
   - Place in `%APPDATA%\RitoShark\Requirements\Hashes`

### File paths show as hex hashes instead of names

**Cause:** Hash files not loaded or outdated.

**Solution:**
1. Open Settings (**Ctrl+,**)
2. Click "Reload Hashes"
3. If problem persists, try "Download Hashes" to get latest

---

## Project Issues

### "Failed to create project"

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| No write permission | Choose a different folder (e.g., Documents) |
| Disk full | Free up disk space |
| Path too long | Use a shorter project name or location |
| Champion WAD missing | Verify League installation is complete |

### "Failed to open project"

**Cause:** Project files corrupted or moved.

**Solution:**
1. Verify the project folder still exists
2. Check that `mod.config.json` is present
3. Try creating a new project if files are corrupted

### Project files not showing in tree

**Cause:** File extraction may have failed during project creation.

**Solution:**
1. Delete the project folder
2. Create a new project with the same settings
3. If still failing, check League path in Settings

---

## Export Issues

### "Failed to export Fantome package"

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Output folder not writable | Choose a different output location |
| Disk full | Free up disk space |
| File in use | Close other programs using the output folder |

### Exported mod doesn't work in-game

**Possible causes:**
1. **Wrong League version** - Game files may have updated
2. **File path issues** - Ensure paths weren't corrupted during editing
3. **Mod manager issue** - Try a different mod manager

**Debugging steps:**
1. Extract the `.fantome` file (it's a ZIP)
2. Verify `META/info.json` exists and is valid JSON
3. Check `WAD/` folder contains expected files

---

## Preview Issues

### "Failed to decode texture file"

**Cause:** Unsupported DDS format or corrupted file.

**Solution:**
1. Try viewing the file as hex (right-click > View as Hex)
2. The texture may use an unsupported compression format
3. Try opening the file in another DDS viewer to verify it's valid

### BIN file shows error

**Cause:** BIN file format not recognized.

**Solution:**
1. The file may be a different format with .bin extension
2. Try viewing as hex to inspect contents
3. Report the issue if it's a standard League BIN file

### Preview is blank or frozen

**Solution:**
1. Click another file, then click back
2. Collapse and expand the parent folder
3. Restart Flint if issue persists

---

## Performance Issues

### Flint is slow or unresponsive

**Solutions:**
1. **Large projects:** Wait for file tree to finish loading
2. **Many DDS files:** Flint caches previews, first load is slower
3. **Low memory:** Close other applications

### File tree takes long to load

**Cause:** Large number of extracted files.

**Solution:**
- This is normal for first load
- Subsequent views are cached
- Consider closing unused folders

---

## Error Codes Reference

| Error | Meaning | Solution |
|-------|---------|----------|
| IO error | File system operation failed | Check file permissions and disk space |
| Parse error | File format not recognized | File may be corrupted or unsupported |
| WAD error | WAD file operation failed | Verify League installation |
| Network error | Download failed | Check internet connection |

---

## Getting Help

If your issue isn't listed here:

1. Check the console (F12 > Console tab) for detailed error messages
2. Take note of the exact error message
3. Report the issue with:
   - Error message
   - Steps to reproduce
   - Flint version
   - Windows version
