// Explicit opt-in test distribution only, not a release or certification.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { hashFile, validationLabel } = require("./beta-candidate");
async function stage(source, destination, commit) {
  const regular = (file) => {
    const stat = fs.lstatSync(file);
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink(),
      "Expected regular artifact file",
    );
  };
  const directory = (file) => {
    const stat = fs.lstatSync(file);
    assert.ok(
      stat.isDirectory() && !stat.isSymbolicLink(),
      "Expected real artifact directory",
    );
  };
  directory(source);
  directory(path.join(source, "THIRD-PARTY-NOTICES"));
  for (const name of ["CANDIDATE.json", "SHA256SUMS"])
    regular(path.join(source, name));
  const candidate = JSON.parse(
    fs.readFileSync(path.join(source, "CANDIDATE.json"), "utf8"),
  );
  assert.equal(candidate.schemaVersion, 2);
  assert.equal(candidate.labelKind, "internal-validation-not-release");
  assert.equal(candidate.status, "build-only-not-for-distribution");
  assert.equal(candidate.publicationAuthorized, false);
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(candidate.sourceCommit, commit);
  assert.equal(candidate.target, "windows-x64");
  validationLabel(candidate.validationLabel);
  assert.equal(candidate.distributionMode, "direct-google-download");
  assert.equal(candidate.browserBundled, false);
  assert.ok(
    Array.isArray(candidate.files) &&
      candidate.files.length > 1 &&
      candidate.files.length < 2000,
  );
  const seen = new Set();
  await candidate.files.reduce(
    (previous, record) =>
      previous.then(async () => {
        assert.ok(
          record.path === "educationperfected.exe" ||
            /^THIRD-PARTY-NOTICES\/[A-Za-z0-9_.@+/-]+$/.test(record.path),
        );
        assert.ok(
          !record.path
            .split("/")
            .some((part) => !part || part === "." || part === ".."),
        );
        assert.ok(!seen.has(record.path));
        seen.add(record.path);
        const file = path.join(source, record.path);
        regular(file);
        assert.ok(
          fs.realpathSync(file).startsWith(fs.realpathSync(source) + path.sep),
        );
        const actual = await hashFile(file);
        assert.equal(actual.sha256, record.sha256);
        assert.equal(actual.size, record.size);
      }),
    Promise.resolve(),
  );
  assert.ok(seen.has("educationperfected.exe"));
  assert.ok([...seen].some((name) => name.startsWith("THIRD-PARTY-NOTICES/")));
  const expected =
    candidate.files
      .map((record) => record.sha256 + "  " + record.path)
      .join("\n") + "\n";
  assert.equal(
    fs.readFileSync(path.join(source, "SHA256SUMS"), "utf8"),
    expected,
  );
  // Exclusive mkdir prevents silently reusing a stale output or following a planted directory.
  fs.mkdirSync(destination);
  for (const name of [...seen, "CANDIDATE.json", "SHA256SUMS"]) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(
      path.join(source, name),
      target,
      fs.constants.COPYFILE_EXCL,
    );
  }
  fs.writeFileSync(
    path.join(destination, "TESTING.txt"),
    `UNPUBLISHED INTERNAL WINDOWS X64 TEST BUILD - UNSIGNED\nPrepared stable version: ${candidate.sourceVersion} (not published or certified)
Source: ${commit}\nLabel: ${candidate.validationLabel}\nNot a release, not certified, no bundled Chrome. Keep all notices.\nFirst run asks to download pinned Chrome from Google (about 200MB).\nWindows hosted first-run currently fails; cached startup is intermittent.\nSmartScreen/Defender may warn because no publisher signature exists. Do not disable security protections.\nOpen educationperfected.exe from Terminal. No real credentials are needed to observe startup.\nDo not enter start or refresh or open a real task/assessment for this startup test.\nSend the terminal error or screenshot with credentials removed.\n`,
    { flag: "wx" },
  );
}
if (require.main === module) {
  assert.equal(process.platform, "win32");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
  stage(
    path.resolve("build/windows-x64-downloadable"),
    path.resolve("build/windows-internal-test"),
    process.env.GITHUB_SHA,
  ).catch(() => {
    console.error(
      "Internal test artifact validation failed; no upload allowed.",
    );
    process.exitCode = 1;
  });
}
module.exports = { stage };
