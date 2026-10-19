// Custom title bar for the frameless Electron window: app menus + window controls.
import { useEffect, useRef, useState } from 'react';
import { LuMinimize, LuMaximize, LuRestore, LuX } from './ui/icons';
import { runAppCommand } from '../services/appCommands';
import tempoLogo from '../assets/Logo_TEMPO.PNG';

const MENUS = [
  { label: 'File', items: [
    ['New model', 'newModel', 'Ctrl+N'], ['Models', 'models'], null,
    ['Settings', 'settings', 'Ctrl+,'], null, ['Exit', 'quit', 'Ctrl+Q'],
  ] },
  { label: 'Edit', items: [
    ['Undo', 'undo', 'Ctrl+Z'], ['Redo', 'redo', 'Ctrl+Shift+Z'], null,
    ['Cut', 'cut', 'Ctrl+X'], ['Copy', 'copy', 'Ctrl+C'], ['Paste', 'paste', 'Ctrl+V'], ['Select all', 'selectAll', 'Ctrl+A'],
  ] },
  { label: 'View', items: [
    ['Reload', 'reload', 'Ctrl+R'], ['Developer tools', 'devtools', 'Ctrl+Shift+I'], null,
    ['Actual size', 'zoomReset', 'Ctrl+0'], ['Zoom in', 'zoomIn', 'Ctrl+='], ['Zoom out', 'zoomOut', 'Ctrl+-'], null,
    ['Full screen', 'fullscreen', 'F11'],
  ] },
  { label: 'Window', items: [['Minimize', 'minimize'], ['Maximize / restore', 'maximize'], null, ['Close', 'close']] },
  { label: 'Help', items: [
    ['Guided tour of this page', 'tour'], ['Tutorial', 'tutorial'], ["What's new", 'whatsNew'], null,
    ['Check for updates…', 'checkUpdates'], ['Release notes on GitHub', 'releaseNotes'],
  ] },
];

const noDrag = { WebkitAppRegion: 'no-drag' };

export default function TitleBar() {
  const api = window.electronAPI?.window;
  const [open, setOpen] = useState(null);
  const [win, setWin] = useState({ maximized: false, fullscreen: false, version: '' });
  const barRef = useRef(null);

  useEffect(() => {
    if (!api) return undefined;
    api.state().then((s) => setWin((w) => ({ ...w, ...s })));
    const offState = api.onStateChange((s) => setWin((w) => ({ ...w, ...s })));
    const offCmd = api.onCommand(runAppCommand);
    return () => { offState(); offCmd(); };
  }, [api]);

  useEffect(() => {
    document.documentElement.style.setProperty('--titlebar-h', api && !win.fullscreen ? '36px' : '0px');
  }, [api, win.fullscreen]);

  useEffect(() => {
    if (open == null) return undefined;
    const onDown = (e) => { if (!barRef.current?.contains(e.target)) setOpen(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!api || win.fullscreen) return null;

  const run = (cmd) => { setOpen(null); runAppCommand(cmd); };

  return (
    <header
      ref={barRef}
      className="fixed inset-x-0 top-0 z-[10100] flex h-9 select-none items-center border-b border-black/10 bg-white/95 backdrop-blur"
      style={{ WebkitAppRegion: 'drag' }}
      onDoubleClick={(e) => e.target === e.currentTarget && runAppCommand('maximize')}
    >
      <div className="flex h-full items-center gap-2 pl-3 pr-2">
        <img src={tempoLogo} alt="" className="h-[18px] w-[18px] object-contain" style={{ mixBlendMode: 'multiply' }} />
        <span className="text-[13px] font-semibold tracking-tight text-slate-900">TEMPO</span>
      </div>

      <nav className="flex h-full items-center" style={noDrag} aria-label="Application menu">
        {MENUS.map((menu, i) => (
          <div key={menu.label} className="relative h-full">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              onMouseEnter={() => open != null && setOpen(i)}
              aria-haspopup="menu"
              aria-expanded={open === i}
              className={`flex h-full items-center px-2.5 text-[13px] transition-colors ${open === i ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              {menu.label}
            </button>
            {open === i && (
              <div role="menu" className="tempo-tour-card absolute left-0 top-full mt-1 min-w-[240px] border border-black/10 bg-white py-1.5 shadow-xl shadow-slate-900/10">
                {menu.items.map((item, j) => item ? (
                  <button key={item[1]} role="menuitem" onClick={() => run(item[1])}
                    className="flex w-full items-center justify-between gap-6 px-3.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-900 hover:text-white">
                    <span>{item[0]}</span>
                    {item[2] && <span className="text-[11px] tabular-nums opacity-50">{item[2]}</span>}
                  </button>
                ) : <div key={`sep${j}`} className="my-1.5 h-px bg-black/10" />)}
                {menu.label === 'Help' && win.version && (
                  <div className="mt-1.5 border-t border-black/10 px-3.5 pt-2 text-[11px] text-slate-400">TEMPO v{win.version}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[12px] font-semibold text-slate-600">Tool for Energy Model Planning and Optimization</div>

      <div className="ml-auto flex h-full" style={noDrag}>
        <button onClick={() => runAppCommand('minimize')} aria-label="Minimize" className="grid h-full w-12 place-items-center text-slate-600 hover:bg-slate-100">
          <LuMinimize size={16} />
        </button>
        <button onClick={() => runAppCommand('maximize')} aria-label={win.maximized ? 'Restore' : 'Maximize'} className="grid h-full w-12 place-items-center text-slate-600 hover:bg-slate-100">
          {win.maximized ? <LuRestore size={13} /> : <LuMaximize size={15} />}
        </button>
        <button onClick={() => runAppCommand('close')} aria-label="Close" className="grid h-full w-12 place-items-center text-slate-600 hover:bg-red-600 hover:text-white">
          <LuX size={17} />
        </button>
      </div>
    </header>
  );
}
