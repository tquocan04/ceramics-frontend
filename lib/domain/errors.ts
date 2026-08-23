/** Error codes from plan §20, plus the envelope helpers used by the mock API. */

export const ERROR_CODE = {
  // §20.1 AI
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  AI_INVALID_JSON: "AI_INVALID_JSON",
  AI_SCHEMA_VALIDATION_FAILED: "AI_SCHEMA_VALIDATION_FAILED",

  // §20.2 Workflow
  INVALID_STAGE_TRANSITION: "INVALID_STAGE_TRANSITION",
  STAGE_ALREADY_COMPLETED: "STAGE_ALREADY_COMPLETED",
  STAGE_NOT_STARTED: "STAGE_NOT_STARTED",
  PREVIOUS_STAGE_NOT_COMPLETED: "PREVIOUS_STAGE_NOT_COMPLETED",
  BATCH_BLOCKED: "BATCH_BLOCKED",
  BATCH_CANCELLED: "BATCH_CANCELLED",
  STAGE_ALREADY_IN_PROGRESS: "STAGE_ALREADY_IN_PROGRESS",
  ANOTHER_STAGE_IN_PROGRESS: "ANOTHER_STAGE_IN_PROGRESS",

  // §20.3 QC
  INVALID_QC_QUANTITY: "INVALID_QC_QUANTITY",
  QC_ALREADY_SUBMITTED: "QC_ALREADY_SUBMITTED",
  DEFECT_QUANTITY_MISMATCH: "DEFECT_QUANTITY_MISMATCH",
  QC_STAGE_NOT_ACTIVE: "QC_STAGE_NOT_ACTIVE",
  QC_REPORT_REQUIRED: "QC_REPORT_REQUIRED",

  // §20.4 Notification
  NOTIFICATION_SEND_FAILED: "NOTIFICATION_SEND_FAILED",
  NOTIFICATION_RETRY_EXHAUSTED: "NOTIFICATION_RETRY_EXHAUSTED",

  // Order lifecycle
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  BATCH_NOT_FOUND: "BATCH_NOT_FOUND",
  STAGE_NOT_FOUND: "STAGE_NOT_FOUND",
  ORDER_NOT_ANALYZED: "ORDER_NOT_ANALYZED",
  ORDER_ALREADY_CONFIRMED: "ORDER_ALREADY_CONFIRMED",
  ORDER_CANNOT_BE_CANCELLED: "ORDER_CANNOT_BE_CANCELLED",
  EMPTY_DESCRIPTION: "EMPTY_DESCRIPTION",
  VALIDATION_FAILED: "VALIDATION_FAILED",
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/** Vietnamese explanation shown in the rejection toast, beside the raw code. */
export const ERROR_MESSAGE_VI: Record<ErrorCode, string> = {
  AI_TIMEOUT: "AI không phản hồi kịp thời.",
  AI_PROVIDER_ERROR: "Nhà cung cấp AI gặp sự cố.",
  AI_INVALID_JSON: "AI trả về dữ liệu không phải JSON hợp lệ.",
  AI_SCHEMA_VALIDATION_FAILED: "Kết quả AI không khớp schema yêu cầu.",

  INVALID_STAGE_TRANSITION: "Chuyển trạng thái không hợp lệ.",
  STAGE_ALREADY_COMPLETED: "Công đoạn này đã hoàn thành.",
  STAGE_NOT_STARTED: "Công đoạn chưa được bắt đầu.",
  PREVIOUS_STAGE_NOT_COMPLETED: "Công đoạn trước chưa hoàn thành — không được bỏ qua.",
  BATCH_BLOCKED: "Mẻ đang bị khoá, cần quản lý xử lý trước.",
  BATCH_CANCELLED: "Mẻ đã bị huỷ.",
  STAGE_ALREADY_IN_PROGRESS: "Công đoạn này đang chạy.",
  ANOTHER_STAGE_IN_PROGRESS: "Một công đoạn khác đang chạy trong mẻ này.",

  INVALID_QC_QUANTITY: "Số lượng QC không hợp lệ.",
  QC_ALREADY_SUBMITTED: "Đã có báo cáo QC cho mẻ này.",
  DEFECT_QUANTITY_MISMATCH: "Tổng số lỗi khai báo không khớp số lượng lỗi.",
  QC_STAGE_NOT_ACTIVE: "Mẻ chưa ở công đoạn kiểm định chất lượng.",
  QC_REPORT_REQUIRED: "Cần nộp báo cáo QC đạt trước khi hoàn thành công đoạn này.",

  NOTIFICATION_SEND_FAILED: "Gửi thông báo thất bại.",
  NOTIFICATION_RETRY_EXHAUSTED: "Đã thử gửi lại tối đa số lần cho phép.",

  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  BATCH_NOT_FOUND: "Không tìm thấy mẻ sản xuất.",
  STAGE_NOT_FOUND: "Không tìm thấy công đoạn.",
  ORDER_NOT_ANALYZED: "Đơn hàng chưa được AI phân tích.",
  ORDER_ALREADY_CONFIRMED: "Đơn hàng đã được xác nhận.",
  ORDER_CANNOT_BE_CANCELLED: "Không thể huỷ đơn ở trạng thái hiện tại.",
  EMPTY_DESCRIPTION: "Mô tả đơn hàng không được để trống.",
  VALIDATION_FAILED: "Dữ liệu không hợp lệ.",
}

/** Thrown inside the mock services; converted to an ApiError by the handlers. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number = 409,
    readonly details?: Record<string, unknown>
  ) {
    super(ERROR_MESSAGE_VI[code] ?? code)
    this.name = "DomainError"
  }
}
