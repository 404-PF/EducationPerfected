// PTY test preload: replace storage before CLI loads. Never calls a native store.
const store = require.resolve('../lib/credential-store');
require.cache[store] = { id: store, filename: store, loaded: true, exports: {
    createCredentialStore: () => ({ save: async () => {}, remove: async () => false, read: async () => null }),
} };
