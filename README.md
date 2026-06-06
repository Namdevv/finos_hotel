<p align="center">
  <img src="frontend/public/logo_finos.png" alt="FinOS Hotel" width="180" />
</p>

# FinOS Hotel

FinOS Hotel là ứng dụng nội bộ giúp khách sạn số hóa sổ thu chi viết tay. Thay vì nhập lại từng dòng từ sổ giấy, nhân viên có thể chụp ảnh trang sổ, hệ thống dùng OCR/AI để đọc dữ liệu, sau đó người dùng kiểm tra và chỉnh lại trước khi lưu thành chứng từ kế toán.

Nguyên tắc chính của dự án: **AI chỉ hỗ trợ nhập liệu, không tự ghi thẳng vào sổ kế toán**. Mọi dòng OCR đều phải được con người duyệt lại trước khi lưu.

## Dự án giải quyết việc gì?

- Chụp hoặc tải ảnh trang sổ khách sạn từ điện thoại/máy tính.
- Nhận dạng các dòng thu/chi từ ảnh sổ viết tay.
- Cho người dùng xem lại ảnh gốc song song với kết quả OCR.
- Sửa ngày, phòng/khách, nội dung, loại giao dịch và số tiền trước khi lưu.
- Lưu chứng từ đã duyệt vào hệ thống.
- Xem danh sách chứng từ, chỉnh sửa, xóa theo quyền.
- Thống kê tổng thu, tổng chi, chênh lệch theo ngày hoặc theo tháng.
- Quản lý người dùng và phân quyền nội bộ.

## Luồng hoạt động

1. Nhân viên đăng nhập vào hệ thống.
2. Vào màn hình chụp ảnh, chụp trang sổ hoặc chọn ảnh có sẵn.
3. Hệ thống tạo một job OCR và đưa vào hàng đợi xử lý.
4. Worker gửi ảnh sang Ollama để model Qwen2.5-VL đọc nội dung.
5. Kết quả OCR được tách thành các dòng giao dịch đề xuất.
6. Người dùng vào màn hình duyệt, so sánh ảnh gốc với từng dòng được đọc ra.
7. Người dùng sửa sai nếu có, thêm/xóa dòng nếu cần.
8. Khi bấm lưu, các dòng đã duyệt mới trở thành chứng từ chính thức.
9. Dashboard và báo cáo lấy dữ liệu từ các chứng từ đã lưu.

Nếu ảnh bị xoay sai hoặc OCR đọc thiếu dòng, người dùng có thể chạy OCR lại với góc xoay khác.

## Các vai trò trong hệ thống

- `admin`: toàn quyền, quản lý người dùng, xem báo cáo, xem nhật ký hoạt động và xóa dữ liệu.
- `accountant`: nhập, duyệt, sửa chứng từ, xóa mềm chứng từ và xem báo cáo.
- `receptionist`: chụp OCR, duyệt/lưu chứng từ, xem/sửa chứng từ; dashboard chỉ hiển thị tổng trong ngày.

Phân quyền được xử lý ở cả backend API và giao diện frontend.

## Thành phần chính

| Thành phần | Vai trò |
| --- | --- |
| Frontend | Ứng dụng React/Vite dạng PWA, dùng được trên điện thoại để chụp ảnh và duyệt chứng từ. |
| Backend | FastAPI cung cấp API đăng nhập, OCR job, chứng từ, thống kê, người dùng và nhật ký hoạt động. |
| Database | SQLite lưu user, job OCR, chứng từ và activity log. |
| OCR Worker | Worker nền xử lý hàng đợi OCR từng job một để tránh tranh tài nguyên GPU. |
| Ollama/VLM | Chạy model Qwen2.5-VL để đọc ảnh sổ viết tay. Backend gọi qua HTTP. |
| Docker | Đóng gói backend và frontend để chạy trong mạng LAN. |

## Cách dữ liệu được lưu

- Ảnh upload được lưu trong thư mục dữ liệu của ứng dụng.
- Mỗi ảnh tạo ra một OCR job, có trạng thái `queued`, `processing`, `done` hoặc `failed`.
- Kết quả OCR chỉ là dữ liệu nháp gắn với job.
- Chỉ khi người dùng bấm lưu ở màn hình duyệt, hệ thống mới tạo chứng từ trong bảng giao dịch.
- Chứng từ có thể liên kết lại với ảnh/job OCR ban đầu để đối chiếu khi cần.

## Giao diện chính

- **Dashboard**: xem tổng thu, tổng chi, chênh lệch và biểu đồ theo ngày/tháng.
- **Chụp ảnh**: mở camera hoặc chọn ảnh từ album, xoay ảnh trước khi OCR.
- **Duyệt OCR**: xem ảnh gốc, kiểm tra từng dòng, sửa số tiền/ngày/phòng/nội dung rồi lưu.
- **Chứng từ**: tra cứu, lọc, thêm/sửa/xóa giao dịch đã duyệt.
- **Lịch sử upload**: xem lại các ảnh đã OCR, trạng thái job, chạy OCR lại hoặc xóa lịch sử.
- **Người dùng**: admin quản lý tài khoản và vai trò.
- **Hồ sơ**: đổi thông tin cá nhân/mật khẩu.

## Triển khai ở mức tổng quan

Dự án được thiết kế để self-host trong mạng LAN của khách sạn. Một máy chạy ứng dụng web và database; phần OCR dùng Ollama, nên tốt nhất đặt trên máy có GPU.

Thông thường chỉ cần:

```bash
docker compose up -d --build
```

Ứng dụng sau đó được truy cập từ các thiết bị cùng mạng qua địa chỉ máy chạy server, ví dụ `http://<IP-may-chu>:8000`.

Chi tiết biến môi trường, model OCR, tài khoản admin ban đầu và cấu hình máy chạy thật nằm trong `.env.example`, `docker-compose.yml` và mã nguồn backend. README này chỉ giữ phần mô tả tổng quan để dễ nắm dự án.

## Cấu trúc thư mục

```text
finos_hotel/
├─ backend/      # FastAPI, database, routers, OCR worker
├─ frontend/     # React/Vite PWA
├─ Dockerfile    # Build backend + frontend thành một image
├─ docker-compose.yml
├─ COLORS.md     # Quy chuẩn màu và giao diện
└─ README.md
```

## Ghi chú vận hành

- OCR chữ viết tay không đảm bảo đúng tuyệt đối, nên bước duyệt là bắt buộc.
- Ảnh càng rõ, đủ sáng, ít nghiêng thì OCR càng ổn định.
- Dữ liệu kế toán nên được sao lưu định kỳ.
- Khi dùng thật cần đổi khóa bảo mật và mật khẩu admin mặc định trong cấu hình môi trường.
