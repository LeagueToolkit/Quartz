export const JADE_RELEASES_URL = 'https://github.com/LeagueToolkit/Jade-League-Bin-Editor/releases';

export function isJadeMissingResult(result) {
  if (!result) return false;
  const warning = String(result.warning || '').toLowerCase();
  const error = String(result.error || '').toLowerCase();
  const message = `${warning} ${error}`;
  return (
    message.includes('jade executable was not found') ||
    message.includes('executable was not found') ||
    message.includes('set jadeexecutablepath')
  );
}

export function emitJadeMissingModal(reason = '') {
  try {
    window.dispatchEvent(new CustomEvent('interop:jade-missing', { detail: { reason } }));
  } catch {}
}

