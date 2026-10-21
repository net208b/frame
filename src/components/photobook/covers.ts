/**
 * The fifteen cover presets, drawn on a canvas from a title, a name and a
 * gear line — the same code the Settings swatches, the 3D book and the
 * design prototype use, so a cover looks like itself everywhere.
 *
 * Browser only: this draws with the DOM canvas. The server's Open Graph image
 * is a simpler composition made with sharp (see `app/[locale]/books/[slug]/opengraph-image`),
 * which is why each preset also carries its colours as data.
 *
 * THE GEAR LINE IS WORDS, NOT A LOGO. A manufacturer's logo is that
 * manufacturer's trade mark; "Shot on Fujifilm X100VI" in the cover's own type
 * is a statement of fact, and it keeps the cover FRAME's design throughout.
 */
import type { PhotobookCover, PhotobookGearMode } from '@/types/domain';

type Ctx = CanvasRenderingContext2D;
export type Picture = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface CoverSubject {
  title: string;
  author: string;
  handle: string;
  slug: string;
  gearMode: PhotobookGearMode;
  gearBrand: string | null;
  gearModel: string | null;
}

export interface CoverPreset {
  id: PhotobookCover;
  name: string;
  chip: string;
  ink: string;
  accent: string;
  blurb: string;
  front(ctx: Ctx, s: CoverSubject, photo?: Picture, photos?: readonly Picture[]): void;
  back(ctx: Ctx, s: CoverSubject): void;
}

const COVER_W = 1000, COVER_H = 1400;

