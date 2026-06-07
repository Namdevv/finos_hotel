# Chính sách bảo mật

FinOS Hotel xử lý ảnh sổ thu-chi và dữ liệu tài chính nội bộ, nên vui lòng báo cáo lỗ hổng theo kênh riêng thay vì tạo public issue.

## Báo cáo lỗ hổng

Gửi email tới `namtran34311@gmail.com` với tiêu đề bắt đầu bằng `[SECURITY] FinOS Hotel`.

Vui lòng kèm:

- Mô tả ngắn về lỗ hổng và tác động.
- Các bước tái hiện tối thiểu.
- Phiên bản commit/tag hoặc môi trường triển khai liên quan.
- Bằng chứng ở mức cần thiết, không gửi dữ liệu khách sạn thật nếu không bắt buộc.

## Phạm vi ưu tiên

- Rò rỉ hoặc bỏ qua xác thực/phân quyền.
- Truy cập trái phép ảnh upload, database hoặc dữ liệu giao dịch.
- Lỗi cho phép ghi chứng từ mà không qua bước duyệt của con người.
- RCE, path traversal, SSRF hoặc upload file nguy hiểm.
- Lộ secret, token, mật khẩu hoặc cấu hình triển khai.

## Khuyến nghị triển khai

- Luôn đổi `FINOS_SECRET_KEY` và `FINOS_ADMIN_PASSWORD` trước khi dùng thật.
- Không publish `.env`, database, volume `/data`, ảnh upload hoặc log sản xuất.
- Dùng HTTPS nếu truy cập ngoài `localhost`, đặc biệt khi dùng camera/PWA qua trình duyệt.
- Hạn chế truy cập `FINOS_OLLAMA_HOST` trong mạng tin cậy; không mở service model ra Internet nếu không có lớp bảo vệ riêng.
- Sao lưu và kiểm soát quyền truy cập volume chứa SQLite/ảnh upload như dữ liệu tài chính thật.
