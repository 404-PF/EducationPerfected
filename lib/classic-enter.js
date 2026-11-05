// Final classic dispatch boundary, shared by the initial and retry paths.
// Reads are not atomic with the trusted key event; post-read drift remains possible.
async function guardClassicEnter({ readQuestion, readValue, pressEnter, shouldStop, question, answer, enter }) {
    const current = await readQuestion();
    if (current?.kind !== 'text' || current.text !== question) return false;
    if (await readValue() !== answer || shouldStop()) return false;
    if (enter) await pressEnter(); // A thrown/uncertain dispatch is never retried here.
    return true;
}
module.exports = { guardClassicEnter };
