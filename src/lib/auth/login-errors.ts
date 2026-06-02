const INVALID_CREDENTIAL_ERRORS = new Set([
    'Configuration',
    'CredentialsSignin',
    'CallbackRouteError',
]);

export function getLoginErrorMessage(error: string | null | undefined) {
    if (error && INVALID_CREDENTIAL_ERRORS.has(error)) {
        return 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';
    }

    if (error === 'AccessDenied') {
        return 'คุณไม่มีสิทธิ์เข้าใช้งานระบบ';
    }

    return 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
}
