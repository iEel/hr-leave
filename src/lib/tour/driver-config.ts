import { driver, Config, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

// Base configuration
const baseConfig: Config = {
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    nextBtnText: 'ถัดไป →',
    prevBtnText: '← ก่อนหน้า',
    doneBtnText: '✓ เสร็จสิ้น',
    progressText: '{{current}} จาก {{total}}',
    popoverClass: 'driverjs-theme',
    stagePadding: 5,
    stageRadius: 5,
};

// Employee Tour Steps
export const employeeTourSteps: DriveStep[] = [
    {
        element: '[data-tour="dashboard-balance"]',
        popover: {
            title: '📊 ยอดวันลาคงเหลือ',
            description: 'ดูยอดวันลาแต่ละประเภทที่คุณมี รวมถึงจำนวนวันที่ใช้ไปแล้ว',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="request-leave-btn"]',
        popover: {
            title: '✏️ ขอลา',
            description: 'คลิกที่นี่เพื่อยื่นคำขอลา สามารถเลือกประเภทลา วันที่ และระบุเหตุผลได้',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="leave-history"]',
        popover: {
            title: '📋 ประวัติการลา',
            description: 'ดูประวัติการลาทั้งหมดของคุณ พร้อมสถานะ (รออนุมัติ/อนุมัติ/ไม่อนุมัติ)',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="upcoming-holidays"]',
        popover: {
            title: '🎉 วันหยุดที่จะถึง',
            description: 'ดูวันหยุดนักขัตฤกษ์และวันหยุดพิเศษที่กำลังจะมาถึง',
            side: 'left',
            align: 'start',
        },
    },
];

// Manager Tour Steps
export const managerTourSteps: DriveStep[] = [
    {
        element: '[data-tour="dashboard-balance"]',
        popover: {
            title: '📊 ยอดวันลาของคุณ',
            description: 'ดูยอดวันลาส่วนตัวของคุณ',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="approvals-nav"]',
        popover: {
            title: '✅ การอนุมัติ',
            description: 'เมนูนี้ใช้สำหรับอนุมัติ/ปฏิเสธคำขอลาของลูกน้อง',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="pending-approvals"]',
        popover: {
            title: '⏳ รออนุมัติ',
            description: 'รายการคำขอลาที่รอการอนุมัติจากคุณจะแสดงที่นี่',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="team-leave"]',
        popover: {
            title: '👥 ทีมของฉัน',
            description: 'ดูสถานะการลาของลูกน้องทั้งหมดในทีม',
            side: 'left',
            align: 'start',
        },
    },
];

// Create Employee Tour
export function createEmployeeTour() {
    return driver({
        ...baseConfig,
        steps: employeeTourSteps,
        onDestroyed: () => {
            localStorage.setItem('tour-employee-completed', 'true');
        },
    });
}

// Create Manager Tour
export function createManagerTour() {
    return driver({
        ...baseConfig,
        steps: managerTourSteps,
        onDestroyed: () => {
            localStorage.setItem('tour-manager-completed', 'true');
        },
    });
}
