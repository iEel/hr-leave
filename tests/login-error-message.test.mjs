import assert from 'node:assert/strict';
import { getLoginErrorMessage } from '../src/lib/auth/login-errors.ts';

const cases = [
    ['Configuration', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'],
    ['CredentialsSignin', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'],
    ['CallbackRouteError', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'],
    ['AccessDenied', 'คุณไม่มีสิทธิ์เข้าใช้งานระบบ'],
    [null, 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'],
    ['UnexpectedError', 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'],
];

for (const [input, expected] of cases) {
    assert.equal(getLoginErrorMessage(input), expected);
}

console.log('login error message tests passed');
