// Packaged entrypoint supplies the extracted native module before loading CLI.
let packaged;
function setPackagedBinding(binding) { packaged = binding; }
function loadBinding() { return packaged || require('@napi-rs/keyring'); }
module.exports = { setPackagedBinding, loadBinding };
