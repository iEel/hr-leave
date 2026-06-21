import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routePath = join(process.cwd(), 'src/app/api/leave/detail/[leaveId]/route.ts');
const source = readFileSync(routePath, 'utf8');

assert.match(source, /auth\(\)/);
assert.match(source, /canViewLeaveDetail/);
assert.match(source, /getDelegatingManagers/);
assert.match(source, /normalizeMedicalCertificateFileRecord/);
assert.match(source, /Permission denied/);

const ownerLookupPosition = source.indexOf('const ownerResult');
const permissionCheckPosition = source.indexOf('const canView = canViewLeaveDetail');
const medicalFileSelectionPosition = source.indexOf('lr.medicalCertificateFile');

assert.notEqual(ownerLookupPosition, -1, 'route should load a minimal owner row before full leave details');
assert.notEqual(permissionCheckPosition, -1, 'route should check leave detail permission');
assert.notEqual(medicalFileSelectionPosition, -1, 'route should fetch medical file only in full detail query');
assert.ok(
    ownerLookupPosition < permissionCheckPosition,
    'minimal owner lookup should happen before permission check'
);
assert.ok(
    permissionCheckPosition < medicalFileSelectionPosition,
    'permission check should happen before selecting medicalCertificateFile'
);

console.log('leave detail route guard passed');
