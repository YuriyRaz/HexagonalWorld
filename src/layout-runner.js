import { calculateLayout } from './layout.js';
import { axialToPlane } from './hex.js';
import { calculateAssignmentHash } from './force-layout.js';

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
        terminalPositionBuffer: null,
        terminalCellBuffer: null,
        lastGlobalStep: null,
        lastEpoch: null,
        lastEpochStep: null,
        lastAssignmentRevision: null,
        lastAssignmentHash: null,
        lastLeafCells: null,
        lastTerminal: null,
        committedEpoch: null,
        hasSettlement: false,
        presentation: options.presentation || 'all-steps',
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
        for (const waiter of state.controlWaiters.values()) {
          if (waiter.timer) clearTimer(waiter.timer);
        }
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (terminate) worker.terminate();
        if (activeState === state) activeState = null;
        if (error && state.phase !== 'settled-awaiting-commit' && state.phase !== 'retained-settled') reject(error);
        for (const waiter of state.controlWaiters.values()) {
          if (waiter.timer) clearTimer(waiter.timer);
          waiter.reject(error || createRunnerError('CANCELLED', state.requestId, {}));
        }
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

      state.armCommandGuard = (waiter) => {
        waiter.guardRemaining = hangGuardMs;
        waiter.guardStartedAt = performance.now();
        waiter.guardPausedAt = null;
        waiter.timer = setTimer(() => {
          state.controlWaiters.delete(waiter.commandSeq);
          const error = createRunnerError('CONTROL_TIMEOUT', state.requestId, { commandSeq: waiter.commandSeq });
          waiter.reject(error);
          state.destroy(error);
        }, waiter.guardRemaining);
      };

      state.clearCommandGuard = (waiter) => {
        if (waiter.timer) {
          clearTimer(waiter.timer);
          waiter.timer = null;
        }
      };

      state.pauseCommandGuards = () => {
        const now = performance.now();
        for (const waiter of state.controlWaiters.values()) {
          if (waiter.timer) {
            const elapsed = Math.max(0, now - waiter.guardStartedAt);
            waiter.guardRemaining = Math.max(0, waiter.guardRemaining - elapsed);
            waiter.guardPausedAt = now;
            clearTimer(waiter.timer);
            waiter.timer = null;
          }
        }
      };

      state.resumeCommandGuards = () => {
        const now = performance.now();
        for (const waiter of state.controlWaiters.values()) {
          if (waiter.guardPausedAt !== null && waiter.guardRemaining > 0 && !waiter.timer) {
            const pausedDuration = now - waiter.guardPausedAt;
            waiter.guardRemaining = Math.max(0, waiter.guardRemaining - pausedDuration);
            waiter.guardPausedAt = null;
            if (waiter.guardRemaining > 0) {
              waiter.timer = setTimer(() => {
                state.controlWaiters.delete(waiter.commandSeq);
                const error = createRunnerError('CONTROL_TIMEOUT', state.requestId, { commandSeq: waiter.commandSeq });
                waiter.reject(error);
                state.destroy(error);
              }, waiter.guardRemaining);
            }
          }
        }
      };

      const fail = (code, details = {}) => {
        const error = createRunnerError(code, state.requestId, details);
        destroy(error);
      };

      const acknowledge = async (frame, mode = 'painted') => {
        if (state.destroyed || !state.outstanding || state.outstanding.globalStep !== frame.globalStep) return;
        const outstanding = state.outstanding;
        const callback = frame.epoch > 0 && state.outstanding.isEpochReady
          ? state.options.onEpochReady
          : state.outstanding.type === 'ready' ? state.options.onReady : state.options.onStep;
        let receipt = null;
        try {
          receipt = callback
            ? await (outstanding.type === 'ready' || outstanding.isEpochReady
              ? callback(outstanding.isEpochReady
                ? { requestId: state.requestId, epoch: frame.epoch, globalStep: frame.globalStep, topology: structuredClone(state.topology) }
                : state.topology, frame)
              : callback(frame))
            : null;
        } catch (error) {
          console.error('Layout presentation callback failed', error);
          fail('PRESENTATION_FAILED', { message: error?.message || 'observer failed' });
          return;
        }
        if (state.destroyed || state.outstanding !== outstanding) return;
        const expectedPositionBuffer = outstanding.positionBuffer;
        const expectedCellBuffer = outstanding.cellBuffer;
        const actual = receipt || {
          requestId: state.requestId,
          globalStep: frame.globalStep,
          positionBuffer: expectedPositionBuffer,
          cellBuffer: expectedCellBuffer,
        };
        if (
          actual.requestId !== state.requestId
          || actual.globalStep !== frame.globalStep
          || actual.positionBuffer !== expectedPositionBuffer
          || actual.cellBuffer !== expectedCellBuffer
        ) {
          fail('PROTOCOL_ERROR', { reason: 'invalid-presentation-receipt', globalStep: frame.globalStep });
          return;
        }
        state.outstanding = null;
        try {
          worker.postMessage({
            type: mode,
            requestId: state.requestId,
            globalStep: frame.globalStep,
            positionBuffer: expectedPositionBuffer,
            cellBuffer: expectedCellBuffer,
          }, [expectedPositionBuffer, expectedCellBuffer]);
        } catch {
          fail('WORKER_MESSAGE_FAILED');
        }
      };

      const onMessage = async (event) => {
        const response = event.data;
        if (!response || typeof response !== 'object' || response.requestId !== state.requestId) {
          fail('PROTOCOL_ERROR', { reason: 'request-identity' });
          return;
        }
        if (response.type === 'ready' || response.type === 'step') {
          state.guardRemaining = hangGuardMs;
          if (state.timer) {
            clearTimer(state.timer);
            state.timer = null;
          }
          const previousEpoch = state.lastEpoch ?? -1;
          if (state.outstanding) {
            fail('PROTOCOL_ERROR', { reason: 'multiple-outstanding-frames' });
            return;
          }
          try {
            const topology = response.type === 'ready' ? response.topology : state.topology;
            if (response.type === 'ready') {
              validateTopology(response.topology, state.requestId);
            }
            validateFrame(response, topology, state.requestId);
            validatePresentedFrameSequence(response, state, response.type);
          } catch {
            fail('PROTOCOL_ERROR', { reason: 'invalid-frame' });
            return;
          }
          if (response.type === 'ready') state.topology = response.topology;
          commitFrameSequence(state, response);
          state.outstanding = {
            globalStep: response.globalStep,
            positionBuffer: response.positions.buffer,
            cellBuffer: response.leafCells.buffer,
            frame: response,
            type: response.type,
            isEpochReady: response.epoch > 0 && response.epoch !== previousEpoch,
          };
          state.phase = 'waiting-for-paint';
          await acknowledge(response);
          return;
        }
        if (response.type === 'force-control-result') {
          const waiter = state.controlWaiters.get(response.commandSeq);
          if (!waiter) {
            fail('PROTOCOL_ERROR', { reason: 'unknown-control-receipt', commandSeq: response.commandSeq });
            return;
          }
          state.controlWaiters.delete(response.commandSeq);
          state.clearCommandGuard(waiter);
          if (response.accepted) {
            state.phase = response.fixedCount > 0 ? 'held' : 'interaction-cooling';
            state.guardRemaining = hangGuardMs;
            if (state.timer) clearTimer(state.timer);
            state.timer = null;
            if (response.fixedCount === 0) state.armGuard();
          }
          waiter.resolve(structuredClone(response));
          return;
        }
        if (response.type === 'success' || response.type === 'epoch-success') {
          try {
            if (!state.topology) validateTopology(response.topology, state.requestId);
            const topology = state.topology || response.topology;
            validateV2Result(state.request, response.result, response.terminalFrame, topology);
            validateSettlementSequence(response, state);
          } catch {
            fail('PROTOCOL_ERROR', { reason: 'invalid-settlement' });
            return;
          }
          state.topology ||= response.topology;
          if (state.presentation === 'final-only') commitFrameSequence(state, response.terminalFrame);
          if (state.timer) {
            clearTimer(state.timer);
            state.timer = null;
          }
          state.terminalFrame = response.terminalFrame;
          state.terminalPositionBuffer = response.terminalFrame?.positions?.buffer || null;
          state.terminalCellBuffer = response.terminalFrame?.leafCells?.buffer || null;
          state.terminalEpoch = response.epoch ?? 0;
          const isInitial = !state.hasSettlement;
          state.hasSettlement = true;
          state.phase = isInitial ? 'settled-awaiting-commit' : 'epoch-awaiting-commit';
          const settlement = Object.freeze({
            requestId: state.requestId,
            epoch: response.epoch ?? 0,
            globalStep: response.globalStep,
            topology: structuredClone(state.topology),
            result: structuredClone(response.result),
            terminalFrame: structuredClone(response.terminalFrame),
          });
          try {
            if (isInitial) state.options.onInitialSettled?.(settlement);
            else state.options.onEpochSettled?.(settlement);
          } catch {
            fail('PRESENTATION_FAILED', { reason: 'settlement-observer' });
            return;
          }
          if (isInitial) resolve(response.result);
          else {
            const waiter = state.epochWaiters.get(response.epoch);
            state.epochWaiters.delete(response.epoch);
            waiter?.resolve(settlement);
          }
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
        worker.postMessage({ type: 'calculate', request, presentation: state.presentation });
      } catch {
        fail('WORKER_MESSAGE_FAILED');
      }
    });
  }

  function runLayout(request) {
    if (request.config?.version === 2) {
      if (!environmentCheck()) {
        return Promise.reject(createRunnerError('UNSUPPORTED_ENVIRONMENT', request.requestId, { capability: 'module-worker' }));
      }
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
    if (!(state.terminalPositionBuffer instanceof ArrayBuffer) || !(state.terminalCellBuffer instanceof ArrayBuffer)) {
      throw createRunnerError('INVALID_COMMIT', requestId, { reason: 'missing-terminal-buffers' });
    }
    if (epoch !== state.terminalEpoch) {
      throw createRunnerError('INVALID_COMMIT', requestId, { expectedEpoch: state.terminalEpoch, epoch });
    }
    const terminalPositionBuffer = state.terminalPositionBuffer;
    const terminalCellBuffer = state.terminalCellBuffer;
    try {
      state.worker.postMessage({
        type: 'session-result-committed',
        requestId,
        epoch,
        terminalPositionBuffer,
        terminalCellBuffer,
      }, [terminalPositionBuffer, terminalCellBuffer]);
    } catch {
      const error = createRunnerError('WORKER_MESSAGE_FAILED', requestId, {});
      state.destroy(error);
      throw error;
    }
    state.terminalPositionBuffer = null;
    state.terminalCellBuffer = null;
    state.committedEpoch = epoch;
    state.phase = 'retained-settled';
  }

  function submitForceControl(input) {
    const state = activeState;
    if (!state || state.kind !== 'v2') return Promise.reject(createRunnerError('SESSION_UNAVAILABLE', input?.requestId, {}));
    if (input?.requestId !== state.requestId) return Promise.reject(createRunnerError('STALE_REQUEST', input?.requestId, {}));
    if (!['running', 'center-locking', 'retained-settled', 'held', 'interaction-cooling', 'epoch-awaiting-commit', 'settled-awaiting-commit', 'waiting-for-paint', 'starting'].includes(state.phase)) {
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
      const waiter = { resolve, reject, commandSeq, timer: null, guardRemaining: hangGuardMs, guardStartedAt: null, guardPausedAt: null };
      state.controlWaiters.set(commandSeq, waiter);
      state.armCommandGuard(waiter);
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
        state.clearCommandGuard(waiter);
        reject(createRunnerError('WORKER_MESSAGE_FAILED', state.requestId, {}));
      }
    });
  }

  function waitForEpochSettlement(requestId, epoch) {
    const state = activeState;
    if (!state || state.kind !== 'v2' || state.requestId !== requestId) return Promise.reject(createRunnerError('SESSION_UNAVAILABLE', requestId, {}));
    if (!Number.isSafeInteger(epoch) || epoch <= 0 || state.epochWaiters.has(epoch) || epoch <= (state.terminalEpoch ?? 0)) {
      return Promise.reject(createRunnerError('INVALID_EPOCH', requestId, { epoch }));
    }
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
      state.pauseCommandGuards();
    } else if (!state.timer && state.phase !== 'settled-awaiting-commit' && state.phase !== 'retained-settled') {
      state.armGuard();
      state.resumeCommandGuards();
    }
  }

  function suppressActivePresentation() {
    const state = activeState;
    if (!state || state.kind !== 'v2' || !state.outstanding) return;
    const { globalStep, positionBuffer, cellBuffer } = state.outstanding;
    state.outstanding = null;
    state.worker.postMessage({
      type: 'suppress',
      requestId: state.requestId,
      globalStep,
      positionBuffer,
      cellBuffer,
    }, [positionBuffer, cellBuffer]);
  }

  function dispose() {
    cancelActiveLayout('disposed');
  }

  function dragStart(requestId, entityId, x, z) {
    return submitForceControl({ requestId, action: 'set-fixed-position', entityId, x, y: z });
  }

  function dragMove(requestId, entityId, x, z) {
    return submitForceControl({ requestId, action: 'set-fixed-position', entityId, x, y: z });
  }

  function dragEnd(requestId, entityId, unpin = true) {
    if (unpin) {
      return submitForceControl({ requestId, action: 'release-fixed-position', entityId });
    }
    return Promise.resolve(null);
  }

  return {
    runLayout,
    cancelActiveLayout,
    confirmSessionResultCommitted,
    submitForceControl,
    dragStart,
    dragMove,
    dragEnd,
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
  if (!topology || frame.requestId !== requestId || !Number.isSafeInteger(frame.globalStep) || frame.globalStep < 0
    || !Number.isSafeInteger(frame.epoch) || frame.epoch < 0
    || !Number.isSafeInteger(frame.epochStep) || frame.epochStep < 0
    || !Number.isSafeInteger(frame.coolingStep) || frame.coolingStep < 0
    || !(frame.positions instanceof Float32Array) || frame.positions.length !== topology.nodeIds.length * 2) throw new Error('invalid frame');
  for (const position of frame.positions) if (!Number.isFinite(position)) throw new Error('non-finite frame');
  if (!Number.isSafeInteger(frame.assignmentRevision) || frame.assignmentRevision < 0
    || !Number.isSafeInteger(frame.assignmentHash) || frame.assignmentHash < 0 || frame.assignmentHash > 0xffffffff) {
    throw new Error('invalid assignment identity');
  }
  for (const value of [frame.stableStreak, frame.maxMovement, frame.rmsMovement, frame.maxTargetError, frame.rmsTargetError]) {
    if (!Number.isFinite(value)) throw new Error('invalid frame diagnostic');
  }
  if (!['none', 'converged', 'not-converged'].includes(frame.terminal)) throw new Error('invalid terminal');
  if (!(frame.leafCells instanceof Int16Array)) throw new Error('invalid leafCells type');
  const leafIds = topology.nodeIds.filter((_, index) => topology.nodeKinds[index] === 'leaf');
  if (frame.leafCells.length !== leafIds.length * 2) throw new Error('invalid leafCells length');
  const cellSet = new Set();
  for (let index = 0; index < frame.leafCells.length; index += 2) {
    const q = frame.leafCells[index];
    const r = frame.leafCells[index + 1];
    const radius = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
    if (radius > 256) throw new Error('out of bounds leafCell');
    const key = `${q},${r}`;
    if (cellSet.has(key)) throw new Error('duplicate leafCell');
    cellSet.add(key);
  }
  if (calculateAssignmentHash(leafIds, frame.leafCells) !== frame.assignmentHash) throw new Error('assignment hash mismatch');
}

