import { calculateLayout } from './layout.js';

export function handleWorkerMessage(message, postMessage, calculate) {
  if (!message || typeof message !== 'object') return;
  if (message.type !== 'calculate') return;
  if (!message.request) return;

  const requestId = message.request.requestId;

  try {
    const result = calculate(message.request);
    if (result.requestId !== requestId) {
      postMessage({
        type: 'failure',
        requestId,
        error: { code: 'INTERNAL_ERROR', details: {} },
      });
      return;
    }
    postMessage({
      type: 'success',
      requestId,
      result,
    });
  } catch (error) {
    let code = 'INTERNAL_ERROR';
    let details = {};

    if (error && typeof error === 'object' && error.code) {
      code = error.code;
      details = error.details || {};
    }

    postMessage({
      type: 'failure',
      requestId,
      error: { code, details },
    });
  }
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.addEventListener('message', (event) => {
    handleWorkerMessage(event.data, (msg) => self.postMessage(msg), calculateLayout);
  });
}
