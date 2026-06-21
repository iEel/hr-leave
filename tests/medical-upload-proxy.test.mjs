import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/proxy.ts', 'utf8');

assert.match(
    source,
    /MEDICAL_UPLOAD_PREFIX\s*=\s*['"]\/uploads\/medical\/['"]/,
    'proxy should identify legacy medical upload URLs separately'
);

assert.match(
    source,
    /pathname\.startsWith\(MEDICAL_UPLOAD_PREFIX\)/,
    'proxy should handle direct legacy medical upload requests before public route checks'
);

assert.match(
    source,
    /protectedUrl\.pathname\s*=\s*`\/api\/files\/medical\/\$\{filename\}`/,
    'legacy medical upload URLs should be rewritten to the protected API route'
);

assert.match(
    source,
    /['"]\/uploads\/medical\/:path\*['"]/,
    'proxy matcher should include legacy medical upload URLs even though uploads are otherwise excluded'
);

console.log('medical upload proxy guard passed');
