const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../..');
const ts = require(root + '/node_modules/typescript');
class NR {
    static json(body, init = {}) { return { body, status: init.status || 200, cookies: { set() { } } }; }
    static redirect(url) { return { status: 307, url: String(url), cookies: { set() { } } }; }
}
let attempts = [], readFail = false, writeFail = false;
const admin = { from(table) { let insert = false; const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, order() { return q; }, single() { return q; }, insert() { insert = true; return q; }, then(resolve) { if (table === 'projects')
            return Promise.resolve({ data: { id: 'test-only', access_pin: '1234' } }).then(resolve); if (insert) {
            if (!writeFail)
                attempts.push({ attempted_at: new Date().toISOString() });
            return Promise.resolve({ error: writeFail ? { message: 'simulated DB failure' } : null }).then(resolve);
        } return Promise.resolve({ data: readFail ? null : attempts.slice(), error: readFail ? { message: 'simulated DB failure' } : null }).then(resolve); } }; return q; } };
function load(file, mocks) { const m = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: m, exports: m.exports, require: n => mocks[n], Date, URL, process: { env: {} }, console }); return m.exports; }
const safe = load('src/lib/customer-return-path.ts', {});
for (const value of ['https://outside.invalid', '//outside.invalid', 'javascript:void(0)', '/c/test-only/../../outside', '/c/other', '/\\outside.invalid', '/c/test-only/pin'])
    assert.equal(safe.customerReturnPath('test-only', value), '/c/test-only');
assert.equal(safe.customerReturnPath('test-only', '/c/test-only/gallery?liked=1'), '/c/test-only/gallery?liked=1');
const verify = load('src/app/api/c/verify-pin/route.ts', { 'next/server': { NextResponse: NR }, '@/lib/supabase-admin': { getAdminClient: () => admin }, '@/lib/customer-auth-server': { signPinCookie: () => 'mock' } });
const req = pin => ({ json: async () => ({ token: 'test-only', pin }), headers: new Headers() });
(async () => {
    for (let run = 1; run <= 2; run++) {
        attempts = [];
        readFail = false;
        writeFail = true;
        const statuses = [];
        for (let i = 0; i < 8; i++)
            statuses.push((await verify.POST(req('0000'))).status);
        assert.deepEqual(statuses, Array(8).fill(500));
        console.log('write-failure run', run, statuses, 'stored attempts', attempts.length);
        attempts = Array.from({ length: 5 }, () => ({ attempted_at: new Date().toISOString() }));
        readFail = true;
        writeFail = false;
        const unlocked = await verify.POST(req('1234'));
        assert.equal(unlocked.status, 500);
        console.log('read-failure with five failures run', run, unlocked.status);
    }
    const noPinAdmin = { from() { const q = { select() { return q; }, eq() { return q; }, single() { return Promise.resolve({ data: { access_pin: null } }); } }; return q; } };
    const auto = load('src/app/api/c/auto-verify/route.ts', { 'next/server': { NextResponse: NR }, '@/lib/customer-return-path': safe, '@/lib/supabase-admin': { getAdminClient: () => noPinAdmin }, '@/lib/customer-auth-server': { signPinCookie: () => 'mock' } });
    for (let run = 1; run <= 2; run++) {
        for (const to of ['https://outside.invalid/phishing', '//outside.invalid/phishing']) {
            const url = 'http://localhost:3001/api/c/auto-verify?token=test-only&to=' + encodeURIComponent(to);
            const r = await auto.GET({ url, nextUrl: new URL(url) });
            assert.equal(r.url, "http://localhost:3001/c/test-only");
            console.log('open redirect run', run, r.status, r.url);
        }
    }
})();
