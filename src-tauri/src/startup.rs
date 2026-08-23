use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(12);
const UPDATE_INSTALL_TIMEOUT: Duration = Duration::from_secs(300);
const MIN_STARTUP_VISIBLE: Duration = Duration::from_millis(1800);

#[derive(Default)]
pub struct StartupGate {
    started: AtomicBool,
    launch_allowed: AtomicBool,
    frontend_ready: AtomicBool,
    resolved: AtomicBool,
    /// Whether the once-a-day hash sync has already been spawned this run.
    ///
    /// `startup_main_ready` can fire more than once - React StrictMode double-mounts the
    /// effect that calls it in development - and without this each call spawned its own sync
    /// task. Two concurrent tasks then downloaded and tried to swap the SAME `data.mdb`,
    /// which is the duplicate "Hash download complete" pair ~9s apart in the logs.
    hash_sync_started: AtomicBool,
}

impl StartupGate {
    pub fn is_resolved(&self) -> bool {
        self.resolved.load(Ordering::Acquire)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupStatus {
    text: String,
    percent: Option<f32>,
}

fn emit_status(app: &AppHandle, text: impl Into<String>, percent: Option<f32>) {
    let _ = app.emit_to(
        "updater",
        "startup-status",
        StartupStatus {
            text: text.into(),
            percent,
        },
    );
}

fn try_reveal_main(app: &AppHandle) {
    let Some(gate) = app.try_state::<StartupGate>() else {
        tracing::error!("startup gate state is unavailable");
        return;
    };
    if !gate.launch_allowed.load(Ordering::Acquire) || !gate.frontend_ready.load(Ordering::Acquire)
    {
        return;
    }
    let Some(main) = app.get_webview_window("main") else {
        tracing::error!("startup gate could not find the main window");
        return;
    };
    if gate.resolved.swap(true, Ordering::AcqRel) {
        return;
    }

    tracing::info!("startup gates resolved; revealing the fully initialized main window");
    emit_status(app, "Quartz is ready", Some(100.0));

    if let Err(error) = main.show() {
        gate.resolved.store(false, Ordering::Release);
        tracing::error!("startup gate could not show the main window: {error}");
        return;
    }
    let _ = main.unminimize();
    let _ = main.set_focus();

    if let Some(updater) = app.get_webview_window("updater") {
        if let Err(error) = updater.close() {
            tracing::warn!("failed to close startup window: {error}");
            let _ = updater.hide();
        }
    }
}

fn allow_main_launch(app: &AppHandle) {
    if let Some(gate) = app.try_state::<StartupGate>() {
        gate.launch_allowed.store(true, Ordering::Release);
        tracing::info!("startup update gate resolved");
    }
    try_reveal_main(app);
}

async fn finish_without_update(app: &AppHandle, text: &str, started: Instant) {
    emit_status(app, text, Some(92.0));
    let remaining = MIN_STARTUP_VISIBLE
        .checked_sub(started.elapsed())
        .unwrap_or(Duration::from_millis(280));
    tokio::time::sleep(remaining).await;
    allow_main_launch(app);
}

async fn install_checked_update(app: &AppHandle, update: Update) -> Result<String, String> {
    let version = update.version.clone();
    let total = Arc::new(AtomicU64::new(0));
    let downloaded = Arc::new(AtomicU64::new(0));
    let callback_app = app.clone();
    let callback_total = Arc::clone(&total);
    let callback_downloaded = Arc::clone(&downloaded);
    let callback_version = version.clone();
    let finished_app = app.clone();
    let finished_version = version.clone();

    emit_status(app, format!("Preparing Quartz v{version}..."), Some(0.0));
    let download = update.download_and_install(
        move |chunk_length, content_length| {
            if let Some(length) = content_length {
                callback_total.store(length, Ordering::Relaxed);
            }
            let current = callback_downloaded.fetch_add(chunk_length as u64, Ordering::Relaxed)
                + chunk_length as u64;
            let length = callback_total.load(Ordering::Relaxed);
            let percent = (length > 0).then(|| (current as f32 / length as f32) * 100.0);
            emit_status(
                &callback_app,
                format!("Downloading Quartz v{callback_version}..."),
                percent,
            );
        },
        move || {
            emit_status(
                &finished_app,
                format!("Installing Quartz v{finished_version}..."),
                Some(100.0),
            );
        },
    );

    tokio::time::timeout(UPDATE_INSTALL_TIMEOUT, download)
        .await
        .map_err(|_| "The update download timed out. Please try again later.".to_string())?
        .map_err(|error| format!("Update installation failed: {error}"))?;

    Ok(version)
}

async fn run_startup(app: AppHandle) {
    let started = Instant::now();
    emit_status(&app, "Loading Quartz settings...", Some(16.0));
    tokio::time::sleep(Duration::from_millis(130)).await;
    emit_status(&app, "Preparing bundled tools...", Some(34.0));
    tokio::time::sleep(Duration::from_millis(130)).await;

    #[cfg(debug_assertions)]
    {
        finish_without_update(&app, "Preparing Quartz interface...", started).await;
        return;
    }

    #[cfg(not(debug_assertions))]
    {
        if !crate::commands::settings::auto_update_enabled() {
            tracing::info!("automatic startup updates are disabled in Settings");
            finish_without_update(&app, "Preparing Quartz interface...", started).await;
            return;
        }

        emit_status(&app, "Checking for updates...", None);

        let updater = match app.updater() {
            Ok(updater) => updater,
            Err(error) => {
                tracing::warn!("startup updater unavailable: {error}");
                finish_without_update(&app, "Starting Quartz offline...", started).await;
                return;
            }
        };

        let check = tokio::time::timeout(UPDATE_CHECK_TIMEOUT, updater.check()).await;
        match check {
            Ok(Ok(Some(update))) => {
                tracing::info!("startup update available: {}", update.version);
                match install_checked_update(&app, update).await {
                    Ok(version) => {
                        emit_status(
                            &app,
                            format!("Quartz v{version} installed - restarting..."),
                            Some(100.0),
                        );
                        tokio::time::sleep(Duration::from_millis(700)).await;
                        app.restart();
                    }
                    Err(error) => {
                        tracing::warn!("automatic startup update failed: {error}");
                        finish_without_update(
                            &app,
                            "Update could not be installed - starting Quartz...",
                            started,
                        )
                        .await;
                    }
                }
            }
            Ok(Ok(None)) => {
                finish_without_update(&app, "Quartz is up to date", started).await;
            }
            Ok(Err(error)) => {
                tracing::warn!("startup update check failed: {error}");
                finish_without_update(&app, "Starting Quartz offline...", started).await;
            }
            Err(_) => {
                tracing::warn!(
                    "startup update check timed out after {} seconds",
                    UPDATE_CHECK_TIMEOUT.as_secs()
                );
                finish_without_update(&app, "Update check timed out - starting Quartz...", started)
                    .await;
            }
        }
    }
}

#[tauri::command]
pub fn startup_window_ready(app_handle: AppHandle, gate: State<'_, StartupGate>) {
    if gate.started.swap(true, Ordering::AcqRel) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        run_startup(app_handle).await;
    });
}

