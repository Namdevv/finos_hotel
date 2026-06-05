# 🎨 Bảng màu & Design Tokens — FinOS Hotel

Tài liệu màu sắc chính thức của frontend. **Mọi màu mới phải lấy từ đây** để giao diện đồng nhất.

> **Nguồn sự thật (source of truth):**
> - Màu tùy biến `brand` và `ink` định nghĩa trong [`frontend/tailwind.config.js`](frontend/tailwind.config.js).
> - Các màu `slate`, `emerald`, `rose`, `amber` là **bảng mặc định của Tailwind** (không cần khai báo).
> - Đổi tông thương hiệu? Chỉ cần sửa scale `brand` trong `tailwind.config.js` là toàn app đổi theo.
>
> **Font:** `Plus Jakarta Sans` (import trong [`frontend/src/index.css`](frontend/src/index.css)).

---

## 1. Tóm tắt theo vai trò (đọc nhanh)

| Vai trò | Token (class Tailwind) | Hex | Dùng cho |
|---|---|---|---|
| **Thương hiệu / hành động chính** | `brand-600` | `#2563eb` | Nút chính, link, menu đang chọn, focus ring |
| **Nền sidebar / panel tối** | `ink-900` | `#131a27` | Sidebar, panel thương hiệu trang login |
| **Chữ chính** | `slate-900` | `#0f172a` | Tiêu đề, số liệu quan trọng |
| **Chữ thường** | `slate-700` | `#334155` | Nội dung bảng, đoạn văn |
| **Chữ phụ / mờ** | `slate-500` | `#64748b` | Mô tả, nhãn phụ |
| **Chữ rất mờ** | `slate-400` | `#94a3b8` | Placeholder, ghi chú nhỏ |
| **Viền** | `slate-200` | `#e2e8f0` | Viền thẻ, đường kẻ bảng |
| **Nền trang** | `slate-100` | `#f1f5f9` | Nền chung |
| **Nền thẻ / bề mặt** | `white` | `#ffffff` | Card, bảng, input |
| **THU / tích cực** | `emerald-600` | `#059669` | Số tiền thu, tăng, trạng thái OK |
| **CHI / tiêu cực / xóa** | `rose-600` | `#e11d48` | Số tiền chi, nút xóa, lỗi |
| **Cảnh báo / cần kiểm** | `amber-600` | `#d97706` | Ô OCR độ tin cậy thấp |

---

## 2. `brand` — Xanh tin cậy (màu chủ đạo)

Phong cách phần mềm kế toán. Định nghĩa trong `tailwind.config.js`.

| Token | Hex | Dùng điển hình |
|---|---|---|
| `brand-50`  | `#eff6ff` | Nền nhạt (hover row, banner info, avatar nền) |
| `brand-100` | `#dbeafe` | Nền badge, avatar |
| `brand-200` | `#bfdbfe` | Viền badge, ring nhạt |
| `brand-300` | `#93c5fd` | Focus ring |
| `brand-400` | `#60a5fa` | Hover viền dropzone |
| `brand-500` | `#3b82f6` | Ring nhấn, điểm nhấn phụ |
| **`brand-600`** | **`#2563eb`** | **Nút chính, menu active, link, logo** |
| `brand-700` | `#1d4ed8` | Hover nút chính, chữ trên nền nhạt |
| `brand-800` | `#1e40af` | — (dự phòng) |
| `brand-900` | `#1e3a8a` | — (dự phòng) |
| `brand-950` | `#172554` | — (dự phòng) |

## 3. `ink` — Nền tối (sidebar)

| Token | Hex | Dùng |
|---|---|---|
| `ink-800` | `#1b2333` | Lớp nền tối thứ cấp |
| **`ink-900`** | **`#131a27`** | **Nền sidebar, panel login** |
| `ink-950` | `#0c111b` | Nền tối sâu nhất |

> Trên nền `ink`: chữ chính dùng `white`, chữ phụ `slate-300`/`slate-400`, đường kẻ `white/10`.

## 4. `slate` — Trung tính (chữ, nền, viền)

Thang xám-xanh dùng cho gần như mọi thành phần trung tính.

| Token | Hex | Tầng sử dụng |
|---|---|---|
| `slate-50`  | `#f8fafc` | Nền input disabled, header bảng |
| `slate-100` | `#f1f5f9` | **Nền trang**, hover nhẹ |
| `slate-200` | `#e2e8f0` | **Viền** thẻ/bảng/input |
| `slate-300` | `#cbd5e1` | Viền input |
| `slate-400` | `#94a3b8` | Placeholder, icon mờ, trục biểu đồ |
| `slate-500` | `#64748b` | Chữ phụ, nhãn |
| `slate-600` | `#475569` | Chữ phụ đậm hơn |
| `slate-700` | `#334155` | **Chữ nội dung** |
| `slate-800` | `#1e293b` | Chữ đậm |
| `slate-900` | `#0f172a` | **Tiêu đề, số liệu** |

