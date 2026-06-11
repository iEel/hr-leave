import assert from 'node:assert/strict';
import {
    formatAdvanceNoticeRule,
    formatVacationAdvanceNoticeError,
    isLeaveDateAllowedByAdvanceNotice,
    parseAdvanceNoticeDays,
} from '../src/lib/leave-advance-notice.ts';

assert.equal(parseAdvanceNoticeDays('-30', 3), -30, 'negative values should allow backdated leave windows');
assert.equal(parseAdvanceNoticeDays('0', 3), 0, 'zero should allow same-day leave requests');
assert.equal(parseAdvanceNoticeDays('5', 3), 5, 'positive values should require future advance notice');
assert.equal(parseAdvanceNoticeDays('invalid', 3), 3, 'invalid values should use fallback');

assert.equal(
    formatAdvanceNoticeRule(-30),
    'ย้อนหลังได้ไม่เกิน 30 วัน',
    'negative rule text should describe a backdated window'
);
assert.equal(
    formatAdvanceNoticeRule(0),
    'ขอวันเดียวกับวันที่ลาได้',
    'zero rule text should describe same-day leave'
);
assert.equal(
    formatAdvanceNoticeRule(3),
    'ต้องแจ้งล่วงหน้าอย่างน้อย 3 วัน',
    'positive rule text should describe advance notice'
);

assert.equal(
    isLeaveDateAllowedByAdvanceNotice('2026-06-01', '2026-06-11', -10),
    true,
    'negative rule should allow leave exactly at the backdated limit'
);
assert.equal(
    isLeaveDateAllowedByAdvanceNotice('2026-05-31', '2026-06-11', -10),
    false,
    'negative rule should reject leave older than the backdated limit'
);
assert.equal(
    isLeaveDateAllowedByAdvanceNotice('2026-06-11', '2026-06-11', 0),
    true,
    'zero rule should allow same-day leave'
);
assert.equal(
    isLeaveDateAllowedByAdvanceNotice('2026-06-10', '2026-06-11', 0),
    false,
    'zero rule should reject backdated leave'
);
assert.equal(
    isLeaveDateAllowedByAdvanceNotice('2026-06-14', '2026-06-11', 3),
    true,
    'positive rule should allow leave after enough advance notice'
);
assert.equal(
    isLeaveDateAllowedByAdvanceNotice('2026-06-13', '2026-06-11', 3),
    false,
    'positive rule should reject leave without enough advance notice'
);

assert.equal(
    formatVacationAdvanceNoticeError(-30),
    'การลาพักร้อนย้อนหลังได้ไม่เกิน 30 วัน',
    'negative error should describe a backdated window'
);
assert.equal(
    formatVacationAdvanceNoticeError(0),
    'การลาพักร้อนย้อนหลังไม่ได้',
    'zero error should explain that backdated leave is not allowed'
);
assert.equal(
    formatVacationAdvanceNoticeError(3),
    'การลาพักร้อนต้องแจ้งล่วงหน้าอย่างน้อย 3 วัน',
    'positive error should describe advance notice'
);

console.log('leave advance notice tests passed');
