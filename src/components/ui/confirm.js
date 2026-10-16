// Promise-based confirm queue, rendered by <ConfirmHost /> (ConfirmDialog.jsx).
let listener = null;
const queue = [];

export function confirmAction(options = {}) {
  return new Promise((resolve) => {
    queue.push({ ...options, resolve });
    listener?.();
  });
}

export function subscribeConfirm(fn) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function nextConfirm() {
  return queue.shift() || null;
}
