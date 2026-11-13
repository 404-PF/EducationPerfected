// PTY test preload: replace storage before CLI loads. Never calls a native store.
const store = require.resolve('../lib/credential-store');
require.cache[store] = { id: store, filename: store, loaded: true, exports: {
    createCredentialStore: () => ({ save: async () => {}, remove: async () => false, read: async () => null }),
} };

const downloader=require.resolve('../packaging/download-browser');
require.cache[downloader]={id:downloader,filename:downloader,loaded:true,exports:{ensureBrowser:async()=>'/inert-cached-browser'}};
