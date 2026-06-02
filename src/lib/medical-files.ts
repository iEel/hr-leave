const MEDICAL_FILE_API_PREFIX = '/api/files/medical/';
const LEGACY_MEDICAL_UPLOAD_PREFIX = '/uploads/medical/';

function getPathname(value: string) {
    const withoutQuery = value.split(/[?#]/, 1)[0];

    try {
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withoutQuery)) {
            return new URL(withoutQuery).pathname;
        }
    } catch {
        return withoutQuery;
    }

    return withoutQuery;
}

function getFilenameFromKnownMedicalPath(pathname: string, prefix: string) {
    const filename = pathname.slice(prefix.length).split('/').pop();
    return filename || null;
}

export function normalizeMedicalCertificateFileUrl(fileUrl: string | null | undefined) {
    const rawValue = fileUrl?.trim();
    if (!rawValue) return null;

    const pathname = getPathname(rawValue.replace(/\\/g, '/'));
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

    if (normalizedPath.startsWith(MEDICAL_FILE_API_PREFIX)) {
        return normalizedPath;
    }

    if (normalizedPath.startsWith(LEGACY_MEDICAL_UPLOAD_PREFIX)) {
        const filename = getFilenameFromKnownMedicalPath(normalizedPath, LEGACY_MEDICAL_UPLOAD_PREFIX);
        return filename ? `${MEDICAL_FILE_API_PREFIX}${filename}` : null;
    }

    if (!pathname.includes('/')) {
        return `${MEDICAL_FILE_API_PREFIX}${pathname}`;
    }

    return rawValue;
}

export function normalizeMedicalCertificateFileRecord<T extends { medicalCertificateFile: string | null }>(record: T) {
    return {
        ...record,
        medicalCertificateFile: normalizeMedicalCertificateFileUrl(record.medicalCertificateFile),
    };
}
