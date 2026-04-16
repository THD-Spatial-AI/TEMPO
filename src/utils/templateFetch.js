/**
 * Fetch a file from the templates directory.
 *
 * In dev mode (Vite), `/templates/` is served from `public/templates/` and
 * a plain `fetch` works fine. In a packaged Electron build the HTML is loaded
 * from `file://` so `fetch('/templates/...')` resolves against the FS root,
 * which is wrong. We use the Electron IPC bridge instead.
 *
 * Returns a Response-compatible object so existing call-sites can stay
 * unchanged:  `const text = await (await fetchTemplate('foo.csv')).text()`
 */
export async function fetchTemplate(filename) {
  if (window.electronAPI?.readTemplateFile) {
    const text = await window.electronAPI.readTemplateFile(filename);
    if (text === null || text === undefined) {
      return {
        ok: false,
        status: 404,
        text: () => Promise.reject(new Error(`Template not found: ${filename}`)),
        json: () => Promise.reject(new Error(`Template not found: ${filename}`)),
        blob: () => Promise.reject(new Error(`Template not found: ${filename}`)),
      };
    }
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(JSON.parse(text)),
      blob: () => Promise.resolve(new Blob([text])),
    };
  }

  // Fallback: plain browser / Vite dev server
  return fetch(`/templates/${filename}`);
}
