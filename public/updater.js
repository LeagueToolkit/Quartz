(() => {
  const loadingView = document.getElementById('loading-view');
  const errorView = document.getElementById('error-view');
  const progressBar = document.getElementById('progress-bar');
  const status = document.getElementById('status');
  const version = document.getElementById('version');
  const errorCopy = document.getElementById('error-copy');
  const continueAnyway = document.getElementById('continue-anyway');

  function show(view) {
    loadingView.hidden = view !== loadingView;
    errorView.hidden = view !== errorView;
  }

  function setLoading(text, percent) {
    show(loadingView);
    status.textContent = text || 'Starting Quartz...';
    if (typeof percent === 'number') {
      progressBar.classList.remove('is-indeterminate');
      progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      progressBar.style.marginLeft = '0';
    } else {
      progressBar.classList.add('is-indeterminate');
      progressBar.style.width = '';
      progressBar.style.marginLeft = '';
    }
  }

  async function waitForTauri() {
    while (!window.__TAURI__) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    return window.__TAURI__;
  }

  waitForTauri().then(async (tauri) => {
    await tauri.event.listen('startup-status', (event) => {
      const payload = event.payload || {};
      setLoading(payload.text, payload.percent);
    });

    tauri.core.invoke('plugin:app|version')
      .then((value) => { version.textContent = `Version ${value}`; })
      .catch(() => {});

    continueAnyway.addEventListener('click', () => {
      continueAnyway.disabled = true;
      tauri.core.invoke('startup_continue').catch(() => { continueAnyway.disabled = false; });
    });

    await tauri.core.invoke('startup_window_ready');
  }).catch((error) => {
    console.error('Quartz startup handshake failed:', error);
    errorCopy.textContent = typeof error === 'string'
      ? error
      : 'The startup service did not respond. You can continue and check for updates later in Settings.';
    show(errorView);
  });
})();
