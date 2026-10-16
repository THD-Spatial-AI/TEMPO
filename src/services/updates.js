// Ask the UpdateNotifier to run a manual update check.
export function requestUpdateCheck() {
  window.dispatchEvent(new Event('tempo:check-updates'));
}
