import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

test('Hostinger-style import starts a server and serves the health check within three seconds', async () => {
  const entry = new URL('../app/server.mjs', import.meta.url).href;
  // Hostinger imports the entry file from its own runner, rather than executing
  // it as process.argv[1]. Observe listen() the same way, without importing the
  // test-only application factory or starting a server ourselves.
  const runner = `
    import http from 'node:http';
    const originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once('listening', async () => {
        try {
          const address = this.address();
          const response = await fetch('http://127.0.0.1:' + address.port + '/api/health');
          const body = await response.json();
          console.log('HOSTINGER_STARTUP ' + JSON.stringify({status: response.status, body, address: address.address}));
        } catch (error) {
          console.error(error);
          process.exitCode = 1;
        } finally {
          this.closeAllConnections();
          this.close();
        }
      });
      return originalListen.apply(this, args);
    };
    await import(${JSON.stringify(entry)});
  `;
  const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', runner], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {...process.env, NODE_ENV: 'production', PORT: '0', SITE_URL: 'https://centredbycare.com.au', OPENAI_API_KEY: ''},
    timeout: 3000,
    maxBuffer: 100000,
  });
  const result = stdout.split('\n').find(line => line.startsWith('HOSTINGER_STARTUP '));
  assert.ok(result, 'The imported entry file must call listen() without a direct-execution guard');
  assert.deepEqual(JSON.parse(result.slice('HOSTINGER_STARTUP '.length)), {
    status: 200,
    body: {ok: true},
    address: '0.0.0.0',
  });
});