## 5. Màu ngữ nghĩa (semantic)

Quy ước cố định toàn app — **đừng đổi ý nghĩa**:

### 🟢 THU / Tích cực → `emerald`
| Token | Hex | Dùng |
|---|---|---|
| `emerald-50`  | `#ecfdf5` | Nền badge "Thu", nền icon KPI |
| `emerald-200` | `#a7f3d0` | Viền badge |
| `emerald-600` | `#059669` | **Chữ/số tiền thu** |
| `emerald-700` | `#047857` | Chữ badge |

### 🔴 CHI / Tiêu cực / Xóa / Lỗi → `rose`
| Token | Hex | Dùng |
|---|---|---|
| `rose-50`  | `#fff1f2` | Nền badge "Chi", nền hover nút xóa, nền hộp lỗi |
| `rose-200` | `#fecdd3` | Viền badge / hộp lỗi |
| `rose-600` | `#e11d48` | **Chữ/số tiền chi, nút xóa, thông báo lỗi** |
| `rose-700` | `#be123c` | Hover nút nguy hiểm |

### 🟡 Cảnh báo / Cần kiểm → `amber`
| Token | Hex | Dùng |
|---|---|---|
| `amber-50`  | `#fffbeb` | Nền banner cảnh báo |
| `amber-200` | `#fde68a` | Viền banner |
| `amber-300` | `#fcd34d` | **Ring ô OCR confidence thấp** |
| `amber-600` | `#d97706` | Chữ/icon cảnh báo |
| `amber-700` | `#b45309` | Chữ banner cảnh báo |

---

## 6. Màu biểu đồ (Recharts — dùng hex trực tiếp)

Xem [`frontend/src/pages/Dashboard.tsx`](frontend/src/pages/Dashboard.tsx).

| Mục đích | Hex | Ghi chú |
|---|---|---|
| Cột **Thu** | `#10b981` | = emerald-500 |
| Cột **Chi** | `#f43f5e` | = rose-500 |
| Đường lưới | `#eef2f7` | xám rất nhạt |
| Trục / nhãn | `#94a3b8` | = slate-400 |

---

## 7. Quy tắc dùng nhanh (cheat-sheet)

```text
Nút chính         → bg-brand-600  hover:bg-brand-700  text-white
Nút phụ           → bg-white  border-slate-300  text-slate-700  hover:bg-slate-50
Nút nguy hiểm     → bg-rose-600  hover:bg-rose-700  text-white
Input             → border-slate-300  focus:border-brand-500  focus:ring-brand-100   (class .field)
Thẻ (card)        → bg-white  border-slate-200  shadow-card
Tiêu đề           → text-slate-900 font-bold
Chữ phụ           → text-slate-500
Số tiền THU       → text-emerald-600
Số tiền CHI       → text-rose-600
Badge Thu/Chi     → <Badge color="green | red">  (xem components/ui.tsx)
Sidebar           → bg-ink-900  text-slate-300  (item active: bg-brand-600 text-white)
```

> Component dùng lại nằm trong [`frontend/src/components/ui.tsx`](frontend/src/components/ui.tsx): `Button`, `Badge`, `Card`, `Input`, `StatTile`, `PageHeader`. **Ưu tiên dùng component này thay vì tự ghép class** để giữ đồng bộ.

---

## 8. Khả năng tiếp cận (Accessibility)

- Tỷ lệ tương phản chữ ≥ **4.5:1**: `slate-700`/`slate-900` trên nền trắng đạt chuẩn AAA.
- **Không** dùng chữ thân bài nhạt hơn `slate-500` trên nền trắng.
- Màu **không phải** chỉ báo duy nhất: Thu/Chi luôn kèm **chữ + icon** (mũi tên lên/xuống), không chỉ dựa vào xanh/đỏ — hỗ trợ người mù màu.
- Nút/ô bấm đều có `focus-visible:ring` để điều hướng bàn phím.

---

## 9. Muốn đổi tông thương hiệu?

1. Mở [`frontend/tailwind.config.js`](frontend/tailwind.config.js).
2. Thay 11 giá trị trong `colors.brand` (50 → 950). Gợi ý sinh scale: https://uicolors.app
3. Chạy lại `npm run build`. Toàn bộ nút/menu/link đổi theo — **không cần sửa từng trang**.
4. Cập nhật lại file này cho khớp.
