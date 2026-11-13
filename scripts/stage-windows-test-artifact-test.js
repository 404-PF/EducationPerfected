const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { hashFile } = require("./beta-candidate"),
  { stage } = require("./stage-windows-test-artifact");
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ep-artifact-inert-"));
  try {
    const source = path.join(root, "source");
    fs.mkdirSync(source);
    fs.mkdirSync(path.join(source, "THIRD-PARTY-NOTICES"));
    fs.writeFileSync(path.join(source, "educationperfected.exe"), "inert-exe");
    fs.writeFileSync(
      path.join(source, "THIRD-PARTY-NOTICES", "NOTICE.txt"),
      "notice",
    );
    fs.writeFileSync(path.join(source, "private-credentials"), "never stage");
    const files = await Promise.all(
      ["educationperfected.exe", "THIRD-PARTY-NOTICES/NOTICE.txt"].map(
        async (file) => ({
          path: file,
          ...(await hashFile(path.join(source, file))),
        }),
      ),
    );
    const candidate = {
      schemaVersion: 2,
      labelKind: "internal-validation-not-release",
      status: "build-only-not-for-distribution",
      publicationAuthorized: false,
      sourceCommit: "a".repeat(40),
      validationLabel: "2026.11.13-validation.8",
      target: "windows-x64",
      distributionMode: "direct-google-download",
      browserBundled: false,
      files,
    };
    const save = () =>
      fs.writeFileSync(
        path.join(source, "CANDIDATE.json"),
        JSON.stringify(candidate),
      );
    save();
    fs.writeFileSync(
      path.join(source, "SHA256SUMS"),
      files.map((file) => file.sha256 + "  " + file.path).join("\n") + "\n",
    );
    const output = path.join(root, "out");
    await stage(source, output, candidate.sourceCommit);
    assert.deepEqual(
      fs.readdirSync(output).sort((a, b) => a.localeCompare(b, "en")),
      [
        "CANDIDATE.json",
        "SHA256SUMS",
        "TESTING.txt",
        "THIRD-PARTY-NOTICES",
        "educationperfected.exe",
      ].sort((a, b) => a.localeCompare(b, "en")),
    );
    assert.match(
      fs.readFileSync(path.join(output, "TESTING.txt"), "utf8"),
      /UNSIGNED/,
    );
    await Promise.all(
      files.map(async (file) =>
        assert.deepEqual(await hashFile(path.join(output, file.path)), {
          sha256: file.sha256,
          size: file.size,
        }),
      ),
    );
    await [
      ["schemaVersion", 1],
      ["labelKind", "release"],
      ["status", "ready"],
      ["publicationAuthorized", true],
    ].reduce(
      (previous, [key, value]) =>
        previous.then(async () => {
          const old = candidate[key];
          candidate[key] = value;
          save();
          await assert.rejects(
            stage(
              source,
              path.join(root, "invalid-" + key),
              candidate.sourceCommit,
            ),
          );
          candidate[key] = old;
        }),
      Promise.resolve(),
    );
    save();
    await assert.rejects(stage(source, output, candidate.sourceCommit));
    await assert.rejects(
      stage(source, path.join(root, "wrong"), "b".repeat(40)),
    );
    candidate.files.push({ ...files[0], path: "../private-credentials" });
    save();
    await assert.rejects(
      stage(source, path.join(root, "escape"), candidate.sourceCommit),
    );
    candidate.files.pop();
    save();
    fs.appendFileSync(path.join(source, "educationperfected.exe"), "tampered");
    await assert.rejects(
      stage(source, path.join(root, "changed"), candidate.sourceCommit),
    );
    console.log(
      "Internal Windows test staging exact-byte allowlist, notices, privacy, duplicate-output and tamper refusal passed (inert only).",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
