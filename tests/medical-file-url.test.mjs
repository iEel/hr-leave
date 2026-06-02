import assert from 'node:assert/strict';
import { normalizeMedicalCertificateFileUrl } from '../src/lib/medical-files.ts';

const cases = [
    [null, null, 'keeps null values as null'],
    ['', null, 'treats empty strings as null'],
    ['/api/files/medical/EMP001_1700000000000.pdf', '/api/files/medical/EMP001_1700000000000.pdf', 'keeps current API URLs unchanged'],
    ['/uploads/medical/EMP001_1700000000000.pdf', '/api/files/medical/EMP001_1700000000000.pdf', 'converts legacy static upload URLs'],
    ['uploads/medical/EMP001_1700000000000.png', '/api/files/medical/EMP001_1700000000000.png', 'converts legacy upload URLs without a leading slash'],
    ['EMP001_1700000000000.jpg', '/api/files/medical/EMP001_1700000000000.jpg', 'converts bare stored filenames'],
];

for (const [input, expected, message] of cases) {
    assert.equal(normalizeMedicalCertificateFileUrl(input), expected, message);
}

console.log('medical file URL normalization tests passed');