function equalLeafCells(left, right) {
  if (!(left instanceof Int16Array) || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function validateAssignmentSequence(frame, state, allowSuppressedGaps = false) {
  if (state.lastAssignmentRevision === null) return;
  if (frame.assignmentRevision < state.lastAssignmentRevision) throw new Error('assignment revision regression');
  const revisionDelta = frame.assignmentRevision - state.lastAssignmentRevision;
  if (!allowSuppressedGaps && revisionDelta > 1) throw new Error('assignment revision jump');
  const cellsChanged = !equalLeafCells(frame.leafCells, state.lastLeafCells);
  if (revisionDelta === 0 && (frame.assignmentHash !== state.lastAssignmentHash || cellsChanged)) {
    throw new Error('assignment changed without revision');
  }
  if (revisionDelta === 1 && !cellsChanged) throw new Error('assignment revision changed without cells');
}

function validatePresentedFrameSequence(frame, state, type) {
  if (type === 'ready') {
    if (state.lastGlobalStep !== null || frame.globalStep !== 0 || frame.epoch !== 0 || frame.epochStep !== 0
      || frame.assignmentRevision !== 0) throw new Error('invalid ready sequence');
    return;
  }
  if (state.lastGlobalStep === null) throw new Error('step without active sequence');
  if (frame.globalStep !== state.lastGlobalStep + 1) throw new Error('non-contiguous global step');
  if (frame.epoch < state.lastEpoch || frame.epoch > state.lastEpoch + 1) throw new Error('invalid epoch sequence');
  const retainedTransition = frame.epoch === state.lastEpoch + 1;
  if (retainedTransition) {
    const isControlTransition = state.phase === 'held' || state.phase === 'interaction-cooling' || state.controlWaiters.size > 0;
    if (!isControlTransition && (state.phase !== 'retained-settled' || state.committedEpoch !== state.lastEpoch || frame.epochStep !== 1)) {
      throw new Error('invalid retained epoch transition');
    }
    if (isControlTransition && frame.epochStep !== 1) {
      throw new Error('invalid retained epoch transition step');
    }
  }
  if (state.lastTerminal !== 'none' && !retainedTransition) throw new Error('step after terminal frame');
  validateAssignmentSequence(frame, state);
}

function validateSettlementSequence(response, state) {
  const frame = response.terminalFrame;
  if (!Number.isSafeInteger(response.epoch) || response.epoch < 0
    || !Number.isSafeInteger(response.globalStep) || response.globalStep < 0
    || response.epoch !== frame.epoch || response.globalStep !== frame.globalStep) {
    throw new Error('settlement identity mismatch');
  }
  if (!state.hasSettlement) {
    if (response.epoch < 0) throw new Error('invalid initial settlement');
  } else if (response.epoch !== state.terminalEpoch + 1) {
    // If the session was already settled but we received an epoch success, epoch must match terminalEpoch + 1
    // Exception: if the epoch was incremented because we dragged, we allow it
    if (response.epoch !== state.lastEpoch) {
      throw new Error('invalid epoch settlement');
    }
  }

  if (state.presentation === 'all-steps') {
    if (state.lastGlobalStep === null || frame.terminal !== 'converged'
      || frame.globalStep !== state.lastGlobalStep || frame.epoch !== state.lastEpoch
      || frame.epochStep !== state.lastEpochStep || frame.assignmentRevision !== state.lastAssignmentRevision
      || frame.assignmentHash !== state.lastAssignmentHash || !equalLeafCells(frame.leafCells, state.lastLeafCells)) {
      throw new Error('settlement does not match presented terminal frame');
    }
    return;
  }

  if (response.type === 'success') {
    if (state.lastGlobalStep !== null) throw new Error('duplicate initial settlement');
    return;
  }
  if (state.committedEpoch !== state.lastEpoch || frame.globalStep <= state.lastGlobalStep) {
    throw new Error('invalid retained final-only settlement');
  }
  validateAssignmentSequence(frame, state, true);
}

function commitFrameSequence(state, frame) {
  if (!state.lastLeafCells) state.lastLeafCells = new Int16Array(frame.leafCells.length);
  if (state.lastAssignmentRevision !== frame.assignmentRevision || state.lastAssignmentRevision === null) {
    state.lastLeafCells.set(frame.leafCells);
  }
  state.lastGlobalStep = frame.globalStep;
  state.lastEpoch = frame.epoch;
  state.lastEpochStep = frame.epochStep;
  state.lastAssignmentRevision = frame.assignmentRevision;
  state.lastAssignmentHash = frame.assignmentHash;
  state.lastTerminal = frame.terminal;
}

function validateV2Result(request, result, terminalFrame, topology) {
  if (!result || result.requestId !== request.requestId || result.mode !== request.mode || !Array.isArray(result.placements) || !Array.isArray(result.springs) || !Number.isSafeInteger(result.gridRadius) || result.gridRadius < 0 || result.gridRadius > 256) throw new Error('invalid result');
  const leafIds = topology.nodeIds.filter((_, index) => topology.nodeKinds[index] === 'leaf');
  validateFrame(terminalFrame, topology, request.requestId);
  if (terminalFrame.terminal !== 'converged') throw new Error('missing terminal frame');
  if (result.placements.length !== leafIds.length || result.stats?.occupiedCount !== leafIds.length) throw new Error('invalid placements');
  const cells = new Set();
  for (let index = 0; index < result.placements.length; index += 1) {
    const placement = result.placements[index];
    if (placement.entityId !== leafIds[index] || !Number.isSafeInteger(placement.q) || !Number.isSafeInteger(placement.r)
      || Math.max(Math.abs(placement.q), Math.abs(placement.r), Math.abs(-placement.q - placement.r)) > 256) throw new Error('invalid placement');
    const key = `${placement.q},${placement.r}`;
    if (cells.has(key)) throw new Error('duplicate placement');
    cells.add(key);
    if (terminalFrame.leafCells[index * 2] !== placement.q || terminalFrame.leafCells[index * 2 + 1] !== placement.r) {
      throw new Error('terminal cell mismatch');
    }
  }
  if (result.springs.length !== topology.relations.length) throw new Error('invalid spring count');
  if (!result.leafCells || typeof result.leafCells !== 'object') throw new Error('invalid leafCells');
  if (!result.towerPositions || typeof result.towerPositions !== 'object') throw new Error('invalid towerPositions');
  for (const leafId of leafIds) {
    if (!(leafId in result.leafCells)) throw new Error('missing leafCell');
    const cell = result.leafCells[leafId];
    if (!Number.isSafeInteger(cell.q) || !Number.isSafeInteger(cell.r)) throw new Error('invalid leafCell coordinates');
    const placement = result.placements[leafIds.indexOf(leafId)];
    if (cell.q !== placement.q || cell.r !== placement.r) throw new Error('result leafCell mismatch');
    if (!(leafId in result.towerPositions)) throw new Error('missing towerPosition');
    const pos = result.towerPositions[leafId];
    const center = axialToPlane(cell.q, cell.r);
    if (pos.x !== center.x || pos.z !== center.z) throw new Error('invalid towerPosition coordinates');
  }
  for (let index = 0; index < result.springs.length; index += 1) {
    const spring = result.springs[index];
    const relation = topology.relations[index];
    if (spring.source?.entityId !== topology.nodeIds[relation.sourceIndex] || spring.target?.entityId !== topology.nodeIds[relation.targetIndex]) throw new Error('invalid spring identity');
    if (!Number.isFinite(spring.source.q) || !Number.isFinite(spring.source.r) || !Number.isFinite(spring.target.q) || !Number.isFinite(spring.target.r)) throw new Error('invalid spring coordinates');
  }
  const diagnostics = result.diagnostics;
  if (!diagnostics || diagnostics.version !== 2 || diagnostics.globalStep !== terminalFrame.globalStep
    || diagnostics.epoch !== terminalFrame.epoch || diagnostics.assignmentRevision !== terminalFrame.assignmentRevision
    || diagnostics.assignmentHash !== terminalFrame.assignmentHash) throw new Error('invalid diagnostics');
  if (JSON.stringify(terminalFrame.result) !== JSON.stringify(result)) throw new Error('terminal result mismatch');
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
