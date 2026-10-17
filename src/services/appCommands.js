// Commands triggered from the title-bar menu or its keyboard shortcuts.
import { requestUpdateCheck } from './updates';

const NAV = { newModel: 'Creation', models: 'Models', settings: 'Settings', tutorial: 'Tutorial' };

export function runAppCommand(cmd) {
  if (NAV[cmd]) window.dispatchEvent(new CustomEvent('tempo:navigate', { detail: NAV[cmd] }));
  else if (cmd === 'tour') window.dispatchEvent(new Event('tempo:restart-tour'));
  else if (cmd === 'whatsNew') window.dispatchEvent(new Event('tempo:whats-new'));
  else if (cmd === 'checkUpdates') requestUpdateCheck();
  else window.electronAPI?.window?.action(cmd);
}
