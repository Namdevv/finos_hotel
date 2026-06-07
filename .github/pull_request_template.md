## Tóm tắt

- 

## Kiểm thử

- [ ] Backend smoke test: `$env:PYTHONUTF8=1; .\.venv\Scripts\python.exe -m tests.smoke_test`
- [ ] Frontend build: `npm run build`
- [ ] Docker build/config nếu đổi deploy
- [ ] Không áp dụng

## Checklist

- [ ] Không commit `.env`, database, ảnh upload thật hoặc log sản xuất.
- [ ] Không làm OCR ghi trực tiếp vào `transactions`.
- [ ] Đã cập nhật README/tài liệu nếu đổi cách chạy, config hoặc hành vi người dùng.
- [ ] Đã che dữ liệu nhạy cảm trong ảnh/chụp màn hình nếu có.
