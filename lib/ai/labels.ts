/**
 * Vietnamese copy for everything the AI service can say back.
 *
 * The raw code is always shown next to the sentence: the code is what you
 * grep the service logs for, the sentence is what tells the manager whether
 * the order is lost (it never is) or just needs a retry.
 */

import type { AIEstimatedData, AIExtractedData } from "@/lib/domain/types"

import { AI_ERROR_CODE, WARNING_CODE, type AIErrorCode, type WarningCode } from "./schema"

/* ── Field metadata, shared by every screen that renders an analysis ───── */

export interface FieldMeta<K> {
  key: K
  label: string
  unit?: string
}

/** §34 — what the customer actually stated. Order matches the wire schema. */
export const EXTRACTED_FIELDS: Array<FieldMeta<keyof AIExtractedData>> = [
  { key: "product_name", label: "Tên sản phẩm" },
  { key: "quantity", label: "Số lượng", unit: "sp" },
  { key: "height_cm", label: "Chiều cao", unit: "cm" },
  { key: "width_cm", label: "Chiều rộng", unit: "cm" },
  { key: "decoration_pattern", label: "Họa tiết" },
  { key: "glaze_type", label: "Loại men" },
  { key: "firing_temperature_c", label: "Nhiệt độ nung", unit: "°C" },
  { key: "deadline_days", label: "Thời hạn", unit: "ngày" },
]

/** §34 — what the model inferred. Overridable on the review screen. */
export const ESTIMATED_FIELDS: Array<FieldMeta<keyof AIEstimatedData>> = [
  { key: "clay_kg", label: "Đất sét ước tính", unit: "kg" },
  { key: "glaze_kg", label: "Men ước tính", unit: "kg" },
  { key: "firing_duration_hours", label: "Thời gian nung", unit: "giờ" },
]

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  [...EXTRACTED_FIELDS, ...ESTIMATED_FIELDS].map((f) => [f.key, f.label])
)

/** Falls back to the raw key so a field we have not named still reads sanely. */
export const fieldLabel = (key: string): string => FIELD_LABEL[key] ?? key

/* ── Messages ─────────────────────────────────────────────────────────── */

export const AI_ERROR_MESSAGE_VI: Record<AIErrorCode, string> = {
  [AI_ERROR_CODE.AI_TIMEOUT]: "AI không phản hồi kịp thời.",
  [AI_ERROR_CODE.AI_PROVIDER_ERROR]: "Nhà cung cấp AI gặp sự cố.",
  [AI_ERROR_CODE.AI_INVALID_JSON]: "AI trả về dữ liệu không phải JSON hợp lệ.",
  [AI_ERROR_CODE.AI_SCHEMA_VALIDATION_FAILED]:
    "Kết quả AI không khớp schema yêu cầu.",
  [AI_ERROR_CODE.AI_PROVIDER_UNAVAILABLE]:
    "Không kết nối được tới AI service hoặc nhà cung cấp.",
  [AI_ERROR_CODE.AI_RATE_LIMITED]:
    "Đã chạm giới hạn tốc độ của nhà cung cấp — thử lại sau ít giây.",
  [AI_ERROR_CODE.AI_NORMALIZATION_FAILED]:
    "Không chuẩn hoá được dữ liệu AI trả về.",
  [AI_ERROR_CODE.AI_ESTIMATION_FAILED]:
    "Không ước lượng được nguyên liệu / thời gian nung.",
  [AI_ERROR_CODE.EMPTY_DESCRIPTION]: "Mô tả đơn hàng không được để trống.",
  [AI_ERROR_CODE.DESCRIPTION_TOO_LONG]: "Mô tả đơn hàng quá dài.",
  [AI_ERROR_CODE.VALIDATION_FAILED]: "Dữ liệu gửi lên không hợp lệ.",
  [AI_ERROR_CODE.UNAUTHORIZED]: "Thiếu internal API key.",
  [AI_ERROR_CODE.INTERNAL_ERROR]: "Lỗi nội bộ của AI service.",
}

/**
 * §16 — a warning never fails the request. Each line says what to *check*,
 * because the manager is the one who decides whether it matters.
 */
export const WARNING_MESSAGE_VI: Record<WarningCode, string> = {
  [WARNING_CODE.FIRING_TEMPERATURE_OUT_OF_RANGE]:
    "Nhiệt độ nung nằm ngoài dải 600–1450°C.",
  [WARNING_CODE.QUANTITY_NOT_POSITIVE]: "Số lượng không lớn hơn 0.",
  [WARNING_CODE.QUANTITY_IMPLAUSIBLE]: "Số lượng bất thường — cần xác nhận lại.",
  [WARNING_CODE.DEADLINE_NOT_POSITIVE]: "Thời hạn không lớn hơn 0 ngày.",
  [WARNING_CODE.DEADLINE_IMPLAUSIBLE]: "Thời hạn bất thường — cần xác nhận lại.",
  [WARNING_CODE.DIMENSION_NOT_POSITIVE]: "Kích thước không lớn hơn 0.",
  [WARNING_CODE.DIMENSION_IMPLAUSIBLE]: "Kích thước bất thường so với sản phẩm.",
  [WARNING_CODE.AMBIGUOUS_QUANTITY]: "Số lượng trong mô tả chưa rõ ràng.",
  [WARNING_CODE.AMBIGUOUS_DEADLINE]: "Thời hạn trong mô tả chưa rõ ràng.",
  [WARNING_CODE.AMBIGUOUS_DIMENSION]: "Kích thước trong mô tả chưa rõ ràng.",
  [WARNING_CODE.UNIT_CORRECTED]: "AI đã tự quy đổi đơn vị.",
  [WARNING_CODE.EVIDENCE_NOT_FOUND]:
    "Không tìm thấy đoạn văn bản gốc cho trường này.",
  [WARNING_CODE.ESTIMATE_UNAVAILABLE]: "Không ước lượng được trường này.",
  [WARNING_CODE.AI_PRIORITY_OVERRIDDEN]:
    "Priority do AI đề xuất đã bị quy tắc backend ghi đè (§14).",
}

/** Warnings that mean "this value is wrong", not "this value is unusual". */
const BLOCKING_WARNINGS = new Set<WarningCode>([
  WARNING_CODE.QUANTITY_NOT_POSITIVE,
  WARNING_CODE.DEADLINE_NOT_POSITIVE,
  WARNING_CODE.DIMENSION_NOT_POSITIVE,
  WARNING_CODE.FIRING_TEMPERATURE_OUT_OF_RANGE,
])

export const isBlockingWarning = (code: WarningCode): boolean =>
  BLOCKING_WARNINGS.has(code)
