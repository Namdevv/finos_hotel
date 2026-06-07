import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { requestNotifyPermission } from "../notify";
import { Button, Card } from "../components/ui";
import { IconImage, IconCamera, IconRotate, IconSpark, IconCheck } from "../components/icons";

const DEFAULT_ROTATE = 90;

export default function Capture() {
  const nav = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rotate, setRotate] = useState(DEFAULT_ROTATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState(""); // thông báo đã đưa vào hàng đợi

  // Chụp từ máy ảnh: luôn 1 ảnh -> vào luồng xem trước + xoay.
  function pickCamera(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // chọn lại cùng file vẫn kích hoạt onChange
    if (!f) return;
    showPreview(f);
  }

  // Từ album: 1 ảnh -> xem trước + xoay; nhiều ảnh -> đưa thẳng vào hàng đợi.
  function pickGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (files.length === 1) showPreview(files[0]);
    else queueFiles(files, DEFAULT_ROTATE);
  }

  function showPreview(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRotate(DEFAULT_ROTATE);
    setError("");
    setQueued("");
  }

  function rotateMore() {
    setRotate((r) => (r + 90) % 360);
  }

  // Đưa ảnh vào hàng đợi xử lý nền — KHÔNG điều hướng sang Review. Người dùng
  // chụp/chọn ảnh tiếp được ngay; có thông báo (chuông + hệ thống) khi xong.
  async function queueFiles(files: File[], rot: number) {
    setBusy(true);
    setError("");
    void requestNotifyPermission(); // xin quyền ngay trong thao tác của user
    try {
      for (const f of files) await api.uploadImage(f, rot);
      setFile(null);
      setPreview(null);
      setRotate(DEFAULT_ROTATE);
      setQueued(
        files.length === 1
          ? "Đã đưa ảnh vào hàng đợi — bạn sẽ nhận thông báo khi nhận dạng xong."
          : `Đã đưa ${files.length} ảnh vào hàng đợi — xử lý lần lượt, có thông báo khi từng ảnh xong.`,
      );
    } catch (err) {
      setError((err as Error).message || "Tải ảnh thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="flex items-start gap-3 border-brand-100 bg-brand-50/50">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <IconSpark className="h-4 w-4" />
        </span>
        <p className="text-sm text-slate-600">
          Chụp rõ trang sổ, đủ sáng, hạn chế nghiêng. Ảnh được{" "}
          <b className="text-slate-800">xử lý nền</b> — bạn có thể chụp tiếp ngay; khi nhận dạng
          xong sẽ có <b className="text-slate-800">thông báo</b> để bấm vào duyệt từng dòng.
        </p>
      </Card>

      {queued && (
        <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50/60">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <IconCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">{queued}</p>
            <button
              onClick={() => nav("/uploads")}
              className="mt-1 cursor-pointer text-sm font-semibold text-brand-600 hover:underline"
            >
              Xem hàng đợi trong Thư viện →
            </button>
          </div>
        </Card>
      )}

      <Card>
        {/* Input mở camera trực tiếp (1 ảnh) */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pickCamera}
        />
        {/* Input chọn từ album — cho phép chọn nhiều ảnh cùng lúc */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={pickGallery}
        />

        {preview ? (
          <>
            <div className="mb-3 flex max-h-96 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={preview}
                alt="Xem trước ảnh sổ"
                style={{ transform: `rotate(${-rotate}deg)` }}
                className="max-h-96 w-full object-contain transition-transform duration-200"
              />
            </div>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-500">
                Xoay ảnh cho <b className="text-slate-700">chữ thẳng đứng</b> rồi mới OCR · {rotate}°
              </span>
              <Button variant="secondary" size="sm" onClick={rotateMore}>
                <IconRotate className="h-4 w-4" />
                Xoay 90°
              </Button>
            </div>
          </>
        ) : (
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-500"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <IconCamera className="h-7 w-7" />
            </span>
            <span className="text-sm font-semibold">Bấm để mở máy ảnh</span>
            <span className="text-xs">JPG, PNG · tối đa 12MB · chọn nhiều ảnh từ album</span>
          </button>
        )}

        {error && (
          <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => galleryRef.current?.click()} className="flex-1">
            <IconImage className="h-4 w-4" />
            Từ album
          </Button>
          <Button
            size="sm"
            onClick={() => file && queueFiles([file], rotate)}
            disabled={!file || busy}
            className="flex-1"
          >
            <IconSpark className="h-4 w-4" />
            {busy ? "Đang tải lên…" : "Thêm vào hàng đợi"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
