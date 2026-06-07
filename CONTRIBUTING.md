# Đóng góp cho FinOS Hotel

Cảm ơn bạn quan tâm đến FinOS Hotel. Dự án ưu tiên các thay đổi nhỏ, rõ mục tiêu, dễ kiểm thử và giữ đúng nguyên tắc: OCR chỉ điền sẵn dữ liệu, con người luôn duyệt trước khi ghi vào chứng từ.

## Cách bắt đầu

1. Fork repo và tạo branch mới từ `main`.
2. Chạy backend/frontend theo hướng dẫn trong `README.md`.
3. Với backend trên Windows, bật UTF-8 khi chạy smoke test:

```powershell
$env:PYTHONUTF8=1; .\.venv\Scripts\python.exe -m tests.smoke_test
```

4. Với frontend:

```powershell
cd frontend
npm install
npm run build
```

## Quy ước thay đổi

- Giữ tài liệu, comment và UI bằng tiếng Việt nếu đang sửa phần đã dùng tiếng Việt.
- Không commit `.env`, database, ảnh upload thật, log hoặc dữ liệu khách sạn thật.
- Không để OCR ghi trực tiếp vào bảng `transactions`; mọi dữ liệu từ model phải đi qua màn duyệt.
- Với thay đổi backend, chạy smoke test. Với thay đổi frontend, chạy `npm run build`.
- Pull request nên mô tả ngắn: vấn đề, cách sửa, cách đã kiểm thử và ảnh/chụp màn hình nếu đổi UI.

## Dữ liệu mẫu

Chỉ dùng dữ liệu giả hoặc ảnh đã được làm sạch thông tin nhận dạng. Nếu cần minh họa lỗi OCR, hãy che tên khách, số điện thoại, mã đặt phòng và mọi dữ liệu tài chính nhạy cảm.
