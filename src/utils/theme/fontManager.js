import electronPrefs from '../core/electronPrefs.js';

class FontManager {
  constructor() {
    this.fontsDirectory = this.getFontsDirectoryPath();
    this.availableFonts = [];
    this.lastScanTime = 0;
    this.currentFont = 'system';
    this.initialized = false;
    this.fontApplied = false; // Track if a custom font is actually applied
    
    // Try to get current font from CSS if available
    if (typeof document !== 'undefined') {
      const currentFontFamily = document.documentElement.style.getPropertyValue('--app-font-family');
      if (currentFontFamily) {
        // Extract font name from CSS font family
        const fontMatch = currentFontFamily.match(/'([^']+)'/);
        if (fontMatch) {
          this.currentFont = fontMatch[1];
          this.fontApplied = true;
          console.log('🔄 Detected existing font from CSS:', this.currentFont);
        }
      }
    }
  }

  getUserDataBasePath() {
    if (typeof process === 'undefined') return null;

    if (process.platform === 'win32') {
      return process.env.APPDATA || process.env.USERPROFILE || process.env.HOME || null;
    }
    if (process.platform === 'darwin') {
      return process.env.HOME ? `${process.env.HOME}/Library/Preferences` : null;
    }
    return process.env.XDG_DATA_HOME || (process.env.HOME ? `${process.env.HOME}/.local/share` : null);
  }

  getFontsDirectoryPath() {
    const basePath = this.getUserDataBasePath();
    if (!basePath) return null;

    if (window.require) {
      try {
        const path = window.require('path');
        return path.join(basePath, 'Quartz', 'fonts');
      } catch (error) {
        console.warn('Error resolving fonts directory path, using fallback:', error);
      }
    }

    return `${basePath}/Quartz/fonts`;
  }

  async init() {
    try {
      console.log('Initializing FontManager...');
      await electronPrefs.initPromise;
      await this.scanFonts();
      
      // Try multiple sources for the saved font (preference is most reliable)
      const savedFont = electronPrefs.obj.SelectedFont;
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      const domFont = document.documentElement.getAttribute('data-current-font');
      
      console.log('💾 Font sources - Prefs:', savedFont, 'LocalStorage:', localStorageFont, 'DOM:', domFont);
      
      // Use the most reliable source (preference > localStorage > DOM > current)
      // Prefer saved preference first, then DOM, then localStorage, then current
      const fontToApply = savedFont || domFont || localStorageFont || this.currentFont;
      
      if (fontToApply) {
        // 'system' is treated as Segoe UI by applyFont, so always call through
        const effectiveName = fontToApply === 'system' ? 'Segoe UI' : fontToApply;
        const fontExists = this.availableFonts.some(f => f.name === effectiveName);
        if (fontExists) {
          console.log('🔄 Applying saved font on init:', fontToApply);
          await this.applyFont(fontToApply);
        } else {
          console.log('⚠️ Saved font not found, falling back to Segoe UI:', fontToApply);
          await this.applyFont('Segoe UI');
        }
      } else {
        await this.applyFont('Segoe UI');
      }
      
      this.initialized = true;
      console.log('FontManager initialized with font:', this.currentFont, 'applied:', this.fontApplied);
    } catch (error) {
      console.error('FontManager init error:', error);
      this.initialized = true; // Mark as initialized even if there was an error
      this.currentFont = 'system';
      this.fontApplied = false;
    }
  }

  // New method to ensure font persistence across navigation
  async ensureFontPersistence() {
    try {
      // Check if we have a saved font preference
      const savedFont = electronPrefs.obj.SelectedFont;
      const currentDomFont = document.documentElement.getAttribute('data-current-font');
      const cssFont = document.documentElement.style.getPropertyValue('--app-font-family');
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      
      // If there's a saved font but it's not currently applied, reapply it
      // 'system' is treated as Segoe UI so always reapply when DOM doesn't match
      const effectiveSaved = savedFont === 'system' ? 'Segoe UI' : savedFont;
      if (effectiveSaved && currentDomFont !== effectiveSaved) {
        await this.applyFont(savedFont);
        return true;
      }

      // If there's a localStorage font but DOM doesn't match, reapply it
      const effectiveLocal = localStorageFont === 'system' ? 'Segoe UI' : localStorageFont;
      if (effectiveLocal && currentDomFont !== effectiveLocal) {
        await this.applyFont(localStorageFont);
        return true;
      }
      
      // If CSS variable exists but DOM attribute doesn't, sync them
      if (cssFont && !currentDomFont) {
        const fontMatch = cssFont.match(/'([^']+)'/);
        if (fontMatch && fontMatch[1] !== 'system') {
          document.documentElement.setAttribute('data-current-font', fontMatch[1]);
          this.currentFont = fontMatch[1];
          this.fontApplied = true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error ensuring font persistence:', error);
      return false;
    }
  }

  async scanFonts() {
    // System fonts that are commonly available on Windows/Mac/Linux
    const commonSystemFonts = [
      { name: 'system', displayName: 'System Default' },
      // Windows fonts
      { name: 'Segoe UI', displayName: 'Segoe UI', isSystem: true },
      { name: 'Consolas', displayName: 'Consolas (Mono)', isSystem: true },
      { name: 'Cascadia Code', displayName: 'Cascadia Code (Mono)', isSystem: true },
      { name: 'Arial', displayName: 'Arial', isSystem: true },
      { name: 'Verdana', displayName: 'Verdana', isSystem: true },
      { name: 'Tahoma', displayName: 'Tahoma', isSystem: true },
      { name: 'Trebuchet MS', displayName: 'Trebuchet MS', isSystem: true },
      { name: 'Georgia', displayName: 'Georgia', isSystem: true },
      { name: 'Calibri', displayName: 'Calibri', isSystem: true },
      { name: 'Cambria', displayName: 'Cambria', isSystem: true },
      { name: 'Lucida Console', displayName: 'Lucida Console (Mono)', isSystem: true },
      { name: 'Courier New', displayName: 'Courier New (Mono)', isSystem: true },
      // Mac fonts
      { name: 'SF Pro', displayName: 'SF Pro (Mac)', isSystem: true },
      { name: 'SF Mono', displayName: 'SF Mono (Mac)', isSystem: true },
      { name: 'Menlo', displayName: 'Menlo (Mac Mono)', isSystem: true },
      { name: 'Monaco', displayName: 'Monaco (Mac Mono)', isSystem: true },
      { name: 'Helvetica Neue', displayName: 'Helvetica Neue', isSystem: true },
      // Linux fonts
      { name: 'Ubuntu', displayName: 'Ubuntu', isSystem: true },
      { name: 'Ubuntu Mono', displayName: 'Ubuntu Mono', isSystem: true },
      { name: 'DejaVu Sans', displayName: 'DejaVu Sans', isSystem: true },
      { name: 'DejaVu Sans Mono', displayName: 'DejaVu Sans Mono', isSystem: true },
      // Common web-safe fonts
      { name: 'Comic Sans MS', displayName: 'Comic Sans MS', isSystem: true },
      { name: 'Impact', displayName: 'Impact', isSystem: true },
      { name: 'Palatino Linotype', displayName: 'Palatino', isSystem: true },
    ];
    
    this.availableFonts = [...commonSystemFonts];
    
    if (!window.require) return;
    
    try {
      const fs = window.require('fs');
      const path = window.require('path');
      if (!this.fontsDirectory) return;
      
      const fontsPath = path.resolve(this.fontsDirectory);
      if (!fs.existsSync(fontsPath)) {
        fs.mkdirSync(fontsPath, { recursive: true });
        return;
      }
      
      const files = fs.readdirSync(fontsPath);
      const fontFiles = files.filter(file => 
        /\.(ttf|otf|woff|woff2)$/i.test(file)
      );
      
      for (const file of fontFiles) {
        const name = path.basename(file, path.extname(file));
        let displayName = name.replace(/[-_]/g, ' ');
        let fontFamily = name;
        
        // Handle special font names that need specific font-family declarations
        // Good readable fonts for UI/code work
        const specialFonts = {
          // Retro/Pixel fonts
          'PressStart2P': 'Press Start 2P',
          'pressstart2p': 'Press Start 2P',
          'press-start-2p': 'Press Start 2P',
          
          // Monospace - excellent for code and data
          'JetBrainsMono': 'JetBrains Mono',
          'jetbrainsmono': 'JetBrains Mono',
          'jetbrains-mono': 'JetBrains Mono',
          'SourceCodePro': 'Source Code Pro',
          'sourcecodepro': 'Source Code Pro',
          'source-code-pro': 'Source Code Pro',
          'FiraCode': 'Fira Code',
          'firacode': 'Fira Code',
          'fira-code': 'Fira Code',
          'CascadiaCode': 'Cascadia Code',
          'cascadiacode': 'Cascadia Code',
          'cascadia-code': 'Cascadia Code',
          'CascadiaMono': 'Cascadia Mono',
          'cascadiamono': 'Cascadia Mono',
          'Consolas': 'Consolas',
          'consolas': 'Consolas',
          'Inconsolata': 'Inconsolata',
          'inconsolata': 'Inconsolata',
          'UbuntuMono': 'Ubuntu Mono',
          'ubuntumono': 'Ubuntu Mono',
          'ubuntu-mono': 'Ubuntu Mono',
          'RobotoMono': 'Roboto Mono',
          'robotomono': 'Roboto Mono',
          'roboto-mono': 'Roboto Mono',
          'IBMPlexMono': 'IBM Plex Mono',
          'ibmplexmono': 'IBM Plex Mono',
          'ibm-plex-mono': 'IBM Plex Mono',
          'HackFont': 'Hack',
          'hack': 'Hack',
          
          // Sans-serif - clean and modern
          'Inter': 'Inter',
          'inter': 'Inter',
          'Roboto': 'Roboto',
          'roboto': 'Roboto',
          'OpenSans': 'Open Sans',
          'opensans': 'Open Sans',
          'open-sans': 'Open Sans',
          'Lato': 'Lato',
          'lato': 'Lato',
          'Nunito': 'Nunito',
          'nunito': 'Nunito',
          'NunitoSans': 'Nunito Sans',
          'nunitosans': 'Nunito Sans',
          'nunito-sans': 'Nunito Sans',
          'Poppins': 'Poppins',
          'poppins': 'Poppins',
          'Montserrat': 'Montserrat',
          'montserrat': 'Montserrat',
          'Outfit': 'Outfit',
          'outfit': 'Outfit',
          'SpaceGrotesk': 'Space Grotesk',
          'spacegrotesk': 'Space Grotesk',
          'space-grotesk': 'Space Grotesk',
          'Manrope': 'Manrope',
          'manrope': 'Manrope',
          'Lexend': 'Lexend',
          'lexend': 'Lexend',
          'Geist': 'Geist',
          'geist': 'Geist',
          'GeistMono': 'Geist Mono',
          'geistmono': 'Geist Mono',
          'geist-mono': 'Geist Mono',
          
          // Gaming/Stylized fonts
          'Orbitron': 'Orbitron',
          'orbitron': 'Orbitron',
          'Rajdhani': 'Rajdhani',
          'rajdhani': 'Rajdhani',
          'Audiowide': 'Audiowide',
          'audiowide': 'Audiowide',
          'Oxanium': 'Oxanium',
          'oxanium': 'Oxanium',
          'Exo2': 'Exo 2',
          'exo2': 'Exo 2',
          'exo-2': 'Exo 2',
          'Michroma': 'Michroma',
          'michroma': 'Michroma',
          'ShareTechMono': 'Share Tech Mono',
          'sharetechmono': 'Share Tech Mono',
          'share-tech-mono': 'Share Tech Mono',
          'VT323': 'VT323',
          'vt323': 'VT323',
          'PixelifySans': 'Pixelify Sans',
          'pixelifysans': 'Pixelify Sans',
          'pixelify-sans': 'Pixelify Sans'
        };
        
        // Check if this is a special font that needs a specific font-family name
        const lowerName = name.toLowerCase();
        for (const [key, value] of Object.entries(specialFonts)) {
          if (lowerName.includes(key.toLowerCase())) {
            fontFamily = value;
            displayName = value;
            break;
          }
        }
        
        this.availableFonts.push({
          name: fontFamily, // Use the proper font family name
          displayName,
          file,
          originalFileName: name // Keep original for debugging
        });
      }
      
      // Keep logging concise

      this.lastScanTime = Date.now();
    } catch (error) {
      console.error('Error scanning fonts:', error);
    }
  }

  async getAvailableFonts() {
    if (!this.initialized) await this.init();
    // Return cached list by default to avoid repeated filesystem scans in Settings
    if (this.availableFonts.length === 0) {
      await this.scanFonts();
    }
    return this.availableFonts;
  }

  async applyFont(fontName) {
    try {
      // Treat 'system' as Segoe UI (Windows system default)
      if (fontName === 'system') fontName = 'Segoe UI';

      // Fast-path: if already applied, no-op
      const domCurrent = document.documentElement.getAttribute('data-current-font');
      if (domCurrent === fontName) {
        this.currentFont = fontName;
        this.fontApplied = true;
        return true;
      }
      // Remove existing font styles
      const existingStyles = document.querySelectorAll('[id^="font-"]');
      existingStyles.forEach(style => style.remove());
      
      if (fontName === 'system') {
        // Reset to system font
        
        // Remove any existing custom font styles
        const existingStyles = document.querySelectorAll('style[data-font-style]');
        existingStyles.forEach(style => style.remove());
        
        // Reset CSS variables to system defaults
        document.documentElement.style.removeProperty('--app-font-family');
        document.documentElement.removeAttribute('data-current-font');
        
        // Remove from localStorage
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('frogsaw-current-font');
        }
        
        // Dispatch global font change event
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { 
            fontName: 'system', 
            fontFamily: 'var(--app-font-family), "Roboto", "Helvetica", "Arial", sans-serif' 
          }
        }));
        
        this.currentFont = 'system';
        this.fontApplied = false;
        
        // Save to preferences with error handling
        try {
          await electronPrefs.set('SelectedFont', 'system');
        } catch (error) {
          console.error('❌ Error saving system font preference:', error);
        }
        
        return true;
      }
      
      const font = this.availableFonts.find(f => f.name === fontName);
      if (!font) {
        console.warn('❌ Font not found:', fontName);
        return false;
      }
      
      // Handle system fonts (no file needed)
      if (font.isSystem || !font.file) {
        const style = document.createElement('style');
        style.id = `font-${fontName.replace(/\s+/g, '-')}`;
        style.setAttribute('data-font-style', 'true');
        
        style.textContent = `
          /* Global font application with high specificity */
          html {
            --app-font-family: '${fontName}', 'Segoe UI', sans-serif;
          }
          
          /* Apply to all elements */
          *, *::before, *::after {
            font-family: '${fontName}', 'Segoe UI', sans-serif !important;
          }
          
          /* Specific Material-UI overrides */
          .MuiTypography-root,
          .MuiButton-root,
          .MuiTextField-root input,
          .MuiTextField-root textarea,
          .MuiSelect-root,
          .MuiMenuItem-root,
          .MuiFormLabel-root,
          .MuiInputBase-root,
          .MuiOutlinedInput-root,
          .MuiCard-root,
          .MuiCardContent-root,
          .MuiBox-root,
          .MuiGrid-root {
            font-family: '${fontName}', 'Segoe UI', sans-serif !important;
          }
          
          /* Navigation and header elements */
          nav, header, .navigation, .navbar,
          .MuiAppBar-root, .MuiToolbar-root,
          .MuiDrawer-root, .MuiList-root,
          .MuiListItem-root, .MuiListItemText-root {
            font-family: '${fontName}', 'Segoe UI', sans-serif !important;
          }
          
          /* Form elements */
          input, textarea, select, button, label {
            font-family: '${fontName}', 'Segoe UI', sans-serif !important;
          }
        `;
        
        document.head.appendChild(style);
        
        // Apply font globally
        document.documentElement.style.setProperty('--app-font-family', `'${fontName}', 'Segoe UI', sans-serif`);
        document.documentElement.setAttribute('data-current-font', fontName);
        
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('frogsaw-current-font', fontName);
        }
        document.body.setAttribute('data-current-font', fontName);
        
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { fontName, fontFamily: `'${fontName}', 'Segoe UI', sans-serif` }
        }));
        
        this.currentFont = fontName;
        this.fontApplied = true;
        
        try {
          await electronPrefs.set('SelectedFont', fontName);
        } catch (error) {
          console.error('❌ Error saving font preference:', error);
        }
        
        console.log('✅ System font applied:', fontName);
        return true;
      }
      
      if (!window.require) {
        console.warn('❌ Electron environment not available');
        return false;
      }
      
      try {
        // Read font file as base64 to bypass Electron file URL restrictions
        const fs = window.require('fs');
        const path = window.require('path');
        if (!this.fontsDirectory) return false;
        
        const fontPath = path.resolve(this.fontsDirectory, font.file);
        
        const fontBuffer = fs.readFileSync(fontPath);
        const fontBase64 = fontBuffer.toString('base64');
        
        // Determine MIME type based on file extension
        const ext = path.extname(font.file).toLowerCase();
        let mimeType = 'font/truetype';
        if (ext === '.woff') mimeType = 'font/woff';
        else if (ext === '.woff2') mimeType = 'font/woff2';
        else if (ext === '.otf') mimeType = 'font/opentype';
        
        const dataUrl = `data:${mimeType};base64,${fontBase64}`;
        console.log('📊 Font data URL created, size:', Math.round(fontBase64.length / 1024), 'KB');
        
        // Create font face declaration with base64 data
        const style = document.createElement('style');
        style.id = `font-${fontName.replace(/\s+/g, '-')}`;
        style.setAttribute('data-font-style', 'true');
        
        // No size adjustments - use original font size
        
        style.textContent = `
          @font-face {
            font-family: '${fontName}';
            src: url('${dataUrl}');
            font-display: swap;
            font-weight: normal;
            font-style: normal;
          }
          
          /* Global font application with high specificity */
          html {
            --app-font-family: '${fontName}', 'Courier New', monospace;
          }
          
          /* Apply to all elements */
          *, *::before, *::after {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
          
          /* Specific Material-UI overrides */
          .MuiTypography-root,
          .MuiButton-root,
          .MuiTextField-root input,
          .MuiTextField-root textarea,
          .MuiSelect-root,
          .MuiMenuItem-root,
          .MuiFormLabel-root,
          .MuiInputBase-root,
          .MuiOutlinedInput-root,
          .MuiCard-root,
          .MuiCardContent-root,
          .MuiBox-root,
          .MuiGrid-root {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
          
          /* Navigation and header elements */
          nav, header, .navigation, .navbar,
          .MuiAppBar-root, .MuiToolbar-root,
          .MuiDrawer-root, .MuiList-root,
          .MuiListItem-root, .MuiListItemText-root {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
          
          /* Form elements */
          input, textarea, select, button, label {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
        `;
        
        document.head.appendChild(style);
        console.log('📝 Added base64 font CSS to head');
        
        // Wait for font to load
        await new Promise((resolve) => {
          if (document.fonts && document.fonts.load) {
            document.fonts.load(`16px "${fontName}"`).then(() => {
              console.log('✅ Font loaded via Font Loading API');
              resolve();
            }).catch(() => {
              console.log('⚠️ Font Loading API failed, using timeout');
              setTimeout(resolve, 500);
            });
          } else {
            setTimeout(resolve, 500);
          }
        });
        
        // Apply font globally by setting CSS custom property with persistence
        document.documentElement.style.setProperty('--app-font-family', `'${fontName}', 'Courier New', monospace`);
        document.documentElement.setAttribute('data-current-font', fontName);
        
        // Store in localStorage as backup
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('frogsaw-current-font', fontName);
        }
        
        // Also set a data attribute on the body for additional persistence
        document.body.setAttribute('data-current-font', fontName);
        
        // Dispatch global font change event for React components to pick up
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { 
            fontName: fontName, 
            fontFamily: `'${fontName}', 'Courier New', monospace` 
          }
        }));
        
        console.log('📡 Dispatched global font change event');
        
        this.currentFont = fontName;
        this.fontApplied = true;
        
        // Save to preferences with error handling
        try {
          await electronPrefs.set('SelectedFont', fontName);
          console.log('💾 Font preference saved:', fontName);
        } catch (error) {
          console.error('❌ Error saving font preference:', error);
        }
        
        console.log('✅ Font successfully applied:', fontName);
        return true;
      } catch (error) {
        console.error('❌ Error applying font:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ Error in applyFont:', error);
      return false;
    }
  }

  openFontsFolder() {
    if (!window.require) return;
    
    try {
      const { shell } = window.require('electron');
      const path = window.require('path');
      if (!this.fontsDirectory) return;
      const fontsPath = path.resolve(this.fontsDirectory);
      shell.openPath(fontsPath);
      console.log('📁 Opened fonts folder:', fontsPath);
    } catch (error) {
      console.error('Error opening fonts folder:', error);
    }
  }

  async refreshFonts() {
    await this.scanFonts();
    console.log('🔄 Fonts refreshed');
    return this.availableFonts;
  }

  getCurrentFont() {
    return this.currentFont;
  }

  // Get the currently applied font from the DOM (most reliable)
  getCurrentlyAppliedFont() {
    if (typeof document !== 'undefined') {
      const domFont = document.documentElement.getAttribute('data-current-font');
      const bodyFont = document.body.getAttribute('data-current-font');
      const cssFont = document.documentElement.style.getPropertyValue('--app-font-family');
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      
      // Check multiple sources in order of reliability
      if (domFont && domFont !== 'system') {
        return domFont;
      } else if (bodyFont && bodyFont !== 'system') {
        return bodyFont;
      } else if (cssFont) {
        // Extract font name from CSS font family
        const fontMatch = cssFont.match(/'([^']+)'/);
        if (fontMatch && fontMatch[1] !== 'system') {
          return fontMatch[1];
        }
      } else if (localStorageFont && localStorageFont !== 'system') {
        return localStorageFont;
      }
    }
    
    // Fallback to internal state
    return this.currentFont;
  }

  isFontApplied(fontName) {
    return this.fontApplied && this.currentFont === fontName;
  }

  // Force reapply the current font (useful when font gets reset)
  async forceReapplyCurrentFont() {
    try {
      const savedFont = electronPrefs.obj.SelectedFont;
      if (savedFont && savedFont !== 'system') {
        console.log('🔄 Force reapplying current font:', savedFont);
        await this.applyFont(savedFont);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error force reapplying font:', error);
      return false;
    }
  }
}

export default new FontManager();
