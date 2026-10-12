import {createApplication} from './application.mjs';

// Hostinger imports this entry file from its own runner. Start unconditionally;
// a direct-execution guard would prevent listen() and cause a 503.
const server = await createApplication();
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.on('error', error => {
  console.error('Care Beyond assistant failed to start:', error.code || error.name);
  process.exit(1);
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('Care Beyond assistant is listening.');
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
