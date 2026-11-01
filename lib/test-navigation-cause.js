// Diagnostic-only fixed fields. Never emit arbitrary message, stack, URL or path.
function navigationCause(error) {
 const message = typeof error?.message === 'string' ? error.message : '';
 if (error?.name === 'TimeoutError') return 'navigation-timeout';
 if (/Navigating frame was detached|detached Frame|Requesting main frame too early/.test(message)) return 'target-detached';
 if (/Session closed|Target closed|browser has disconnected|Connection closed/i.test(message)) return 'browser-disconnected';
 if (error?.name === 'ProtocolError') return 'protocol-error';
 return 'other';
}
function recordNavigationFailure(error, testBoot, startedAt, report = console.error, now = Date.now) {
 if (!testBoot) return;
 try {
  const duration = now() - startedAt;
  const elapsedMs = Number.isFinite(duration) ? Math.max(0, Math.min(120000, Math.floor(duration))) : null;
  report('EP_TEST_NAVIGATION_FAILURE=' + JSON.stringify({
   category:navigationCause(error), elapsedMs,
   controllerConnected:null, markerEmitted:false, browserExitCodeClass:'unobserved',
  }));
 } catch {} // A diagnostic sink cannot replace the original navigation failure.
}
module.exports = {navigationCause,recordNavigationFailure};
