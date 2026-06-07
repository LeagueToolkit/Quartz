/* Windows Explorer context-menu integration. Adds a "Quartz" entry to the
   right-click menu for files and folder backgrounds by writing to the per-user
   registry (HKCU\Software\Classes — no admin rights). Toggle off removes it. */

#[cfg(windows)]
mod imp {
    use winreg::enums::*;
    use winreg::RegKey;

    // Per-user class roots where our verb lives.
    const TARGETS: &[&str] = &[
        r"*\shell\Quartz",                         // all files
        r"Directory\shell\Quartz",                 // folders
        r"Directory\Background\shell\Quartz",      // folder background
    ];

    fn exe() -> Result<String, String> {
        std::env::current_exe()
            .map_err(|e| e.to_string())
            .map(|p| p.to_string_lossy().into_owned())
    }

    pub fn is_enabled() -> Result<bool, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        Ok(hkcu.open_subkey(format!(r"Software\Classes\{}", TARGETS[0])).is_ok())
    }

    pub fn enable() -> Result<(), String> {
        let exe = exe()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for target in TARGETS {
            let (key, _) = hkcu
                .create_subkey(format!(r"Software\Classes\{}", target))
                .map_err(|e| e.to_string())?;
            key.set_value("", &"Open with Quartz").map_err(|e| e.to_string())?;
            key.set_value("Icon", &exe).map_err(|e| e.to_string())?;
            let (cmd, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
            // %V works for background; %1 for files/folders. %V is valid for both.
            cmd.set_value("", &format!("\"{}\" \"%V\"", exe)).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for target in TARGETS {
            // delete_subkey_all removes the verb + its command child.
            let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\{}", target));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn is_enabled() -> Result<bool, String> { Ok(false) }
    pub fn enable() -> Result<(), String> { Err("Context menu integration is Windows-only".into()) }
    pub fn disable() -> Result<(), String> { Ok(()) }
}

#[tauri::command]
pub fn context_menu_is_enabled() -> Result<bool, String> {
    imp::is_enabled()
}

#[tauri::command]
pub fn context_menu_enable() -> Result<(), String> {
    imp::enable()
}

#[tauri::command]
pub fn context_menu_disable() -> Result<(), String> {
    imp::disable()
}
