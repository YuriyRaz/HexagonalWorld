import { calculateLayout } from './layout.js';
import { axialToPlane } from './hex.js';

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
    if (activeState.kind === 'v2') {
      const error = createRunnerError('CANCELLED', activeState.requestId, { reason });
      error.silent = true;
      activeState.destroy(error);
      return;
    }
    const { reject, requestId } = activeState;
    const err = new Error('Cancelled');
    err.code = 'CANCELLED';
    err.requestId = requestId;
    err.silent = true;
    err.details = { reason };
    reject(err);
    cleanupActiveState();
  }

  function runRetainedLayout(request, options = {}) {
    cancelActiveLayout('superseded');
    return new Promise((resolve, reject) => {
      let worker;
      try {
        const workerUrl = new URL('./layout-worker.js', import.meta.url);
        worker = workerFactory(workerUrl, { type: 'module' });
      } catch {
        const error = createRunnerError('WORKER_START_FAILED', request.requestId, {});
        reject(error);
        return;
      }

      const state = {
        kind: 'v2',
        request,
        requestId: request.requestId,
        worker,
        timer: null,
        resolve,
        reject,
        options,
        phase: 'starting',
        topology: null,
        outstanding: null,
        terminalFrame: null,
        terminalBuffer: null,
        lastGlobalStep: null,
        nextCommandSeq: 1,
        controlWaiters: new Map(),
        epochWaiters: new Map(),
        destroyed: false,
        guardRemaining: hangGuardMs,
        guardStartedAt: performance.now(),
      };

      const destroy = (error = null, terminate = true) => {
        if (state.destroyed) return;
        state.destroyed = true;
        if (state.timer) clearTimer(state.timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (terminate) worker.terminate();
        if (activeState === state) activeState = null;
        if (error && state.phase !== 'settled-awaiting-commit' && state.phase !== 'retained-settled') reject(error);
        for (const waiter of state.controlWaiters.values()) waiter.reject(error || createRunnerError('CANCELLED', state.requestId, {}));
        for (const waiter of state.epochWaiters.values()) waiter.reject(error || createRunnerError('CANCELLED', state.requestId, {}));
        state.controlWaiters.clear();
        state.epochWaiters.clear();
      };
      state.destroy = destroy;

      const guard = () => {
        const error = createRunnerError('TIMEOUT', state.requestId, {});
        destroy(error);
      };
      state.armGuard = () => {
        state.guardStartedAt = performance.now();
        state.timer = setTimer(guard, state.guardRemaining);
      };
      state.armGuard();

      const fail = (code, details = {}) => {
        const error = createRunnerError(code, state.requestId, details);
        destroy(error);
      };

      const acknowledge = async (frame, mode = 'painted') => {
        if (state.destroyed || !state.outstanding || state.outstanding.globalStep !== frame.globalStep) return;
        const callback = frame.epoch > 0 && state.outstanding.isEpochReady
          ? state.options.onEpochReady
          : state.outstanding.type === 'ready' ? state.options.onReady : state.options.onStep;
        let receipt = null;
        try {
          receipt = callback
            ? await (state.outstanding.type === 'ready' || state.outstanding.isEpochReady
              ? callback(state.topology, frame)
              : callback(frame))
            : null;
        } catch (error) {
          console.error('Layout presentation callback failed', error);
          fail('PRESENTATION_FAILED', { message: error?.message || 'observer failed' });
          return;
        }
        const expectedBuffer = state.outstanding.buffer;
        const actual = receipt || { requestId: state.requestId, globalStep: frame.globalStep, buffer: expectedBuffer };
        if (
          actual.requestId !== state.requestId
          || actual.globalStep !== frame.globalStep
          || actual.buffer !== expectedBuffer
        ) {
          fail('PROTOCOL_ERROR', { reason: 'invalid-presentation-receipt', globalStep: frame.globalStep });
          return;
        }
        state.outstanding = null;
        try {
          worker.postMessage({ type: mode, requestId: state.requestId, globalStep: frame.globalStep, buffer: expectedBuffer }, [expectedBuffer]);
        } catch {
          fail('WORKER_MESSAGE_FAILED');
        }
      };

      const onMessage = (event) => {
        const response = event.data;
        if (!response || typeof response !== 'object' || response.requestId !== state.requestId) {
          fail('PROTOCOL_ERROR', { reason: 'request-identity' });
          return;
        }
        if (response.type === 'ready' || response.type === 'step') {
          try {
            if (response.type === 'ready') {
              validateTopology(response.topology, state.requestId);
              state.topology = response.topology;
            }
            validateFrame(response, state.topology, state.requestId);
            const expectedStep = response.type === 'ready' ? 0 : (state.lastGlobalStep ?? -1) + 1;
            if (response.globalStep !== expectedStep) throw new Error('non-contiguous global step');
            state.lastGlobalStep = response.globalStep;
          } catch {
            fail('PROTOCOL_ERROR', { reason: 'invalid-frame' });
            return;
          }
          if (state.outstanding) {
            fail('PROTOCOL_ERROR', { reason: 'multiple-outstanding-frames' });
            return;
          }
          state.outstanding = {
            globalStep: response.globalStep,
            buffer: response.positions.buffer,
            frame: response,
            type: response.type,
            isEpochReady: response.epoch > 0 && response.epochStep === 0,
          };
          state.phase = 'waiting-for-paint';
          void acknowledge(response);
          return;
        }
        if (response.type === 'force-control-result') {
          const waiter = state.controlWaiters.get(response.commandSeq);
          if (!waiter) {
            fail('PROTOCOL_ERROR', { reason: 'unknown-control-receipt', commandSeq: response.commandSeq });
            return;
          }
          state.controlWaiters.delete(response.commandSeq);
          if (response.accepted) {
            state.phase = response.fixedCount > 0 ? 'held' : 'interaction-cooling';
            state.guardRemaining = hangGuardMs;
            if (!state.timer) state.armGuard();
          }
          waiter.resolve(structuredClone(response));
          return;
        }
        if (response.type === 'success' || response.type === 'epoch-success') {
          try {
            if (!state.topology) validateTopology(response.topology, state.requestId);
            state.topology ||= response.topology;
            validateV2Result(state.request, response.result, response.terminalFrame, state.topology);
          } catch {
            fail('PROTOCOL_ERROR', { reason: 'invalid-settlement' });
            return;
          }
          if (state.timer) {
            clearTimer(state.timer);
            state.timer = null;
          }
          state.terminalFrame = response.terminalFrame;
          state.terminalBuffer = response.terminalFrame?.positions?.buffer || null;
          state.phase = response.type === 'success' ? 'settled-awaiting-commit' : 'epoch-awaiting-commit';
          const settlement = Object.freeze({
            requestId: state.requestId,
            epoch: response.epoch ?? 0,
            globalStep: response.globalStep,
            topology: structuredClone(state.topology),
            result: structuredClone(response.result),
            terminalFrame: structuredClone(response.terminalFrame),
          });
          try {
            if (response.type === 'success') state.options.onInitialSettled?.(settlement);
            else state.options.onEpochSettled?.(settlement);
          } catch {
            fail('PRESENTATION_FAILED', { reason: 'settlement-observer' });
            return;
          }
          if (response.type === 'success') resolve(response.result);
          else state.epochWaiters.get(response.epoch)?.resolve(settlement);
          return;
        }
        if (response.type === 'failure') {
          const error = createRunnerError(response.error?.code || 'WORKER_MESSAGE_FAILED', state.requestId, response.error?.details || {});
          destroy(error);
          return;
        }
        fail('PROTOCOL_ERROR', { reason: 'unknown-message' });
      };

      const onError = () => fail('WORKER_MESSAGE_FAILED');
      const onMessageError = () => fail('WORKER_MESSAGE_FAILED');
      state.onMessage = onMessage;
      state.onError = onError;
      state.onMessageError = onMessageError;
      activeState = state;
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      try {
        worker.postMessage({ type: 'calculate', request, presentation: options.presentation || 'all-steps' });
      } catch {
        fail('WORKER_MESSAGE_FAILED');
      }
    });
  }

  function runLayout(request) {
    if (request.config?.version === 2) {
      return runRetainedLayout(request, arguments[1] || {});
    }
    if (request.mode !== 'force-anchors') {
      cancelActiveLayout('superseded');
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

  function confirmSessionResultCommitted(requestId, epoch = 0) {
    const state = activeState;
    if (!state || state.kind !== 'v2' || state.requestId !== requestId) {
      throw createRunnerError('SESSION_UNAVAILABLE', requestId, {});
    }
    if (state.phase !== 'settled-awaiting-commit' && state.phase !== 'epoch-awaiting-commit') {
      throw createRunnerError('INVALID_COMMIT', requestId, { phase: state.phase });
    }
    if (!(state.terminalBuffer instanceof ArrayBuffer)) {
      throw createRunnerError('INVALID_COMMIT', requestId, { reason: 'missing-terminal-buffer' });
    }
    const terminalBuffer = state.terminalBuffer;
    try {
      state.worker.postMessage({ type: 'session-result-committed', requestId, epoch, terminalBuffer }, [terminalBuffer]);
    } catch {
      const error = createRunnerError('WORKER_MESSAGE_FAILED', requestId, {});
      state.destroy(error);
      throw error;
    }
    state.terminalBuffer = null;
    state.phase = 'retained-settled';
  }

  function submitForceControl(input) {
    const state = activeState;
    if (!state || state.kind !== 'v2') return Promise.reject(createRunnerError('SESSION_UNAVAILABLE', input?.requestId, {}));
    if (input?.requestId !== state.requestId) return Promise.reject(createRunnerError('STALE_REQUEST', input?.requestId, {}));
    if (!['retained-settled', 'held', 'interaction-cooling'].includes(state.phase)) {
      return Promise.reject(createRunnerError('SESSION_NOT_SETTLED', state.requestId, { phase: state.phase }));
    }
    if (!input || (input.action !== 'set-fixed-position' && input.action !== 'release-fixed-position') || typeof input.entityId !== 'string') {
      return Promise.reject(createRunnerError('INVALID_COMMAND', state.requestId, {}));
    }
    if (input.action === 'set-fixed-position' && (!Number.isFinite(input.x) || !Number.isFinite(input.y))) {
      return Promise.reject(createRunnerError('INVALID_COMMAND', state.requestId, { reason: 'non-finite-position' }));
    }
    const commandSeq = state.nextCommandSeq;
    state.nextCommandSeq += 1;
    return new Promise((resolve, reject) => {
      state.controlWaiters.set(commandSeq, { resolve, reject });
      try {
        const { requestId, action, entityId, x, y } = input;
        state.worker.postMessage({
          type: 'force-control',
          requestId,
          commandSeq,
          command: { action, entityId, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) },
        });
      } catch {
        state.controlWaiters.delete(commandSeq);
        reject(createRunnerError('WORKER_MESSAGE_FAILED', state.requestId, {}));
      }
    });
  }

  function waitForEpochSettlement(requestId, epoch) {
    const state = activeState;
    if (!state || state.kind !== 'v2' || state.requestId !== requestId) return Promise.reject(createRunnerError('SESSION_UNAVAILABLE', requestId, {}));
    return new Promise((resolve, reject) => {
      state.epochWaiters.set(epoch, { resolve, reject });
    });
  }

  function setPresentationPaused(paused) {
    if (!activeState || activeState.kind !== 'v2') return;
    const state = activeState;
    const nextPaused = Boolean(paused);
    if (nextPaused === Boolean(state.presentationPaused)) return;
    state.presentationPaused = nextPaused;
    if (nextPaused) {
      if (state.timer) {
        const elapsed = Math.max(0, performance.now() - state.guardStartedAt);
        state.guardRemaining = Math.max(0, state.guardRemaining - elapsed);
        clearTimer(state.timer);
        state.timer = null;
      }
    } else if (!state.timer && state.phase !== 'settled-awaiting-commit' && state.phase !== 'retained-settled') {
      state.armGuard();
    }
  }

  function suppressActivePresentation() {
    const state = activeState;
    if (!state || state.kind !== 'v2' || !state.outstanding) return;
    const { globalStep, buffer } = state.outstanding;
    state.outstanding = null;
    state.worker.postMessage({ type: 'suppress', requestId: state.requestId, globalStep, buffer }, [buffer]);
  }

  function dispose() {
    cancelActiveLayout('disposed');
  }

  return {
    runLayout,
    cancelActiveLayout,
    confirmSessionResultCommitted,
    submitForceControl,
    waitForEpochSettlement,
    setPresentationPaused,
    suppressActivePresentation,
    dispose,
  };
}

function createRunnerError(code, requestId, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.requestId = requestId;
  error.silent = false;
  error.details = details;
  return error;
}

function validateTopology(topology, requestId) {
  if (!topology || topology.requestId !== requestId || !Array.isArray(topology.nodeIds) || !Array.isArray(topology.nodeKinds) || !Array.isArray(topology.relations)) throw new Error('invalid topology');
  if (topology.nodeIds.length === 0 || topology.nodeIds.length !== topology.nodeKinds.length) throw new Error('invalid node arrays');
  const ids = new Set();
  for (let index = 0; index < topology.nodeIds.length; index += 1) {
    const id = topology.nodeIds[index];
    const kind = topology.nodeKinds[index];
    if (typeof id !== 'string' || id.length === 0 || ids.has(id) || (kind !== 'leaf' && kind !== 'anchor')) throw new Error('invalid topology node');
    ids.add(id);
  }
  const relationships = new Set();
  for (const relation of topology.relations) {
    if (!Number.isSafeInteger(relation.sourceIndex) || !Number.isSafeInteger(relation.targetIndex) || relation.sourceIndex < 0 || relation.targetIndex < 0 || relation.sourceIndex >= topology.nodeIds.length || relation.targetIndex >= topology.nodeIds.length || typeof relation.relationshipId !== 'string' || relationships.has(relation.relationshipId)) throw new Error('invalid topology relation');
    relationships.add(relation.relationshipId);
  }
}

function validateFrame(frame, topology, requestId) {
  if (!topology || frame.requestId !== requestId || !Number.isSafeInteger(frame.globalStep) || frame.globalStep < 0 || !Number.isSafeInteger(frame.epoch) || !Number.isSafeInteger(frame.coolingStep) || !(frame.positions instanceof Float32Array) || frame.positions.length !== topology.nodeIds.length * 2) throw new Error('invalid frame');
  for (const position of frame.positions) if (!Number.isFinite(position)) throw new Error('non-finite frame');
  for (const value of [frame.assignmentRevision, frame.assignmentHash, frame.stableStreak, frame.maxMovement, frame.rmsMovement, frame.maxTargetError, frame.rmsTargetError]) {
    if (!Number.isFinite(value)) throw new Error('invalid frame diagnostic');
  }
  if (!['none', 'converged', 'not-converged'].includes(frame.terminal)) throw new Error('invalid terminal');
}

function validateV2Result(request, result, terminalFrame, topology) {
  if (!result || result.requestId !== request.requestId || result.mode !== request.mode || !Array.isArray(result.placements) || !Array.isArray(result.springs) || !Number.isSafeInteger(result.gridRadius) || result.gridRadius < 0 || result.gridRadius > 256) throw new Error('invalid result');
  const leafIds = topology.nodeIds.filter((_, index) => topology.nodeKinds[index] === 'leaf');
  if (result.placements.length !== leafIds.length || result.stats?.occupiedCount !== leafIds.length) throw new Error('invalid placements');
  const cells = new Set();
  for (let index = 0; index < result.placements.length; index += 1) {
    const placement = result.placements[index];
    if (placement.entityId !== leafIds[index] || !Number.isSafeInteger(placement.q) || !Number.isSafeInteger(placement.r)) throw new Error('invalid placement');
    const key = `${placement.q},${placement.r}`;
    if (cells.has(key)) throw new Error('duplicate placement');
    cells.add(key);
  }
  if (result.springs.length !== topology.relations.length) throw new Error('invalid spring count');
  for (let index = 0; index < result.springs.length; index += 1) {
    const spring = result.springs[index];
    const relation = topology.relations[index];
    if (spring.source?.entityId !== topology.nodeIds[relation.sourceIndex] || spring.target?.entityId !== topology.nodeIds[relation.targetIndex]) throw new Error('invalid spring identity');
    if (!Number.isFinite(spring.source.q) || !Number.isFinite(spring.source.r) || !Number.isFinite(spring.target.q) || !Number.isFinite(spring.target.r)) throw new Error('invalid spring coordinates');
  }
  const diagnostics = result.diagnostics;
  if (!diagnostics || diagnostics.version !== 2 || !Number.isFinite(diagnostics.globalStep) || !Number.isFinite(diagnostics.assignmentHash)) throw new Error('invalid diagnostics');
  if (!terminalFrame || terminalFrame.terminal !== 'converged' || terminalFrame.result !== result) {
    // Structured clone does not preserve object identity between the two
    // message fields, so the result identity check is intentionally shallow.
    if (!terminalFrame || terminalFrame.terminal !== 'converged') throw new Error('missing terminal frame');
  }
  if (JSON.stringify(terminalFrame.result) !== JSON.stringify(result)) throw new Error('terminal result mismatch');
  if (terminalFrame.positions.length !== topology.nodeIds.length * 2) throw new Error('invalid terminal positions');
  for (let index = 0; index < leafIds.length; index += 1) {
    const nodeIndex = topology.nodeIds.indexOf(leafIds[index]);
    const placement = result.placements[index];
    const center = axialToPlane(placement.q, placement.r);
    if (terminalFrame.positions[nodeIndex * 2] !== Math.fround(center.x) || terminalFrame.positions[nodeIndex * 2 + 1] !== Math.fround(center.z)) throw new Error('terminal center mismatch');
  }
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
