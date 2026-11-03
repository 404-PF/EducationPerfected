// One versioned record avoids mixing an old email with a newly saved password.
// Linux must use persistent Secret Service, never the ephemeral kernel fallback.
const SERVICE = 'EducationPerfected';
const ACCOUNT = 'login-v1';
function createCredentialStore({ Entry = require('./native-binding').loadBinding().AsyncEntry } = {}) {
    const entry = () => new Entry(SERVICE, ACCOUNT, { linux: { store: 'secret-service' } });
    return {
        async read() {
            const raw = await entry().getPassword();
            if (raw === null) return null;
            let record;
            try { record = JSON.parse(raw); } catch { throw new Error('Saved login is invalid; run credential setup again.'); }
            if (record?.version !== 1 || typeof record.email !== 'string' || !record.email.trim() || typeof record.password !== 'string' || !record.password) {
                throw new Error('Saved login is invalid; run credential setup again.');
            }
            return { email: record.email, password: record.password };
        },
        async save(record) {
            if (typeof record?.email !== 'string' || !record.email.trim() || typeof record.password !== 'string' || !record.password) throw new Error('Email and password are required.');
            await entry().setPassword(JSON.stringify({ version: 1, email: record.email.trim(), password: record.password }));
        },
        async remove() { return entry().deletePassword(); },
    };
}
module.exports = { createCredentialStore };
