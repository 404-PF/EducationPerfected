# Packaged app storage

The packaged CLI uses one app-owned root: `%USERPROFILE%\.educationperfected\`
on Windows, or `~/.educationperfected/` on Linux/macOS.

- `browsers/156.0.8078.47-<platform>/`: existing persistent Chrome download,
  notices and COMPLETE.json receipt. Existing downloads are reused unchanged.
- `browsers/.download-*` and `<version>-<platform>.lock`: existing acquisition
  staging/lock behavior, not deleted by runtime cleanup.
- `tmp/run-<random>/`: native keyring binding and Puppeteer's temporary Chrome
  profile. The bootstrap sets PUPPETEER_TMP_DIR to this run directory, overriding
  an inherited temporary-profile location for the packaged app only. Browser
  profile files may contain cookies/session tokens, website storage and caches.
  Development embedded-browser builds also extract their browser here.
- `tmp/run-<random>/OWNER.json`: PID/schema and cleanup state only, no credentials.

Normal confirmed browser closure plus native-worker exit permits run-directory
removal. The ownership receipt is deleted last, after payload files; a stale pending
receipt is safely replaced on retry. If removal fails after closure, the marker becomes cleanup-ready; next
startup retries removal only if that owner PID is definitively dead. Alive,
unqueryable, malformed, symlinked and running-marked directories are retained.
A dead app PID does not prove Chrome children exited, so crash leftovers are not
automatically deleted. This protects an old still-running browser profile. No
broad cleanup of OS temp folders or historical app temp files is performed.

Windows Credential Manager remains unchanged: service EducationPerfected,
account login-v1. No plaintext credential file is introduced. Chrome/Windows
AppContainer data under LocalAppData/Packages is outside this app-owned root
and cannot be moved by changing the Puppeteer profile directory. There is no
persistent app answer database/config/log added by this change. Terminal output
and OS/browser internal housekeeping remain separate.

Directories are checked as real non-symlink directories and removals are bounded
to recognized run entries. These checks assume no hostile same-user writer racing
path operations; they are not a new OS security boundary or Windows ACL proof.
Synthetic fixtures do not establish Windows cleanup or clean-machine evidence.
Source `npm run cli` storage is unchanged; this is the packaged bootstrap policy.

After bootstrap hands signals to launchProgram, graceful startup Ctrl+C/TERM/HUP
reports browser closure to bootstrap only
after its awaited browser close succeeds. It may then remove or mark the runtime
safe for retry, preserving signal exit codes. Failed close or forced exit before confirmation leaves the running marker retained.
An already confirmed close remains safe if another signal arrives afterward.
Signals before handoff have no browser owner and use bootstrap's existing cleanup.
