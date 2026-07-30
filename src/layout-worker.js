import { calculateLayout } from './layout.js';
import { calculateForceLayout, createForceLayoutSession } from './force-layout.js';

function errorEnvelope(error) {
  return {
    code: error?.code || 'INTERNAL_ERROR',
    details: error?.details && typeof error.details === 'object' ? error.details : {},
  };
}

function post(postMessage, message, transfer = []) {
  postMessage(message, transfer);
}

function createWorkerController(postMessage, calculate = calculateLayout, calculateForce = calculateForceLayout) {
  let active = null;

  function sendFailure(requestId, error, extra = {}) {
    post(postMessage, { type: 'failure', requestId, error: errorEnvelope(error), ...extra });
  }

  function sendTerminal(state, frame) {
    state.epoch = frame.epoch;
    const terminalFrame = {
      ...frame,
      positions: new Float32Array(frame.positions),
      result: frame.result,
    };
    state.terminalBuffer = terminalFrame.positions.buffer;
    if (frame.terminal === 'converged') {
      state.phase = 'settled-awaiting-commit';
      post(postMessage, {
        type: state.epoch === 0 ? 'success' : 'epoch-success',
        requestId: state.requestId,
        epoch: state.epoch,
        globalStep: frame.globalStep,
        topology: state.topology,
        result: frame.result,
        terminalFrame,
      }, [terminalFrame.positions.buffer]);
    } else {
      state.phase = 'failed';
      post(postMessage, {
        type: 'failure',
        requestId: state.requestId,
        globalStep: frame.globalStep,
        terminalFrame,
        error: {
          code: 'NOT_CONVERGED',
          details: { coolingStep: frame.coolingStep, globalStep: frame.globalStep },
        },
      }, [terminalFrame.positions.buffer]);
    }
  }

  function afterPaint(state) {
    const outstanding = state.outstanding;
    state.outstanding = null;
    if (!outstanding) return;
    if (outstanding.frame.controlReceipts?.length) {
      for (const receipt of outstanding.frame.controlReceipts) {
        post(postMessage, {
          type: 'force-control-result',
          requestId: state.requestId,
          commandSeq: receipt.commandSeq,
          ...receipt,
        });
      }
    }
    if (outstanding.frame.terminal !== 'none') {
      sendTerminal(state, outstanding.frame);
      return;
    }
    advance(state);
  }

  function sendFrame(state, frame, type = 'step') {
    state.outstanding = { frame };
    post(postMessage, {
      type,
      requestId: state.requestId,
      topology: type === 'ready' ? state.topology : undefined,
      ...frame,
    }, [frame.positions.buffer]);
  }

  function advance(state) {
    try {
      const frame = state.session.advanceOneStep();
      sendFrame(state, frame, 'step');
    } catch (error) {
      state.session.dispose();
      sendFailure(state.requestId, error, { globalStep: state.session.state?.globalStep });
      active = null;
    }
  }

  function startV2(request, presentation = 'all-steps') {
    const session = createForceLayoutSession(request);
    const state = {
      session,
      requestId: request.requestId,
      topology: session.topology(),
      epoch: 0,
      phase: 'running',
      presentation,
      outstanding: null,
      terminalBuffer: null,
    };
    active = state;

    if (presentation === 'final-only') {
      try {
        let frame = session.initialFrame();
        while (frame.terminal === 'none') frame = session.advanceOneStep();
        if (frame.terminal === 'none') return;
        sendTerminal(state, frame);
      } catch (error) {
        session.dispose();
        sendFailure(request.requestId, error);
        active = null;
      }
      return;
    }

    sendFrame(state, session.initialFrame(), 'ready');
  }

  function startLegacy(request, calculateFn) {
    try {
      const result = calculateFn(request);
      if (result.requestId !== request.requestId) {
        sendFailure(request.requestId, { code: 'INTERNAL_ERROR', details: {} });
        return;
      }
      post(postMessage, { type: 'success', requestId: request.requestId, result });
    } catch (error) {
      post(postMessage, { type: 'failure', requestId: request.requestId, error: errorEnvelope(error) });
    }
  }

  function handle(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'calculate' && message.request) {
      if (active) {
        active.session?.dispose();
        active = null;
      }
      if (message.request.config?.version === 2 && message.request.config.maxCoolingSteps !== undefined) {
        startV2(message.request, message.presentation || message.request.presentation || 'all-steps');
      } else {
        const calculateFn = message.request.mode === 'force-anchors' && calculateForce ? calculateForce : calculate;
        startLegacy(message.request, calculateFn);
      }
      return;
    }
    if (!active) return;
    const state = active;
    if (message.requestId !== state.requestId) {
      post(postMessage, {
        type: 'failure',
        requestId: message.requestId,
        error: { code: 'WRONG_REQUEST', details: { expected: state.requestId } },
      });
      return;
    }
    if (message.type === 'painted' || message.type === 'suppress') {
      if (!state.outstanding || message.globalStep !== state.outstanding.frame.globalStep) {
        sendFailure(state.requestId, { code: 'PROTOCOL_ERROR', details: { reason: 'unexpected-paint-receipt' } });
        state.session.dispose();
        active = null;
        return;
      }
      if (message.buffer instanceof ArrayBuffer) {
        state.outstanding.frame.positions = new Float32Array(message.buffer);
      }
      afterPaint(state);
      return;
    }
    if (message.type === 'force-control') {
      if (!['retained-settled', 'held', 'cooling'].includes(state.phase)) {
        post(postMessage, {
          type: 'force-control-result',
          requestId: state.requestId,
          commandSeq: message.commandSeq,
          accepted: false,
          epoch: state.session.state.epoch,
          appliedAfterGlobalStep: null,
          fixedCount: state.session.fixedLeaves.size,
          error: { code: 'SESSION_NOT_SETTLED', details: { phase: state.phase } },
        });
        return;
      }
      try {
        const rejection = state.session.enqueueControl({
          requestId: state.requestId,
          commandSeq: message.commandSeq,
          ...message.command,
        });
        if (rejection) {
          post(postMessage, { type: 'force-control-result', requestId: state.requestId, commandSeq: message.commandSeq, ...rejection });
          return;
        }
        state.phase = state.session.fixedLeaves.size > 0 ? 'held' : 'cooling';
        if (!state.outstanding) advance(state);
      } catch (error) {
        sendFailure(state.requestId, error);
        state.session.dispose();
        active = null;
      }
      return;
    }
    if (message.type === 'session-result-committed') {
      if (state.terminalBuffer && message.terminalBuffer && message.terminalBuffer !== state.terminalBuffer) {
        sendFailure(state.requestId, { code: 'PROTOCOL_ERROR', details: { reason: 'terminal-buffer-mismatch' } });
        state.session.dispose();
        active = null;
        return;
      }
      state.phase = 'retained-settled';
      state.epoch = message.epoch ?? state.session.state.epoch;
      state.session.state.phase = 'settled';
      state.terminalBuffer = null;
      return;
    }
    if (message.type === 'cancel' || message.type === 'dispose') {
      state.session.dispose();
      active = null;
    }
  }

  return { handle, getState: () => active };
}

// This entry point remains intentionally stateless for unit tests that inject
// a calculation function. The actual module worker uses the persistent
// controller below.
export function handleWorkerMessage(message, postMessage, calculate = calculateLayout, calculateForce) {
  createWorkerController(postMessage, calculate, calculateForce ?? calculate).handle(message);
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  const controller = createWorkerController((message, transfer) => self.postMessage(message, transfer));
  self.addEventListener('message', (event) => controller.handle(event.data));
}

export { createWorkerController };
