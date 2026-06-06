import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import GIFEncoder from "gif-encoder-2";
import { PNG } from "pngjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const framesDir = resolve(root, "test-results/demo-frames");
const outPath = resolve(root, "../docs/demo/finos-hotel-demo.gif");

if (!existsSync(framesDir)) {
  throw new Error(`Không tìm thấy thư mục frame: ${framesDir}`);
}

const frameFiles = readdirSync(framesDir)
  .filter((name) => name.endsWith(".png"))
  .sort()
  .map((name) => join(framesDir, name));

if (!frameFiles.length) {
  throw new Error(`Không có frame PNG trong ${framesDir}`);
}

const frames = frameFiles.map((file) => PNG.sync.read(readFileSync(file)));
const { width, height } = frames[0];

for (const frame of frames) {
  if (frame.width !== width || frame.height !== height) {
    throw new Error("Tất cả frame GIF phải cùng kích thước");
  }
}

mkdirSync(dirname(outPath), { recursive: true });

const encoder = new GIFEncoder(width, height, "neuquant", true);
encoder.setDelay(Number(process.env.DEMO_GIF_DELAY_MS ?? 900));
encoder.setQuality(Number(process.env.DEMO_GIF_QUALITY ?? 16));
encoder.setRepeat(0);
encoder.start();

for (const frame of frames) {
  encoder.addFrame({
    getImageData: () => ({ data: frame.data }),
  });
}

encoder.finish();
writeFileSync(outPath, encoder.out.getData());

console.log(`Wrote ${outPath} from ${frameFiles.length} frames (${width}x${height})`);
