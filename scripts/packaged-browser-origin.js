// Fixture diagnostics contain relationship flags only, never host paths.
const fs = require('node:fs');
const path = require('node:path');
function contained(root, file) {
 const relative = path.relative(root, file);
 return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function browserOriginEvidence(root, executable) {
 const evidence = { argvAbsolute: typeof executable === 'string' && path.isAbsolute(executable), rawContained: false, canonicalContained: false, ownedComponent: false, isFile: false, missingFile: false, identityUnavailable: false };
 if (!evidence.argvAbsolute) return evidence;
 evidence.rawContained = contained(path.resolve(root), executable);
 try {
  const owned = fs.realpathSync(root), actual = fs.realpathSync(executable);
  evidence.canonicalContained = contained(owned, actual);
  evidence.ownedComponent = evidence.canonicalContained && path.relative(owned, actual).split(path.sep)[0].startsWith('educationperfected-');
  evidence.isFile = fs.statSync(actual).isFile();
 } catch (error) {
  evidence.missingFile = error?.code === 'ENOENT';
  evidence.identityUnavailable = true;
 }
 return evidence;
}
function browserIsInOwnedExtraction(root, executable) {
 const evidence = browserOriginEvidence(root, executable);
 return evidence.argvAbsolute && evidence.canonicalContained && evidence.ownedComponent && evidence.isFile && !evidence.identityUnavailable;
}
module.exports = { browserIsInOwnedExtraction, browserOriginEvidence };
