/**
 * Vietnamese labels for every enum member.
 *
 * The UI shows the Vietnamese label to humans and the raw English enum code
 * beside it wherever the code matters (status chips, event rows, error
 * toasts) — the codes are the backend contract and stay verbatim.
 */

import {
  type BatchStatus,
  type DeadlineRisk,
  type DefectType,
  type EventType,
  type NotificationStatus,
  type OrderStatus,
  type Priority,
  type QCResult,
  type Role,
  type Severity,
  type StageStatus,
  type StageType,
} from "./enums"

/** §2 — the workshop names for each stage. */
export const STAGE_LABEL: Record<StageType, string> = {
  FORMING: "Tạo hình mộc",
  DRYING: "Phơi/Sấy & Sửa mộc",
  DECORATING: "Vẽ họa tiết",
  GLAZING: "Tráng men",
  FIRING: "Nung lò",
  QUALITY_CHECK: "Kiểm định chất lượng",
  PACKAGING: "Đóng gói",
}

/** Compact form for the board column headers, where space is tight. */
export const STAGE_LABEL_SHORT: Record<StageType, string> = {
  FORMING: "Tạo hình",
  DRYING: "Phơi/Sấy",
  DECORATING: "Vẽ họa tiết",
  GLAZING: "Tráng men",
  FIRING: "Nung lò",
  QUALITY_CHECK: "Kiểm định",
  PACKAGING: "Đóng gói",
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  PENDING: "Chờ",
  IN_PROGRESS: "Đang chạy",
  COMPLETED: "Hoàn thành",
  FAILED: "Lỗi",
  BLOCKED: "Bị khoá",
  REWORK_REQUIRED: "Cần làm lại",
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Nháp",
  AI_ANALYZING: "AI đang phân tích",
  AI_ANALYSIS_FAILED: "AI phân tích thất bại",
  PENDING_CONFIRMATION: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  IN_PRODUCTION: "Đang sản xuất",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
}

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  PENDING: "Chờ sản xuất",
  IN_PRODUCTION: "Đang sản xuất",
  BLOCKED: "Bị khoá",
  REWORK_REQUIRED: "Cần làm lại",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
}

export const QC_RESULT_LABEL: Record<QCResult, string> = {
  PASS: "Đạt",
  FAIL: "Không đạt",
  REWORK_REQUIRED: "Cần làm lại",
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  LOW: "Nhẹ",
  MEDIUM: "Trung bình",
  HIGH: "Nghiêm trọng",
  CRITICAL: "Rất nghiêm trọng",
}

export const DEFECT_TYPE_LABEL: Record<DefectType, string> = {
  GLAZE_CRACK: "Nứt men",
  DEFORMATION: "Biến dạng",
  WRONG_COLOR: "Sai màu",
  CHIPPED: "Sứt mẻ",
  UNDER_FIRED: "Non lửa",
  OTHER: "Lỗi khác",
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  ORDER_CREATED: "Tạo đơn hàng",
  AI_ANALYSIS_STARTED: "Bắt đầu phân tích AI",
  AI_ANALYSIS_COMPLETED: "AI phân tích xong",
  AI_ANALYSIS_FAILED: "AI phân tích thất bại",
  ORDER_CONFIRMED: "Xác nhận đơn hàng",
  ORDER_CANCELLED: "Huỷ đơn hàng",
  BATCH_CREATED: "Tạo mẻ sản xuất",
  STAGE_STARTED: "Bắt đầu công đoạn",
  STAGE_COMPLETED: "Hoàn thành công đoạn",
  STAGE_FAILED: "Công đoạn lỗi",
  QC_SUBMITTED: "Nộp báo cáo QC",
  QC_WARNING: "Cảnh báo QC",
  QC_CRITICAL: "Cảnh báo QC nghiêm trọng",
  REWORK_REQUIRED: "Yêu cầu làm lại",
  BATCH_COMPLETED: "Hoàn thành mẻ",
  DEADLINE_WARNING: "Cảnh báo deadline",
  TRANSITION_REJECTED: "Từ chối chuyển trạng thái",
}

export const NOTIFICATION_STATUS_LABEL: Record<NotificationStatus, string> = {
  PENDING: "Đang chờ gửi",
  SENT: "Đã gửi",
  FAILED: "Gửi thất bại",
}

export const DEADLINE_RISK_LABEL: Record<DeadlineRisk, string> = {
  ON_TRACK: "Đúng tiến độ",
  AT_RISK: "Có rủi ro",
  OVERDUE: "Trễ hạn",
}

export const ROLE_LABEL: Record<Role, string> = {
  MANAGER: "Quản lý",
  WORKER: "Thợ",
  QC_OPERATOR: "Nhân viên QC",
  SYSTEM: "Hệ thống",
}
