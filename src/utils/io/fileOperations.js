// Import necessary Node.js modules for Electron
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

// Import utility functions
let Prefs, CreateMessage, Sleep;

// Fallback implementations
Prefs = {
  obj: {
    PreferredMode: 'random',
    Targets: [false, false, false, false, true],

    IgnoreBW: true
  },
  PreferredMode: () => { },
  Targets: () => { },
  IgnoreBW: () => { }
};

CreateMessage = (options, callback) => {
  console.log('Message:', options);
  if (callback) callback();
};

Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Try to load Node-level utils if available
try {
  if (window.require) {
    // Suppress console error if modules not found
    try {
      const utils = window.require('./javascript/utils.js');
      if (utils) {
        if (utils.Prefs) Prefs = utils.Prefs;
        if (utils.CreateMessage) CreateMessage = utils.CreateMessage;
        if (utils.Sleep) Sleep = utils.Sleep;
      }
    } catch (e) {
      // Ignore
    }
  }
} catch (error) {
  // Ignore
}

// Set fallback implementations if modules couldn't be loaded
if (!Prefs) {
  Prefs = {
    obj: {
      PreferredMode: 'random',

      Targets: [false, false, false, false, true],
      IgnoreBW: true
    },
    PreferredMode: () => { },
    Targets: () => { },
    IgnoreBW: () => { }
  };
}

if (!CreateMessage) {
  CreateMessage = (options, callback) => {
    console.log('Message:', options);
    if (callback) callback();
  };
}

if (!Sleep) {
  Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}


// File operation utilities
const ToPy = async (filePath) => {
  try {
    if (!filePath) throw new Error('File path missing');
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('ritobin:toPy', { filePath });
    if (!result.success) throw new Error(result.error);
    return result.method === 'native' ? "Native conversion successful" : "Conversion successful";
  } catch (error) {
    console.error('Error in ToPy:', error);
    throw new Error(`Ritobin conversion failed: ${error.message || 'Unknown error'}`);
  }
};

const ToPyWithPath = async (selectedFilePath) => {
  try {
    if (!selectedFilePath) throw new Error('File path missing');
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('ritobin:toPy', { filePath: selectedFilePath });
    if (!result.success) throw new Error(result.error);

    const pyFilePath = selectedFilePath.replace(/\.bin$/i, '.py');
    return fs.readFileSync(pyFilePath, 'utf8');
  } catch (error) {
    console.error('Error in ToPyWithPath:', error);
    throw new Error(`Ritobin conversion failed: ${error.message || 'Unknown error'}`);
  }
};

const ToBin = async (pyPath, filePath) => {
  try {
    if (!pyPath || !filePath) throw new Error('Missing required paths for conversion');
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('ritobin:toBin', { pyPath, binPath: filePath });
    if (!result.success) throw new Error(result.error);
    return result.method === 'native' ? "Native execution successful" : "Execution successful";
  } catch (error) {
    console.error('[ToBin] Error in ToBin:', error);
    throw new Error(`Bin conversion failed: ${error.message}`);
  }
};

export {
  ToPy,
  ToPyWithPath,
  ToBin
}; 