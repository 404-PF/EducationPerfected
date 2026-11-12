// Fixed literal presence only. Never return arbitrary child text, paths or secrets.
const markers={
 downloadVerified:'Browser download checksum verified',
 needsInteractiveDownload:'First browser download needs an interactive terminal',
 startupFailed:'EducationPerfected could not start.',
 opening:'Opening EducationPerfected. Finish sign-in in the browser.',
 ownerReady:'EP_TEST_LOGIN_READY',
 missingFile:'A required browser or runtime file is missing.',
 accessDenied:'The operating system denied access.',
 launchFailed:'The browser could not launch; check display and system browser dependencies.',
 connectionClosed:'The browser connection closed.',
 connectionRefused:'The browser connection was refused.',
 timedOut:'The browser or sign-in step timed out.',
 sandboxBlocked:'The browser sandbox was blocked by operating-system policy.',
 genericFailure:'The operation failed; check the browser, sign-in state and installed runtime.',
 integrityFailed:'Browser payload integrity check failed (EP_BROWSER_CHECKSUM)',
};
function startupEvidence(text){
 return Object.fromEntries(Object.entries(markers).map(([key,literal])=>[key,text.includes(literal)]));
}
module.exports={startupEvidence};
