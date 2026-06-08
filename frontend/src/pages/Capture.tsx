import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { requestNotifyPermission } from "../notify";
import { Button, Card } from "../components/ui";
import { IconImage, IconCamera, IconRotate, IconSpark, IconCheck } from "../components/icons";

const FALLBACK_ROTATE = 90;

type PendingImage = {
  id: string;
  file: File;
  preview: string;
  rotate: number;
};

async function getImageSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được kích thước ảnh"));
    };
    img.src = url;
  });
}

async function detectDefaultRotate(file: File): Promise<number> {
  try {
    const { width, height } = await getImageSize(file);
    return width > height ? 90 : 0;
  } catch {
    return FALLBACK_ROTATE;
  }
}

export default function Capture() {
  const nav = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState("");

  async function pickCamera(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await prepareFiles([f]);
  }

  async function pickGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    await prepareFiles(files);
  }

  async function prepareFiles(files: File[]) {
    setBusy(true);
    setError("");
    setQueued("");
    try {
      const items = await Promise.all(
        files.map(async (file, index) => ({
          id: `${Date.now()}-${index}-${file.name}`,
          file,
          preview: URL.createObjectURL(file),
          rotate: await detectDefaultRotate(file),
        })),
      );
      setPending((old) => {
        old.forEach((item) => URL.revokeObjectURL(item.preview));
        return items;
      });
    } finally {
      setBusy(false);
    }
  }

  function rotateOne(id: string) {
    setPending((items) =>
      items.map((item) =>
        item.id === id ? { ...item, rotate: (item.rotate + 90) % 360 } : item,
      ),
    );
  }

  function removeOne(id: string) {
    setPending((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return items.filter((item) => item.id !== id);
    });
  }

  function clearPending() {
    setPending((items) => {
      items.forEach((item) => URL.revokeObjectURL(item.preview));
      return [];
    });
  }

  async function queuePending() {
    if (pending.length === 0) return;
    setBusy(true);
    setError("");
    void requestNotifyPermission();
    try {
      const failed: string[] = [];
      let uploaded = 0;

      for (const item of pending) {
        try {
          await api.uploadImage(item.file, item.rotate);
          uploaded += 1;
        } catch (err) {
          failed.push(`${item.file.name || "ảnh"}: ${(err as Error).message || "tải ảnh thất bại"}`);
        }
      }

      if (uploaded > 0) {
        clearPending();
        setQueued(
          uploaded === 1
            ? "Đã đưa 1 ảnh vào hàng đợi — bạn sẽ nhận thông báo khi nhận dạng xong."
            : `Đã đưa ${uploaded}/${pending.length} ảnh vào hàng đợi — xử lý lần lượt, có thông báo khi từng ảnh xong.`,
        );
      }
      if (failed.length > 0) {
        setError(
          uploaded > 0
            ? `Còn ${failed.length} ảnh chưa tải được. ${failed[0]}`
            : `Chưa tải được ảnh nào. ${failed[0]}`,
        );
      }
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
          Chọn một hoặc nhiều ảnh, xoay từng ảnh cho chữ đứng đúng chiều, rồi mới thêm vào{" "}
          <b className="text-slate-800">hàng đợi OCR</b>. Bạn có thể tiếp tục chụp/chọn ảnh khác trong lúc hệ thống xử lý nền.
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
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pickCamera}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={pickGallery}
        />

        {pending.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-500">
                Đã chọn <b className="text-slate-700">{pending.length}</b> ảnh · xoay từng ảnh trước khi OCR
              </span>
              <button
                type="button"
                onClick={clearPending}
                disabled={busy}
                className="text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50"
              >
                Bỏ chọn
              </button>
            </div>

            <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
              {pending.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-700">
                      {index + 1}. {item.file.name || "Ảnh sổ"}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">{item.rotate}°</span>
                  </div>
                  <div className="mb-2 flex h-52 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                    <img
                      src={item.preview}
                      alt={`Xem trước ảnh sổ ${index + 1}`}
                      style={{ transform: `rotate(${-item.rotate}deg)` }}
                      className="max-h-full max-w-full object-contain transition-transform duration-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" onClick={() => rotateOne(item.id)} disabled={busy}>
                      <IconRotate className="h-4 w-4" />
                      Xoay 90°
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => removeOne(item.id)} disabled={busy}>
                      Bỏ ảnh
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-500"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <IconImage className="h-7 w-7" />
            </span>
            <span className="text-sm font-semibold">Bấm để chọn ảnh từ album</span>
            <span className="text-xs">JPG, PNG · tối đa 12MB · có thể chọn nhiều ảnh</span>
          </button>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <IconCamera className="h-4 w-4" />
            Camera
          </Button>
          <Button variant="secondary" size="sm" onClick={() => galleryRef.current?.click()} disabled={busy}>
            <IconImage className="h-4 w-4" />
            Từ album
          </Button>
          <Button
            size="sm"
            onClick={queuePending}
            disabled={pending.length === 0 || busy}
            className="col-span-2"
          >
            <IconSpark className="h-4 w-4" />
            {busy ? "Đang xử lý…" : "Thêm vào hàng đợi"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
