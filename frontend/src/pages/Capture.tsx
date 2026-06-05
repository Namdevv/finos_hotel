import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button, Card } from "../components/ui";
import { compressImage } from "../lib";

export default function Capture() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await compressImage(file); // nén phía client trước khi gửi
      const job = await api.uploadImage(blob);
      nav(`/review/${job.id}`);
    } catch (err) {
      setError((err as Error).message || "Tải ảnh thất bại");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Chụp / tải ảnh sổ</h1>
      <p className="text-sm text-slate-500">
        Chụp rõ trang sổ, đủ sáng, hạn chế nghiêng. Ảnh sẽ được OCR và bạn sẽ
        <b> duyệt lại</b> trước khi lưu.
      </p>

      <Card>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pick}
        />

        {preview ? (
          <img src={preview} alt="preview" className="mb-4 max-h-80 w-full rounded-xl object-contain" />
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500"
          >
            <span className="text-4xl">📷</span>
            <span className="text-sm font-medium">Bấm để chụp hoặc chọn ảnh</span>
          </button>
        )}

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => inputRef.current?.click()} className="flex-1">
            {preview ? "Chọn ảnh khác" : "Chọn ảnh"}
          </Button>
          <Button onClick={upload} disabled={!file || busy} className="flex-1">
            {busy ? "Đang xử lý…" : "OCR & duyệt"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
