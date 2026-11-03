// Run from the same terminal/network as the API. No credentials required or printed.
import { lookup } from 'node:dns/promises';
const targets = [
  ['KissKH search', 'https://kisskh.do/api/DramaList/Search?q=Money%20Heist'],
  [
    'MovieBox metadata',
    'https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=money-heist-8UcoFG3Uog',
  ],
];
for (const [label, url] of targets) {
  const start = Date.now();
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true });
    console.log(`${label}: DNS resolved (${addresses.map((a) => `IPv${a.family}`).join(', ')})`);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
    console.log(
      `${label}: HTTP ${response.status}, ${response.headers.get('content-type') ?? 'no content type'}, ${Date.now() - start}ms`,
    );
    await response.body?.cancel();
  } catch (error) {
    const codes = new Set([
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENETUNREACH',
      'UND_ERR_CONNECT_TIMEOUT',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ]);
    const code = error.cause?.code ?? error.code;
    console.log(
      `${label}: ${codes.has(code) ? code : error.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_FAILED'}, ${Date.now() - start}ms`,
    );
    process.exitCode = 1;
  }
}
