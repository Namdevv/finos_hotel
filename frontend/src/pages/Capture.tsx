import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button, Card } from "../components/ui";
import { IconImage, IconCamera, IconRotate, IconSpark } from "../components/icons";

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

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // reset value để chọn cùng file lần 2 vẫn kích hoạt onChange
    e.target.value = "";
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRotate(DEFAULT_ROTATE);
    setError("");
  }

  function rotateMore() {
    setRotate((r) => (r + 90) % 360);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const job = await api.uploadImage(file, rotate);
      nav(`/review/${job.id}`);
    } catch (err) {
      setError((err as Error).message || "Tải ảnh thất bại");
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
          Chụp rõ trang sổ, đủ sáng, hạn chế nghiêng. Ảnh sẽ được OCR và bạn{" "}
          <b className="text-slate-800">duyệt lại từng dòng</b> trước khi lưu vào sổ.
        </p>
      </Card>

      <Card>
        {/* Input mở camera trực tiếp */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pick}
        />
        {/* Input chọn từ album (không có capture) */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={pick}
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
            <span className="text-xs">JPG, PNG · tối đa 12MB</span>
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
          <Button size="sm" onClick={upload} disabled={!file || busy} className="flex-1">
            <IconSpark className="h-4 w-4" />
            {busy ? "Đang xử lý…" : "OCR & duyệt"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