/// Called by the hidden main WebView only after settings/theme hydration and a
/// successful React commit. The updater gate must also be resolved before the
/// main window can become visible.
#[tauri::command]
pub fn startup_main_ready(app_handle: AppHandle, gate: State<'_, StartupGate>) {
    gate.frontend_ready.store(true, Ordering::Release);
    tracing::info!("startup frontend-ready handshake received");
    try_reveal_main(&app_handle);
    // Once per run, however many times the handshake arrives. Revealing the window is
    // idempotent; spawning the sync is not - a second task races the first for the same
    // data.mdb swap.
    if !gate.hash_sync_started.swap(true, Ordering::AcqRel) {
        spawn_hash_auto_sync(app_handle);
    }
}

/* Check for newer hash databases in the background, at most once a day.
Ported from the Electron build, which ran the same check on boot behind a 24h
cooldown; this one had no startup sync at all, so a machine kept whatever
snapshot it first installed until someone happened to click "Reload hashes".
Months-old hashes silently fail to name anything Riot shipped since, which
reads as data missing from a WAD rather than as a stale lookup table.

Spawned AFTER the main window is revealed and never awaited: it must not delay
launch, and a failure (offline, rate-limited) must leave the app working with
the hashes already on disk. */
fn spawn_hash_auto_sync(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Ok(hash_dir) = quartz_lib::hash::get_hash_dir() else {
            return;
        };
        /* A FIRST RUN downloads too.
           This used to return early when the databases were absent, on the
           assumption that "the existing download prompts handle that" — but the
           only prompt is a card inside WAD Explorer, so anyone who never opened
           that page sat with no hashes at all: files listed as hex, `file =`
           references unresolvable, and errors that read as missing data rather
           than a missing lookup table. Nothing else ever fetched them.

           Downloading here is the same work the user would have to trigger by
           hand. Nothing else needs changing for it: the freshness gate already
           reports "not fresh" when a database is absent, and the per-asset skip
           requires the file to exist, so a missing (or half-installed) pair is
           always fetched even when the release tag already matches. */
        if !quartz_lib::hash::hashes_present(&hash_dir) {
            tracing::info!("Hash databases missing; downloading them on startup");
        }

        /* Throttle the progress events rather than emitting one per network
        chunk. A ~70 MB asset arrives in thousands of chunks and each emit
        crosses the IPC boundary and re-renders the indicator; at one per
        percent the bar still looks smooth and the cost disappears. */
        let last_percent = std::sync::atomic::AtomicU64::new(u64::MAX);
        let handle = app_handle.clone();
        let progress = move |p: quartz_lib::hash::HashProgress| {
            let percent = if p.total > 0 {
                p.received.saturating_mul(100) / p.total
            } else {
                0
            };
            if last_percent.swap(percent, std::sync::atomic::Ordering::Relaxed) == percent {
                return;
            }
            let _ = handle.emit("hash-sync-progress", &p);
        };

        let stats = quartz_lib::hash::auto_sync(&hash_dir, progress).await;
        match stats {
            Some(s) if s.downloaded > 0 => {
                // Re-open the WAD env so the new names resolve without a restart.
                quartz_lib::hash::drop_lmdb_cache();
                let _ = quartz_lib::hash::get_wad_env(&hash_dir.to_string_lossy());
                let _ = app_handle.emit("hash-sync-done", s.downloaded);
            }
            // Fresh, already up to date, or failed: nothing downloaded, so the
            // indicator just clears.
            _ => {
                let _ = app_handle.emit("hash-sync-done", 0u64);
            }
        }
    });
}

#[tauri::command]
pub fn startup_continue(app_handle: AppHandle) {
    tracing::info!("startup fallback continued by the user");
    allow_main_launch(&app_handle);
}

#[tauri::command]
pub async fn startup_install_update(app_handle: AppHandle) -> Result<(), String> {
    emit_status(&app_handle, "Checking update package...", None);

    let updater = app_handle
        .updater()
        .map_err(|error| format!("Updater is unavailable: {error}"))?;
    let update = tokio::time::timeout(UPDATE_CHECK_TIMEOUT, updater.check())
        .await
        .map_err(|_| "The update check timed out. Please try again.".to_string())?
        .map_err(|error| format!("Update check failed: {error}"))?
        .ok_or_else(|| "The update is no longer available.".to_string())?;

    let version = install_checked_update(&app_handle, update).await?;

    emit_status(
        &app_handle,
        format!("Quartz v{version} installed - restarting..."),
        Some(100.0),
    );
    tokio::time::sleep(Duration::from_millis(700)).await;
    app_handle.restart();
}
