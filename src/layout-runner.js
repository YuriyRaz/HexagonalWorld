import { calculateLayout } from './layout.js';

export function createLayoutRunner({
  workerFactory,
  hangGuardMs = 60000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  environmentCheck = () => true
} = {}) {
  let activeState = null;

  function cleanupActiveState() {
    if (!activeState) return;
    const { worker, timer, onMessage, onError, onMessageError } = activeState;
    if (timer) clearTimer(timer);
    if (worker) {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
      worker.terminate();
    }
    activeState = null;
  }

  function cancelActiveLayout(reason = 'superseded') {
    if (!activeState) return;
    const { reject, requestId } = activeState;
    const err = new Error('Cancelled');
    err.code = 'CANCELLED';
    err.requestId = requestId;
    err.silent = true;
    err.details = { reason };
    reject(err);
    cleanupActiveState();
  }

  function runLayout(request) {
    if (request.mode !== 'force-anchors') {
      return Promise.resolve(calculateLayout(request));
    }

    if (!environmentCheck()) {
      const err = new Error('Unsupported environment');
      err.code = 'UNSUPPORTED_ENVIRONMENT';
      err.requestId = request.requestId;
      err.silent = false;
      err.details = {};
      return Promise.reject(err);
    }

    cancelActiveLayout('superseded');

    return new Promise((resolve, reject) => {
      let worker;
      try {
        const workerUrl = new URL('./layout-worker.js', import.meta.url);
        worker = workerFactory(workerUrl, { type: 'module' });
      } catch (e) {
        const err = new Error('Worker start failed');
        err.code = 'WORKER_START_FAILED';
        err.requestId = request.requestId;
        err.silent = false;
        err.details = {};
        reject(err);
        return;
      }

      const timer = setTimer(() => {
        const err = new Error('Timeout');
        err.code = 'TIMEOUT';
        err.requestId = request.requestId;
        err.silent = false;
        err.details = {};
        cleanupActiveState();
        reject(err);
      }, hangGuardMs);

      function finishWithError(code, details = {}) {
        const err = new Error(code);
        err.code = code;
        err.requestId = request.requestId;
        err.silent = false;
        err.details = details;
        cleanupActiveState();
        reject(err);
      }

      const onMessage = (event) => {
        const response = event.data;
        if (!response || typeof response !== 'object') {
          return finishWithError('WORKER_MESSAGE_FAILED');
        }

        if (response.type === 'failure') {
          if (!response.error || typeof response.error.details !== 'object') {
             return finishWithError('WORKER_MESSAGE_FAILED');
          }
          return finishWithError(response.error.code || 'WORKER_MESSAGE_FAILED', response.error.details || {});
        }

        if (response.type !== 'success') {
          return finishWithError('WORKER_MESSAGE_FAILED');
        }

        if (response.requestId !== request.requestId) {
          return finishWithError('WORKER_MESSAGE_FAILED');
        }

        const result = response.result;
        if (!result) return finishWithError('WORKER_MESSAGE_FAILED');
        
        try {
          validateResult(request, response);
          cleanupActiveState();
          resolve(result);
        } catch (e) {
          finishWithError('WORKER_MESSAGE_FAILED');
        }
      };

      const onError = () => {
        finishWithError('WORKER_MESSAGE_FAILED');
      };

      const onMessageError = () => {
        finishWithError('WORKER_MESSAGE_FAILED');
      };

      activeState = {
        requestId: request.requestId,
        worker,
        timer,
        reject,
        onMessage,
        onError,
        onMessageError
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);

      try {
        worker.postMessage({ type: 'calculate', request });
      } catch (e) {
        finishWithError('WORKER_MESSAGE_FAILED');
      }
    });
  }

  function dispose() {
    cancelActiveLayout('disposed');
  }

  return { runLayout, cancelActiveLayout, dispose };
}

function validateResult(request, response) {
  const result = response.result;
  if (result.requestId !== request.requestId) throw new Error();
  if (result.mode !== request.mode) throw new Error();
  if (result.gridRadius > 256) throw new Error();
  
  const entities = request.entities;
  const parentIds = new Set(entities.map(e => e.parentId).filter(id => id !== null));
  const leaves = entities.filter(e => !parentIds.has(e.id));
  
  if (result.placements.length !== leaves.length) throw new Error();
  if (result.stats.occupiedCount !== result.placements.length) throw new Error();
  
  const seenCells = new Set();
  const placementMap = new Map();
  for (let i = 0; i < result.placements.length; i++) {
    const p = result.placements[i];
    if (p.entityId !== leaves[i].id) throw new Error();
    if (!Number.isInteger(p.q) || !Number.isInteger(p.r)) throw new Error();
    const cellKey = `${p.q},${p.r}`;
    if (seenCells.has(cellKey)) throw new Error();
    seenCells.add(cellKey);
    placementMap.set(p.entityId, p);
  }

  if (result.springs.length > 5999) throw new Error();
  
  const springEntities = entities.filter(e => e.parentId !== null);
  if (result.springs.length !== springEntities.length) throw new Error();
  
  for (let i = 0; i < result.springs.length; i++) {
    const spring = result.springs[i];
    const entity = springEntities[i];
    if (spring.source.entityId !== entity.id) throw new Error();
    if (spring.target.entityId !== entity.parentId) throw new Error();
    
    if (spring.source.kind === 'leaf') {
      const p = placementMap.get(entity.id);
      if (!p || spring.source.q !== p.q || spring.source.r !== p.r) throw new Error();
    }
  }

  const diag = result.diagnostics;
  if (!diag || !Number.isFinite(diag.iterations) || !Number.isFinite(diag.assignmentEpochs) || 
      !Number.isFinite(diag.proposalCount) || !Number.isFinite(diag.maxTargetError) || 
      !Number.isFinite(diag.rmsTargetError) || !Number.isFinite(diag.maxAnchorVelocity)) {
    throw new Error();
  }
}