function noise(ctx: Ctx, w: number, h: number, alpha: number, scale = 1): void {
  const c = document.createElement('canvas'); c.width = Math.ceil(w / scale); c.height = Math.ceil(h / scale);
  const x = c.getContext('2d'); if (!x) return; const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255; }
  x.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay'; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, w, h); ctx.restore();
}
function linenTexture(ctx: Ctx, w: number, h: number, color: string, alpha: number): void {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 3) { ctx.beginPath(); ctx.moveTo(0, y + Math.random()); ctx.lineTo(w, y + Math.random()); ctx.stroke(); }
  for (let x = 0; x < w; x += 3) { ctx.beginPath(); ctx.moveTo(x + Math.random(), 0); ctx.lineTo(x + Math.random(), h); ctx.stroke(); }
  ctx.restore();
}
function fit(ctx: Ctx, text: string, maxWidth: number, font: string, min = 40): void {
  let size = parseInt(font, 10);
  for (; size >= min; size -= 2) { ctx.font = font.replace(/\d+px/, size + 'px'); if (ctx.measureText(text).width <= maxWidth) break; }
}
function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function qr(ctx: Ctx, x: number, y: number, size: number, color: string): void {
  // A deterministic QR-like block for the mock-up; the real thing is generated server-side.
  const n = 21, cell = size / n; let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.fillStyle = color;
  const finder = (fx: number, fy: number) => { ctx.fillRect(fx, fy, cell * 7, cell * 7); ctx.clearRect(fx + cell, fy + cell, cell * 5, cell * 5); ctx.fillRect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3); };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inFinder = (i < 8 && j < 8) || (i < 8 && j > n - 9) || (i > n - 9 && j < 8);
    if (!inFinder && rnd() > 0.55) ctx.fillRect(x + j * cell, y + i * cell, cell, cell);
  }
  finder(x, y); finder(x + (n - 7) * cell, y); finder(x, y + (n - 7) * cell);
}
function frameMark(ctx: Ctx, x: number, y: number, size: number, color: string, accent: string): void {
  ctx.save(); ctx.lineWidth = size * 0.16; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(x + size * 0.45, y + size * 0.45, size * 0.38, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + size * 0.82, y + size * 0.82, size * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
/* The gear line: the member's camera, as words in the cover's own type.
   Not a manufacturer's logo — see the design note under "ติดอุปกรณ์บนปก". */
function cameraGlyph(ctx: Ctx, x: number, y: number, h: number, color: string): void {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, h * 0.09); ctx.lineJoin = 'round';
  const w = h * 1.45; ctx.beginPath(); ctx.roundRect(x, y + h * 0.22, w, h * 0.78, h * 0.12); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(x + w * 0.28, y, w * 0.3, h * 0.3, h * 0.06); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.61, h * 0.24, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.61, h * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export function gearText(s: CoverSubject): string {
  if (s.gearMode === 'none' || !s.gearBrand) return '';
  return s.gearMode === 'model' && s.gearModel ? `${s.gearBrand} ${s.gearModel}` : s.gearBrand;
}
function gearLine(ctx: Ctx, s: CoverSubject, x: number, y: number, { align = 'left', color = '#fff', size = 26, font = '"IBM Plex Mono", monospace', prefix = 'Shot on ' }: { align?: CanvasTextAlign; color?: string; size?: number; font?: string; prefix?: string } = {}): void {
  const text = gearText(s); if (!text) return;
  ctx.save(); ctx.fillStyle = color; ctx.textAlign = align; ctx.font = `400 ${size}px ${font}`; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px';
  const label = prefix + text; const w = ctx.measureText(label).width; const gh = size * 1.1, gap = size * 0.5;
  let tx = x; let gx = x;
  if (align === 'left') { gx = x; tx = x + gh * 1.45 + gap; }
  else if (align === 'center') { gx = x - (w + gh * 1.45 + gap) / 2; tx = gx + gh * 1.45 + gap; ctx.textAlign = 'left'; }
  else { tx = x; gx = x - w - gap - gh * 1.45; }
  cameraGlyph(ctx, gx, y - gh * 0.86, gh, color);
  ctx.fillText(label, tx, y); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'; ctx.restore();
}
function halftone(ctx: Ctx, w: number, h: number): void {
  // A coarse dot screen over whatever is drawn, for the newsprint cover.
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(20,20,20,0.18)';
  for (let y = 0; y < h; y += 9) for (let x = (y / 9) % 2 ? 4 : 0; x < w; x += 9) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function drawCover(ctx: Ctx, img: Picture | undefined, x: number, y: number, w: number, h: number): void {
  if (!img) { ctx.fillStyle = '#555'; ctx.fillRect(x, y, w, h); return; }
  const iw = img.width, ih = img.height, r = Math.max(w / iw, h / ih), sw = w / r, sh = h / r;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}
function backCommon(ctx: Ctx, s: CoverSubject, c: { ink: string; accent?: string }): void {
  // The three things every back cover carries.
  const ink = c.ink, accent = c.accent || ink;
  frameMark(ctx, 80, COVER_H - 260, 120, ink, accent);
  ctx.fillStyle = ink; ctx.textAlign = 'left';
  ctx.font = '600 44px "IBM Plex Sans", sans-serif'; ctx.fillText('FRAME', 230, COVER_H - 190);
  ctx.font = '400 30px "IBM Plex Mono", monospace'; ctx.globalAlpha = 0.8;
  ctx.fillText('@' + s.handle, 230, COVER_H - 140);
  ctx.fillText('worldofstreetphoto.com/b/' + s.slug, 230, COVER_H - 98);
  ctx.globalAlpha = 1;
  qr(ctx, COVER_W - 300, COVER_H - 300, 200, ink);
  ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.globalAlpha = 0.6;
  const gear = gearText(s);
  ctx.fillText('ภาพทุกใบเป็นของช่างภาพ · All photographs © ' + s.author + (gear ? ' · Shot on ' + gear : ''), 80, COVER_H - 40);
  ctx.globalAlpha = 1;
}

const PRESETS: Record<PhotobookCover, CoverPreset> = {
  linen: {
    id: 'linen', name: 'Linen', chip: '#1f3d2b', ink: '#e8d38c', accent: '#e8d38c',
    blurb: 'ผ้าลินินเขียวเข้ม ปั๊มฟอยล์ทอง แบบที่ร้านหนังสือภาพใช้มาห้าสิบปี เหมาะกับขาวดำและงานที่อยากดูเป็นงานหนังสือจริง',
    front(ctx, s) {
      ctx.fillStyle = '#1f3d2b'; ctx.fillRect(0, 0, COVER_W, COVER_H); linenTexture(ctx, COVER_W, COVER_H, '#0e2419', 0.5); noise(ctx, COVER_W, COVER_H, 0.12, 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(70, 70, COVER_W - 140, COVER_H - 140);
      ctx.fillStyle = '#e8d38c'; ctx.textAlign = 'center';
      fit(ctx, s.title, 760, 'italic 400 120px "Fraunces", Georgia, serif', 60);
      const lines = wrapLines(ctx, s.title, 760); let y = 560 - (lines.length - 1) * 70;
      for (const l of lines) { ctx.fillText(l, COVER_W / 2, y); y += 140; }
      ctx.font = '500 34px "IBM Plex Sans", sans-serif'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px'; ctx.fillText(s.author.toUpperCase(), COVER_W / 2, y + 40); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      ctx.fillRect(COVER_W / 2 - 40, y + 90, 80, 3);
      gearLine(ctx, s, COVER_W / 2, COVER_H - 130, { align: 'center', color: '#e8d38c', size: 24 });
    },
    back(ctx, s) {
      ctx.fillStyle = '#1f3d2b'; ctx.fillRect(0, 0, COVER_W, COVER_H); linenTexture(ctx, COVER_W, COVER_H, '#0e2419', 0.5); noise(ctx, COVER_W, COVER_H, 0.12, 2);
      backCommon(ctx, s, { ink: '#e8d38c', accent: '#e8d38c' });
    },
  },
  darkroom: {
    id: 'darkroom', name: 'Darkroom', chip: '#101010', ink: '#f2f2f2', accent: '#d7ff3f',
    blurb: 'ดำด้าน มีช่องสี่เหลี่ยมเล็กให้ภาพนำเล่ม ตัวอักษรเล็กและห่าง เหมือนกล่องกระดาษอัดรูป เหมาะกับงานกลางคืนและนีออน',
    front(ctx, s, photo) {
      ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.08, 2);
      if (photo) { const w = 520, h = 360; ctx.drawImage(photo, 240, 300, w, h); ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.strokeRect(239.5, 299.5, w + 1, h + 1); }
      ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'left';
      ctx.font = '400 26px "IBM Plex Mono", monospace'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '8px'; ctx.fillText('PHOTOBOOK · ' + s.handle.toUpperCase(), 240, 260); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      fit(ctx, s.title, 720, '600 72px "IBM Plex Sans", sans-serif', 40);
      const lines = wrapLines(ctx, s.title, 720); let y = 790; for (const l of lines) { ctx.fillText(l, 240, y); y += 84; }
      ctx.font = '400 30px "IBM Plex Sans", sans-serif'; ctx.globalAlpha = 0.7; ctx.fillText(s.author, 240, y + 10); ctx.globalAlpha = 1;
      ctx.fillStyle = '#d7ff3f'; ctx.fillRect(240, COVER_H - 160, 60, 6);
      gearLine(ctx, s, 240, COVER_H - 90, { color: '#f2f2f2', size: 24 });
    },
    back(ctx, s) { ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.08, 2); backCommon(ctx, s, { ink: '#f2f2f2', accent: '#d7ff3f' }); },
  },
  kraft: {
    id: 'kraft', name: 'Kraft', chip: '#b8865a', ink: '#2b1d12', accent: '#b5281f',
    blurb: 'กระดาษคราฟท์ ตราประทับแดงเอียงเล็กน้อย ดูเป็นซีน (zine) ทำมือ เหมาะกับงานฟิล์มและชุดภาพจากการเดินทาง',
    front(ctx, s) {
      ctx.fillStyle = '#b8865a'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.22, 3);
      ctx.save(); ctx.translate(COVER_W / 2, 600); ctx.rotate(-0.08);
      ctx.strokeStyle = '#b5281f'; ctx.lineWidth = 10; ctx.globalAlpha = 0.85; ctx.strokeRect(-360, -200, 720, 400); ctx.lineWidth = 3; ctx.strokeRect(-340, -180, 680, 360);
      ctx.fillStyle = '#b5281f'; ctx.textAlign = 'center';
      fit(ctx, s.title.toUpperCase(), 620, '700 84px "IBM Plex Sans", sans-serif', 44);
      const lines = wrapLines(ctx, s.title.toUpperCase(), 620); let y = -40 + (lines.length === 1 ? 30 : -(lines.length - 2) * 45);
      for (const l of lines) { ctx.fillText(l, 0, y); y += 90; }
      ctx.font = '500 30px "IBM Plex Mono", monospace'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '4px'; ctx.fillText(s.author.toUpperCase(), 0, 150); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      ctx.restore();
      ctx.fillStyle = '#2b1d12'; ctx.globalAlpha = 0.7; ctx.textAlign = 'center'; ctx.font = '400 26px "IBM Plex Mono", monospace';
      ctx.fillText('A FRAME PHOTOBOOK · 24 PAGES', COVER_W / 2, COVER_H - 120); ctx.globalAlpha = 1;
      gearLine(ctx, s, COVER_W / 2, COVER_H - 70, { align: 'center', color: '#2b1d12', size: 24 });
    },
    back(ctx, s) { ctx.fillStyle = '#b8865a'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.22, 3); backCommon(ctx, s, { ink: '#2b1d12', accent: '#b5281f' }); },
  },
  gallery: {
    id: 'gallery', name: 'Gallery', chip: '#f3efe6', ink: '#1a1814', accent: '#1a1814',
    blurb: 'บอร์ดขาวหนา ภาพนำติดเต็มด้านบน ชื่อเล่มเล็ก ๆ ด้านล่าง แบบแคตตาล็อกนิทรรศการ เหมาะกับงานสีและงานสถาปัตยกรรม',
    front(ctx, s, photo) {
      ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.06, 2);
      if (photo) {
        const iw = photo.width, ih = photo.height, bw = COVER_W - 160, bh = 880, r = Math.max(bw / iw, bh / ih);
        const sw = bw / r, sh = bh / r; ctx.drawImage(photo, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 80, 80, bw, bh);
      }
      ctx.fillStyle = '#1a1814'; ctx.textAlign = 'left';
      fit(ctx, s.title, 820, '500 58px "IBM Plex Sans", sans-serif', 36); ctx.fillText(s.title, 80, 1090);
      ctx.font = 'italic 400 44px "Fraunces", Georgia, serif'; ctx.fillText(s.author, 80, 1160);
      ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.globalAlpha = 0.6; ctx.fillText('FRAME · ' + new Date().getFullYear(), 80, COVER_H - 80); ctx.globalAlpha = 1;
      gearLine(ctx, s, COVER_W - 80, COVER_H - 80, { align: 'right', color: '#1a1814', size: 24 });
    },
    back(ctx, s) { ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.06, 2); backCommon(ctx, s, { ink: '#1a1814', accent: '#1a1814' }); },
  },
  signal: {
    id: 'signal', name: 'Signal', chip: '#0f1a33', ink: '#f6f3ff', accent: '#ff5fa2',
    blurb: 'น้ำเงินเข้มกับแถบไล่สีนีออนด้านซ้าย ชื่อเล่มตัวหนาใหญ่ เป็นปกที่ดูดีที่สุดตอนย่อเป็นพรีวิวเล็ก ๆ ใน bio',
    front(ctx, s) {
      ctx.fillStyle = '#0f1a33'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2);
      const g = ctx.createLinearGradient(0, 0, 0, COVER_H); g.addColorStop(0, '#ff5fa2'); g.addColorStop(0.5, '#ffb347'); g.addColorStop(1, '#4de1ff');
      ctx.fillStyle = g; ctx.fillRect(80, 0, 36, COVER_H);
      ctx.fillStyle = '#f6f3ff'; ctx.textAlign = 'left';
      fit(ctx, s.title, 740, '700 116px "IBM Plex Sans", sans-serif', 56);
      const lines = wrapLines(ctx, s.title, 740); let y = 980 - (lines.length - 1) * 120; for (const l of lines) { ctx.fillText(l, 180, y); y += 124; }
      ctx.font = '400 34px "IBM Plex Sans", sans-serif'; ctx.globalAlpha = 0.75; ctx.fillText(s.author, 180, y + 10); ctx.globalAlpha = 1;
      ctx.font = '400 26px "IBM Plex Mono", monospace'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px'; ctx.fillText('PHOTOBOOK', 180, 200); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      gearLine(ctx, s, 180, COVER_H - 110, { color: '#f6f3ff', size: 24 });
    },
    back(ctx, s) {
      ctx.fillStyle = '#0f1a33'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2);
      const g = ctx.createLinearGradient(0, 0, 0, COVER_H); g.addColorStop(0, '#4de1ff'); g.addColorStop(0.5, '#ffb347'); g.addColorStop(1, '#ff5fa2');
      ctx.fillStyle = g; ctx.fillRect(COVER_W - 116, 0, 36, COVER_H);
      backCommon(ctx, s, { ink: '#f6f3ff', accent: '#ff5fa2' });
    },
  },
  contact: {
    id: 'contact', name: 'Contact', chip: '#111111', ink: '#f4f4f4', accent: '#ff5a1f',
    blurb: 'คอนแทคชีตจากห้องมืด ภาพทั้งเล่มเรียงเป็นช่องเล็ก ๆ บนพื้นดำ มีวงมาร์กเกอร์ส้มบนเฟรมที่เลือก คนถ่ายฟิล์มจะยิ้ม',
    front(ctx, s, photo, photos = []) {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2);
      const cols = 4, rows = 5, cw = 190, ch = 130, gx = (COVER_W - cols * cw - (cols - 1) * 24) / 2, gy = 150;
      let k = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, k++) {
        const x = gx + c * (cw + 24), y = gy + r * (ch + 46);
        ctx.fillStyle = '#1c1c1c'; ctx.fillRect(x - 6, y - 6, cw + 12, ch + 12);
        const img = photos[k % Math.max(1, photos.length)] || photo; drawCover(ctx, img, x, y, cw, ch);
        ctx.fillStyle = '#9a9a9a'; ctx.font = '400 16px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText('▶ ' + String(k + 1).padStart(2, '0') + 'A', x, y + ch + 24);
      }
      ctx.save(); ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(gx + cw * 1.5 + 24, gy + ch * 1.5 + 46, cw * 0.62, ch * 0.72, -0.1, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#f4f4f4'; ctx.textAlign = 'left'; fit(ctx, s.title, 700, '600 56px "IBM Plex Sans", sans-serif', 34); ctx.fillText(s.title, gx, COVER_H - 150);
      ctx.font = '400 26px "IBM Plex Mono", monospace'; ctx.globalAlpha = 0.7; ctx.fillText(s.author.toUpperCase() + ' · CONTACT SHEET', gx, COVER_H - 105); ctx.globalAlpha = 1;
      gearLine(ctx, s, gx, COVER_H - 55, { color: '#f4f4f4', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2); backCommon(ctx, s, { ink: '#f4f4f4', accent: '#ff5a1f' }); },
  },
  zine: {
    id: 'zine', name: 'Zine', chip: '#2b43ff', ink: '#fff', accent: '#ff3fa4',
    blurb: 'ริโซกราฟสองสี น้ำเงินกับชมพูสะท้อนแสง ชื่อเล่มใหญ่ทับซ้อนและพิมพ์เหลื่อมนิดหน่อยแบบตั้งใจ สำหรับคนที่อยากให้เล่มดูมีเสียง',
    front(ctx, s) {
      ctx.fillStyle = '#f6f2e6'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.14, 3);
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#2b43ff'; ctx.fillRect(0, 0, COVER_W, 560); ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.arc(760, 980, 300, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.textAlign = 'left'; fit(ctx, s.title.toUpperCase(), 880, '700 150px "IBM Plex Sans", sans-serif', 64);
      const lines = wrapLines(ctx, s.title.toUpperCase(), 880); let y = 420;
      for (const l of lines) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#ff3fa4'; ctx.fillText(l, 60 + 8, y + 6); ctx.fillStyle = '#2b43ff'; ctx.fillText(l, 60, y); ctx.restore(); y += 150; }
      ctx.fillStyle = '#17171a'; ctx.font = '500 34px "IBM Plex Mono", monospace'; ctx.fillText(s.author, 60, COVER_H - 150);
      ctx.font = '400 26px "IBM Plex Mono", monospace'; ctx.globalAlpha = 0.7; ctx.fillText('ISSUE 01 · 24 PP · FRAME', 60, COVER_H - 105); ctx.globalAlpha = 1;
      gearLine(ctx, s, 60, COVER_H - 55, { color: '#17171a', size: 22 });
    },
    back(ctx, s) {
      ctx.fillStyle = '#f6f2e6'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.14, 3);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#2b43ff'; ctx.fillRect(0, 0, 36, COVER_H); ctx.restore();
      backCommon(ctx, s, { ink: '#17171a', accent: '#ff3fa4' });
    },
  },
  archive: {
    id: 'archive', name: 'Archive', chip: '#6b6f66', ink: '#15160f', accent: '#15160f',
    blurb: 'กล่องเอกสารสีเทาเขียว ฉลากพิมพ์ดีดระบุเล่ม สถานที่ และปี เหมาะกับงานสารคดีระยะยาวที่ตั้งใจทำต่อเป็นชุด',
    front(ctx, s) {
      ctx.fillStyle = '#6b6f66'; ctx.fillRect(0, 0, COVER_W, COVER_H); linenTexture(ctx, COVER_W, COVER_H, '#4d5149', 0.35); noise(ctx, COVER_W, COVER_H, 0.12, 2);
      ctx.fillStyle = '#3f433c'; for (const [x, y] of [[0, 0], [COVER_W - 110, 0], [0, COVER_H - 110], [COVER_W - 110, COVER_H - 110]] as const) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 110, y); ctx.lineTo(x + 110, y + 110); ctx.lineTo(x, y + 110); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#f1efe3'; ctx.fillRect(130, 470, COVER_W - 260, 420); ctx.strokeStyle = '#15160f'; ctx.lineWidth = 3; ctx.strokeRect(150, 490, COVER_W - 300, 380);
      ctx.fillStyle = '#15160f'; ctx.textAlign = 'left';
      ctx.font = '400 26px "IBM Plex Mono", monospace'; ctx.fillText('ARCHIVE · VOL. 01', 190, 560); ctx.fillText('— — — — — — — — — — — — — — — —', 190, 600);
      fit(ctx, s.title.toUpperCase(), 600, '500 52px "IBM Plex Mono", monospace', 30);
      const lines = wrapLines(ctx, s.title.toUpperCase(), 600); let y = 680; for (const l of lines.slice(0, 2)) { ctx.fillText(l, 190, y); y += 60; }
      ctx.font = '400 26px "IBM Plex Mono", monospace'; ctx.fillText(s.author.toUpperCase() + ' · ' + new Date().getFullYear(), 190, 830);
      gearLine(ctx, s, 190, COVER_H - 160, { color: '#f1efe3', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#6b6f66'; ctx.fillRect(0, 0, COVER_W, COVER_H); linenTexture(ctx, COVER_W, COVER_H, '#4d5149', 0.35); noise(ctx, COVER_W, COVER_H, 0.12, 2); backCommon(ctx, s, { ink: '#15160f', accent: '#15160f' }); },
  },
  monolith: {
    id: 'monolith', name: 'Monolith', chip: '#232323', ink: '#ededed', accent: '#ededed',
    blurb: 'ถ่านดำ ตัวอักษรคำแรกของชื่อเล่มใหญ่จนตกขอบ ที่เหลือเล็กลงใต้มัน ปกที่พูดคำเดียว เหมาะกับงานที่มีเรื่องเดียวชัด ๆ',
    front(ctx, s) {
      ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2);
      const [first = '', ...rest] = s.title.split(/\s+/);
      ctx.fillStyle = '#ededed'; ctx.textAlign = 'left';
      // The first word runs just past the right edge — a bleed, not a crop:
      // sized so about a tenth of it leaves the cover, whatever the word.
      let size = 360; ctx.font = `700 ${size}px "IBM Plex Sans", sans-serif`;
      while (size > 120 && ctx.measureText(first.toUpperCase()).width > COVER_W * 1.1) { size -= 8; ctx.font = `700 ${size}px "IBM Plex Sans", sans-serif`; }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, COVER_W, COVER_H); ctx.clip(); ctx.fillText(first.toUpperCase(), 40, 560); ctx.restore();
      fit(ctx, rest.join(' '), 840, '400 64px "IBM Plex Sans", sans-serif', 34); if (rest.length) ctx.fillText(rest.join(' '), 60, 700);
      ctx.font = 'italic 400 40px "Fraunces", Georgia, serif'; ctx.fillText(s.author, 60, 800);
      ctx.fillStyle = '#ededed'; ctx.fillRect(60, COVER_H - 160, 2, 60);
      gearLine(ctx, s, 60, COVER_H - 60, { color: '#ededed', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2); backCommon(ctx, s, { ink: '#ededed', accent: '#ededed' }); },
  },
  mat: {
    id: 'mat', name: 'Mat', chip: '#ebe6d8', ink: '#2a2721', accent: '#2a2721',
    blurb: 'ภาพนำเล่มติดกลางปกขนาดเล็ก ล้อมด้วยขอบกระดาษกว้างเหมือนภาพพิมพ์ใส่แมท ชื่อเล่มเล็กใต้ภาพ ปกที่สุภาพที่สุดในชุด',
    front(ctx, s, photo) {
      ctx.fillStyle = '#ebe6d8'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.07, 2);
      const w = 520, h = 400, x = (COVER_W - w) / 2, y = 330;
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x - 24, y - 24, w + 48, h + 48); ctx.fillStyle = '#f7f4ec'; ctx.fillRect(x - 22, y - 22, w + 44, h + 44);
      drawCover(ctx, photo, x, y, w, h);
      ctx.fillStyle = '#2a2721'; ctx.textAlign = 'center';
      ctx.font = 'italic 400 46px "Fraunces", Georgia, serif'; fit(ctx, s.title, 700, 'italic 400 46px "Fraunces", Georgia, serif', 30); ctx.fillText(s.title, COVER_W / 2, y + h + 130);
      ctx.font = '400 24px "IBM Plex Mono", monospace'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '5px'; ctx.globalAlpha = 0.7; ctx.fillText(s.author.toUpperCase(), COVER_W / 2, y + h + 180); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'; ctx.globalAlpha = 1;
      gearLine(ctx, s, COVER_W / 2, COVER_H - 90, { align: 'center', color: '#2a2721', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#ebe6d8'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.07, 2); backCommon(ctx, s, { ink: '#2a2721', accent: '#2a2721' }); },
  },
  ticket: {
    id: 'ticket', name: 'Ticket', chip: '#e9dcc3', ink: '#1f2a44', accent: '#c8372d',
    blurb: 'ตั๋วเดินทาง มีรอยปรุ บาร์โค้ด และช่องชื่อเมือง สำหรับชุดภาพจากการเดินทางที่อยากให้คนดูรู้สึกว่าได้ตั๋วมาด้วย',
    front(ctx, s) {
      ctx.fillStyle = '#e9dcc3'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.12, 3);
      ctx.strokeStyle = '#1f2a44'; ctx.setLineDash([14, 14]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 940); ctx.lineTo(COVER_W, 940); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#1f2a44'; ctx.fillRect(0, 0, COVER_W, 150); ctx.fillStyle = '#e9dcc3'; ctx.textAlign = 'left'; ctx.font = '600 40px "IBM Plex Sans", sans-serif'; ctx.fillText('FRAME PHOTOBOOK', 70, 95);
      ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.textAlign = 'right'; ctx.fillText('ADMIT ONE', COVER_W - 70, 95);
      ctx.fillStyle = '#1f2a44'; ctx.textAlign = 'left';
      ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.fillText('TITLE', 70, 260);
      fit(ctx, s.title.toUpperCase(), 860, '700 92px "IBM Plex Sans", sans-serif', 44);
      const lines = wrapLines(ctx, s.title.toUpperCase(), 860); let y = 360; for (const l of lines.slice(0, 2)) { ctx.fillText(l, 70, y); y += 100; }
      ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.fillText('PHOTOGRAPHER', 70, y + 40); ctx.font = '600 44px "IBM Plex Sans", sans-serif'; ctx.fillText(s.author, 70, y + 100);
      ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.fillText('PAGES', 70, y + 170); ctx.font = '600 44px "IBM Plex Sans", sans-serif'; ctx.fillText('24', 70, y + 230);
      ctx.fillStyle = '#c8372d'; ctx.save(); ctx.translate(760, 760); ctx.rotate(-0.25); ctx.strokeStyle = '#c8372d'; ctx.lineWidth = 6; ctx.strokeRect(-130, -50, 260, 100); ctx.font = '700 36px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('VALID', 0, 14); ctx.restore();
      ctx.fillStyle = '#1f2a44'; let bx = 70; for (let i = 0; i < 70; i++) { const w = 4 + ((i * 7) % 3) * 4; ctx.fillRect(bx, 1010, w, 220); bx += w + 6; }
      ctx.font = '400 22px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText('worldofstreetphoto.com/b/' + s.slug, 70, COVER_H - 100);
      gearLine(ctx, s, 70, COVER_H - 55, { color: '#1f2a44', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#e9dcc3'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.12, 3); ctx.fillStyle = '#1f2a44'; ctx.fillRect(0, 0, COVER_W, 60); backCommon(ctx, s, { ink: '#1f2a44', accent: '#c8372d' }); },
  },
  film: {
    id: 'film', name: 'Film', chip: '#1a1a1a', ink: '#efe9d6', accent: '#f0b429',
    blurb: 'แถบฟิล์ม 35 มม. วิ่งลงมาด้านซ้ายพร้อมรูสปร็อกเก็ต เฟรมข้างในคือภาพในเล่ม ชื่อเล่มอยู่ขวา สำหรับคนถ่ายฟิล์มโดยเฉพาะ',
    front(ctx, s, photo, photos = []) {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2);
      const sx = 80, sw = 300; ctx.fillStyle = '#0c0c0c'; ctx.fillRect(sx, 0, sw, COVER_H);
      ctx.fillStyle = '#efe9d6'; for (let y = 18; y < COVER_H; y += 44) { ctx.fillRect(sx + 14, y, 22, 16); ctx.fillRect(sx + sw - 36, y, 22, 16); }
      for (let i = 0; i < 5; i++) { const y = 60 + i * 270; drawCover(ctx, photos[i % Math.max(1, photos.length)] || photo, sx + 50, y, sw - 100, 240); ctx.fillStyle = '#f0b429'; ctx.font = '400 18px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText(String(i + 12) + 'A', sx + 50, y + 262); }
      ctx.fillStyle = '#efe9d6'; ctx.textAlign = 'left';
      fit(ctx, s.title, 520, '600 72px "IBM Plex Sans", sans-serif', 36);
      const lines = wrapLines(ctx, s.title, 520); let y = 560; for (const l of lines) { ctx.fillText(l, 430, y); y += 84; }
      ctx.font = 'italic 400 40px "Fraunces", Georgia, serif'; ctx.fillText(s.author, 430, y + 20);
      ctx.fillStyle = '#f0b429'; ctx.font = '400 24px "IBM Plex Mono", monospace'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '5px'; ctx.fillText('ISO 400 · 24 EXP', 430, y + 90); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      gearLine(ctx, s, 430, COVER_H - 80, { color: '#efe9d6', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.1, 2); backCommon(ctx, s, { ink: '#efe9d6', accent: '#f0b429' }); },
  },
  newsprint: {
    id: 'newsprint', name: 'Newsprint', chip: '#f1ecdf', ink: '#1b1b1b', accent: '#1b1b1b',
    blurb: 'หน้าหนึ่งหนังสือพิมพ์ หัวเรื่องเซอริฟใหญ่ มีวันที่ ภาพนำแปลงเป็นสกรีนจุดขาวดำ เหมาะกับงานสารคดีและงานที่มีเหตุการณ์',
    front(ctx, s, photo) {
      ctx.fillStyle = '#f1ecdf'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.12, 3);
      ctx.fillStyle = '#1b1b1b'; ctx.textAlign = 'center';
      ctx.font = '600 44px "Fraunces", Georgia, serif'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '10px'; ctx.fillText('THE FRAME', COVER_W / 2, 120); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      ctx.fillRect(70, 150, COVER_W - 140, 4); ctx.fillRect(70, 160, COVER_W - 140, 1);
      ctx.font = '400 22px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(), 70, 200);
      ctx.textAlign = 'right'; ctx.fillText('EDITION OF ONE · 24 PAGES', COVER_W - 70, 200);
      ctx.textAlign = 'left'; fit(ctx, s.title, 860, '600 88px "Fraunces", Georgia, serif', 44);
      const lines = wrapLines(ctx, s.title, 860); let y = 320; for (const l of lines.slice(0, 2)) { ctx.fillText(l, 70, y); y += 96; }
      ctx.font = 'italic 400 30px "Fraunces", Georgia, serif'; ctx.fillText('Photographs by ' + s.author, 70, y + 10);
      const ph = 560; ctx.save(); ctx.filter = 'grayscale(1) contrast(1.15)'; drawCover(ctx, photo, 70, y + 50, COVER_W - 140, ph); ctx.restore(); halftone(ctx, COVER_W, COVER_H);
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(70, y + 50 + ph + 20, COVER_W - 140, 1);
      gearLine(ctx, s, 70, COVER_H - 60, { color: '#1b1b1b', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#f1ecdf'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.12, 3); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(70, 100, COVER_W - 140, 4); backCommon(ctx, s, { ink: '#1b1b1b', accent: '#1b1b1b' }); },
  },
  blueprint: {
    id: 'blueprint', name: 'Blueprint', chip: '#1e4b8f', ink: '#eaf3ff', accent: '#eaf3ff',
    blurb: 'ไซยาโนไทป์ น้ำเงินปรัสเซียกับเส้นกริดขาว ภาพนำย้อมเป็นโทนเดียว เหมาะกับงานสถาปัตยกรรมและเรขาคณิต',
    front(ctx, s, photo) {
      ctx.fillStyle = '#1e4b8f'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.12, 2);
      ctx.strokeStyle = 'rgba(234,243,255,0.18)'; ctx.lineWidth = 1; for (let x = 0; x <= COVER_W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, COVER_H); ctx.stroke(); } for (let y = 0; y <= COVER_H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(COVER_W, y); ctx.stroke(); }
      ctx.save(); ctx.filter = 'grayscale(1) contrast(1.1)'; drawCover(ctx, photo, 100, 220, COVER_W - 200, 640); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#1e4b8f'; ctx.fillRect(100, 220, COVER_W - 200, 640); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.25; ctx.fillStyle = '#4f8fe0'; ctx.fillRect(100, 220, COVER_W - 200, 640); ctx.restore();
      ctx.strokeStyle = '#eaf3ff'; ctx.lineWidth = 2; ctx.strokeRect(100, 220, COVER_W - 200, 640);
      ctx.fillStyle = '#eaf3ff'; ctx.textAlign = 'left';
      ctx.font = '400 24px "IBM Plex Mono", monospace'; ctx.fillText('FIG. 1 — ' + s.handle.toUpperCase(), 100, 190);
      fit(ctx, s.title.toUpperCase(), 800, '600 66px "IBM Plex Mono", monospace', 34);
      const lines = wrapLines(ctx, s.title.toUpperCase(), 800); let y = 960; for (const l of lines.slice(0, 2)) { ctx.fillText(l, 100, y); y += 76; }
      ctx.font = '400 28px "IBM Plex Mono", monospace'; ctx.fillText(s.author.toUpperCase() + ' · SCALE 1:1', 100, y + 20);
      gearLine(ctx, s, 100, COVER_H - 60, { color: '#eaf3ff', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#1e4b8f'; ctx.fillRect(0, 0, COVER_W, COVER_H); noise(ctx, COVER_W, COVER_H, 0.12, 2); backCommon(ctx, s, { ink: '#eaf3ff', accent: '#eaf3ff' }); },
  },
  label: {
    id: 'label', name: 'Label', chip: '#2e2a26', ink: '#f3eee4', accent: '#e8c25c',
    blurb: 'กล่องดำกับเทปกาวสีครีมแปะเฉียง เขียนชื่อเล่มบนเทป ดูเป็นกล่องเก็บงานส่วนตัวที่เพิ่งหยิบลงมาจากชั้น',
    front(ctx, s) {
      ctx.fillStyle = '#2e2a26'; ctx.fillRect(0, 0, COVER_W, COVER_H); linenTexture(ctx, COVER_W, COVER_H, '#1c1916', 0.4); noise(ctx, COVER_W, COVER_H, 0.12, 2);
      ctx.save(); ctx.translate(COVER_W / 2, 640); ctx.rotate(-0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-396, -126, 800, 260);
      ctx.fillStyle = '#efe3c2'; ctx.fillRect(-400, -130, 800, 260); noise(ctx, 800, 260, 0.1, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; for (let x = -400; x < 400; x += 11) ctx.fillRect(x, -130, 3, 260);
      ctx.fillStyle = '#2e2a26'; ctx.textAlign = 'center';
      fit(ctx, s.title, 700, 'italic 600 80px "Fraunces", Georgia, serif', 40); ctx.fillText(s.title, 0, 0);
      ctx.font = '400 26px "IBM Plex Mono", monospace'; (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '4px'; ctx.fillText(s.author.toUpperCase(), 0, 70); (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      ctx.restore();
      ctx.fillStyle = '#e8c25c'; ctx.font = '400 22px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText('BOX 01 · HANDLE WITH CARE', 80, COVER_H - 100);
      gearLine(ctx, s, 80, COVER_H - 55, { color: '#f3eee4', size: 22 });
    },
    back(ctx, s) { ctx.fillStyle = '#2e2a26'; ctx.fillRect(0, 0, COVER_W, COVER_H); linenTexture(ctx, COVER_W, COVER_H, '#1c1916', 0.4); noise(ctx, COVER_W, COVER_H, 0.12, 2); backCommon(ctx, s, { ink: '#f3eee4', accent: '#e8c25c' }); },
  },
};


export const PHOTOBOOK_COVER_PRESETS: readonly CoverPreset[] = Object.values(PRESETS);

export function coverPreset(id: PhotobookCover): CoverPreset {
  return PRESETS[id];
}

/** A front or back cover, drawn at the given scale of the 1000 x 1400 artwork. */
export function drawCoverFace(
  side: 'front' | 'back',
  preset: CoverPreset,
  subject: CoverSubject,
  photos: readonly Picture[],
  scale = 1,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(COVER_W * scale);
  canvas.height = Math.round(COVER_H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  if (side === 'front') preset.front(ctx, subject, photos[0], photos);
  else preset.back(ctx, subject);
  return canvas;
}

export { COVER_W, COVER_H };
