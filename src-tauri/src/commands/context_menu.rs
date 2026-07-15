/* Windows Explorer context-menu integration. Adds a "Quartz" submenu to the
right-click menu for the relevant file types and folders by writing to the
per-user registry (HKCU\Software\Classes — no admin). Each entry launches the
app exe with a convert verb (handled headlessly by cli_convert), so there's
no sidecar binary. Toggle off removes everything. */

#[cfg(windows)]
mod imp {
    use winreg::enums::*;
    use winreg::RegKey;

    /// A single child verb inside the Quartz submenu.
    struct Verb {
        /// Ordered key name (the leading digits control menu order).
        key: &'static str,
        /// Label shown in Explorer.
        label: &'static str,
        /// Convert verb passed to the app exe.
        verb: &'static str,
        /// Start a visual group with a separator above this item.
        separator: bool,
    }

    /// One `<ext>\shell\Quartz` (or Directory\shell\Quartz) submenu root.
    struct Menu {
        /// Registry subkey under Software\Classes that owns the submenu.
        root: &'static str,
        verbs: &'static [Verb],
        /// `%1` for files, `%V` for folder/background.
        arg: &'static str,
    }

    const fn v(key: &'static str, label: &'static str, verb: &'static str) -> Verb {
        Verb {
            key,
            label,
            verb,
            separator: false,
        }
    }
    const fn vs(key: &'static str, label: &'static str, verb: &'static str) -> Verb {
        Verb {
            key,
            label,
            verb,
            separator: true,
        }
    }

    // ── File menus ──────────────────────────────────────────────────────────
    // Full 1:1 parity with the old Explorer menu. Every verb here is backed by
    // a ritoshark/quartz-lib implementation in cli_convert.rs.
    const BIN: &[Verb] = &[
        v("00topy", "Convert to .py", "to-py"),
        // VFX group.
        vs("10separatevfx", "Separate VFX", "separate-vfx"),
        v("11combinevfx", "Combine VFX", "combine-vfx"),
        // Animation group.
        vs("20separateanm", "Separate Animations", "separate-anm"),
        v("21combineanm", "Combine Animations", "combine-anm"),
        // General tools group.
        vs("30combinelinked", "Combine Linked", "combine-linked"),
        v("31noskinlite", "NoSkinLite", "noskinlite"),
        v("32batchsplitvfx", "Batch Split VFX", "batch-split-vfx"),
        // Hash extraction (last group).
        vs("99extracthashesbin", "Extract hashes", "extract-hashes-bin"),
    ];
    const PY: &[Verb] = &[v("01tobin", "Convert to .bin", "to-bin")];
    const MESH: &[Verb] = &[
        v("01xps2fbx", "Convert XPS to .fbx", "xps2fbx"),
        v(
            "02xps2fbxdir",
            "Batch: Convert all XPS in this folder",
            "xps2fbxdir",
        ),
    ];
    const PMX: &[Verb] = &[
        v("01pmx2fbx", "Convert PMX to .fbx", "pmx2fbx"),
        v(
            "02pmx2fbxdir",
            "Batch: Convert all PMX in this folder",
            "pmx2fbxdir",
        ),
    ];
    const WAD: &[Verb] = &[
        v(
            "01extracthashes",
            "WadTool: Extract hashes",
            "extract-hashes-wad",
        ),
        v("02unpackwad", "WadTool: Unpack WAD", "unpack-wad"),
        vs(
            "03extractunpack",
            "WadTool: Extract hashes + Unpack",
            "extract-unpack-wad",
        ),
    ];
    const TEX: &[Verb] = &[
        v("01tex2dds", "QuartzTex: Convert to .dds", "tex2dds"),
        v("02tex2png", "QuartzTex: Convert to .png", "tex2png"),
    ];
    const DDS: &[Verb] = &[
        v("01dds2tex", "QuartzTex: Convert to .tex", "dds2tex"),
        v("02dds2png", "QuartzTex: Convert to .png", "dds2png"),
    ];
    const PNG: &[Verb] = &[
        v("01png2tex", "QuartzTex: Convert to .tex", "png2tex"),
        v("02png2dds", "QuartzTex: Convert to .dds", "png2dds"),
    ];
    const SKN: &[Verb] = &[v("01inspectmodel", "Inspect Model", "--inspect-model")];

