// A successful awaited close is the only clearance, not kill/disconnect or a PID.
async function closeAndConfirm(close, confirmed) {
    await close();
    confirmed();
}
module.exports = {closeAndConfirm};