    // ── Folder menu ─────────────────────────────────────────────────────────
    const DIR: &[Verb] = &[
        v(
            "00ritobindir2py",
            "ritobin: Convert all BIN to PY",
            "ritobindir2py",
        ),
        v(
            "01ritobindir2bin",
            "ritobin: Convert all PY to BIN",
            "ritobindir2bin",
        ),
        v(
            "02extracthashesbindir",
            "ritobin: Extract hashes from BIN folder",
            "extract-hashes-bin-dir",
        ),
        vs(
            "03pyntexmissing",
            "pyntex: Check missing files",
            "pyntex-missing",
        ),
        v(
            "04pyntexdeljunk",
            "pyntex: Remove junk files",
            "pyntex-deljunk",
        ),
        vs("10tex2ddsdir", "QuartzTex: All .tex to .dds", "tex2ddsdir"),
        v("11dds2texdir", "QuartzTex: All .dds to .tex", "dds2texdir"),
        v("12tex2pngdir", "QuartzTex: All .tex to .png", "tex2pngdir"),
        v("13dds2pngdir", "QuartzTex: All .dds to .png", "dds2pngdir"),
        v("14png2texdir", "QuartzTex: All .png to .tex", "png2texdir"),
        v("15png2ddsdir", "QuartzTex: All .png to .dds", "png2ddsdir"),
        vs(
            "20packwadclient",
            "WadTool: Pack to .wad.client",
            "pack-wad",
        ),
    ];

    const MENUS: &[Menu] = &[
        Menu {
            root: r"SystemFileAssociations\.bin\shell\Quartz",
            verbs: BIN,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.py\shell\Quartz",
            verbs: PY,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.tex\shell\Quartz",
            verbs: TEX,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.dds\shell\Quartz",
            verbs: DDS,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.png\shell\Quartz",
            verbs: PNG,
            arg: "%1",
        },
        // Model → FBX (XPS shares .mesh/.xps/.ascii; PMX its own).
        Menu {
            root: r"SystemFileAssociations\.mesh\shell\Quartz",
            verbs: MESH,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.xps\shell\Quartz",
            verbs: MESH,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.ascii\shell\Quartz",
            verbs: MESH,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.pmx\shell\Quartz",
            verbs: PMX,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.skn\shell\Quartz",
            verbs: SKN,
            arg: "%1",
        },
        // WAD tools. `.wad.client` is seen by Windows both as `.wad.client`
        // and as the bare `.client` extension, so all three are registered.
        Menu {
            root: r"SystemFileAssociations\.wad\shell\Quartz",
            verbs: WAD,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.wad.client\shell\Quartz",
            verbs: WAD,
            arg: "%1",
        },
        Menu {
            root: r"SystemFileAssociations\.client\shell\Quartz",
            verbs: WAD,
            arg: "%1",
        },
        Menu {
            root: r"Directory\shell\Quartz",
            verbs: DIR,
            arg: "%V",
        },
    ];

    fn exe() -> Result<String, String> {
        std::env::current_exe()
            .map_err(|e| e.to_string())
            .map(|p| p.to_string_lossy().into_owned())
    }

    pub fn is_enabled() -> Result<bool, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        Ok(MENUS.iter().all(|menu| {
            hkcu.open_subkey(format!(r"Software\Classes\{}", menu.root))
                .is_ok()
        }))
    }

    pub fn enable() -> Result<(), String> {
        // Clean first so removed/renamed verbs from older versions don't linger.
        disable()?;

        let exe = exe()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        for menu in MENUS {
            let base = format!(r"Software\Classes\{}", menu.root);
            let (root_key, _) = hkcu.create_subkey(&base).map_err(|e| e.to_string())?;
            root_key
                .set_value("MUIVerb", &"Quartz")
                .map_err(|e| e.to_string())?;
            root_key
                .set_value("Icon", &exe)
                .map_err(|e| e.to_string())?;
            // Empty SubCommands makes Explorer read the child `shell\*` verbs.
            root_key
                .set_value("SubCommands", &"")
                .map_err(|e| e.to_string())?;

            for verb in menu.verbs {
                let vkey_path = format!(r"{}\shell\{}", base, verb.key);
                let (vkey, _) = hkcu.create_subkey(&vkey_path).map_err(|e| e.to_string())?;
                vkey.set_value("MUIVerb", &verb.label)
                    .map_err(|e| e.to_string())?;
                vkey.set_value("Icon", &exe).map_err(|e| e.to_string())?;
                if verb.separator {
                    // 0x20 = SECColumn / start a new group with a separator above.
                    vkey.set_value("CommandFlags", &0x20u32)
                        .map_err(|e| e.to_string())?;
                }
                let (cmd, _) = vkey.create_subkey("command").map_err(|e| e.to_string())?;
                cmd.set_value("", &format!("\"{}\" {} \"{}\"", exe, verb.verb, menu.arg))
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for menu in MENUS {
            let _ = hkcu.delete_subkey_all(format!(r"Software\Classes\{}", menu.root));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn is_enabled() -> Result<bool, String> {
        Ok(false)
    }
    pub fn enable() -> Result<(), String> {
        Err("Context menu integration is Windows-only".into())
    }
    pub fn disable() -> Result<(), String> {
        Ok(())
    }
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
