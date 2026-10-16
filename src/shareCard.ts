import { MARK_SVG_DOCUMENT } from './logoMark';

// The share card: a flat, ink-outlined scoreboard in the game's own palette, drawn on
// a canvas so a run can leave the browser as a PNG. Everything is
// geometry and text, so there is no asset to fetch and nothing to keep in sync beyond
// the mark, which comes from logoMark.ts.
//
// It is drawn at 1080x1350: the 4:5 crop that social apps and chat clients show whole.
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

const INK = '#17181C';
const SKY = '#CFE7F6';
const SEA = '#1A85B6';
const DEEP = '#24698F';
const SAND = '#E7D3A4';
const GOLD = '#F6C445';
const CREAM = '#FDFBF7';
const DRIFT = '#BFAE93';
const STONE = '#B8A98F';
const RUST = '#E25B45';
const SLATE = '#767E88';
const QUIET = '#6B6E75';

const GAME_FONT = "'Righteous', 'Space Grotesk', system-ui, sans-serif";
const UI_FONT = "'Space Grotesk', system-ui, sans-serif";

export interface ShareCardData {
  name: string;
  best: number;
  score: number;
  wave: number;
  season: number;
  tide: string;
  survived: boolean;
  isNewBest: boolean;
  url: string;
}

// The name is the only thing a player types, so it is the only thing that can arrive
// wrong. Keep it one line, printable, and short enough to fit the card.
export function sanitizeName(raw: string): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return cleaned.length > 0 ? cleaned : 'SCUTTLER';
}

export function shareFileName(data: ShareCardData): string {
  const who =
    sanitizeName(data.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'scuttler';
  return `wrackline-${who}-${data.best}.png`;
}

export function shareCaption(data: ShareCardData): string {
  const who = sanitizeName(data.name);
  const how =
    data.survived && data.isNewBest
      ? 'survived the season with a new best'
      : data.survived
        ? 'survived the season'
        : `caught on wave ${data.wave + 1}`;
  return `${who} ${how}: ${data.best} in WRACKLINE`;
}

const mark = (): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('the WRACKLINE mark could not be rasterised'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MARK_SVG_DOCUMENT)}`;
  });

// The card says something in the game's own display font, so wait for it rather than
// falling back to a system face and looking like a different product.
async function readyFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    await Promise.all([
      fonts.load(`400 120px ${GAME_FONT}`),
      fonts.load(`900 120px ${UI_FONT}`),
      fonts.ready
    ]);
  } catch {
    // A font that will not load is not a failed card: the fallbacks still draw.
  }
}

function spacing(ctx: CanvasRenderingContext2D, px: number): void {
  const target = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in target) target.letterSpacing = `${px}px`;
}

// Shrink until it fits, so a long name or a six-figure score cannot run off the card.
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  spec: { size: number; min: number; family: string; weight?: string; spacingPx?: number },
  maxWidth: number
): number {
  let size = spec.size;
  for (;;) {
    ctx.font = `${spec.weight ? `${spec.weight} ` : ''}${size}px ${spec.family}`;
    spacing(ctx, spec.spacingPx ?? 0);
    if (ctx.measureText(text).width <= maxWidth || size <= spec.min) return size;
    size -= 4;
  }
}

function centered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spec: { size: number; min: number; family: string; weight?: string; spacingPx?: number; color: string },
  maxWidth: number
): void {
  fitFont(ctx, text, spec, maxWidth);
  ctx.fillStyle = spec.color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  spacing(ctx, 0);
}

function facet(ctx: CanvasRenderingContext2D, points: [number, number][], closeToBottom: boolean): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  if (closeToBottom) {
    ctx.lineTo(points[points.length - 1][0], CARD_HEIGHT);
    ctx.lineTo(points[0][0], CARD_HEIGHT);
    ctx.closePath();
  }
}

function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fill: string,
  color: string
): void {
  const size = 31;
  ctx.font = `900 ${size}px ${UI_FONT}`;
  spacing(ctx, 4);
  const width = ctx.measureText(text).width + 66;
  const height = 64;
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(cx - width / 2, cy - height / 2, width, height, 16);
  else ctx.rect(cx - width / 2, cy - height / 2, width, height);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy + size * 0.35);
  spacing(ctx, 0);
}

function drawCard(ctx: CanvasRenderingContext2D, data: ShareCardData, badge: HTMLImageElement): void {
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Sky, then the sun the mark has, then the sea's own faceted edge.
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = GOLD;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(880, 150, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = CREAM;
  ctx.lineWidth = 5;
  for (const spray of [
    [
      [982, 110],
      [1024, 146],
      [992, 178]
    ],
    [
      [996, 190],
      [1038, 226],
      [1006, 258]
    ]
  ] as [number, number][][]) {
    facet(ctx, spray, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const seaEdge: [number, number][] = [
    [0, 940],
    [160, 906],
    [340, 944],
    [520, 910],
    [700, 946],
    [880, 908],
    [1080, 938]
  ];
  facet(ctx, seaEdge, true);
  ctx.fillStyle = SEA;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(seaEdge[0][0], seaEdge[0][1] - 18);
  for (const [x, y] of seaEdge) ctx.lineTo(x, y - 18);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(seaEdge[0][0], seaEdge[0][1]);
  for (const [x, y] of seaEdge) ctx.lineTo(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.stroke();

  // The beach, with the day's wrack left on it, as on the mark.
  const sandEdge: [number, number][] = [
    [0, 1132],
    [170, 1104],
    [350, 1138],
    [530, 1108],
    [710, 1140],
    [890, 1110],
    [1080, 1134]
  ];
  facet(ctx, sandEdge, true);
  ctx.fillStyle = SAND;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.lineJoin = 'miter';

  ctx.save();
  ctx.translate(150, 1306);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.fillStyle = DRIFT;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-65, -13, 130, 26, 13);
  else ctx.rect(-65, -13, 130, 26);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  for (const [x, y, r, fill] of [
    [228, 1292, 13, STONE],
    [962, 1298, 15, STONE],
    [1004, 1286, 11, RUST],
    [930, 1278, 12, SLATE]
  ] as [number, number, number, string][]) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // The badge and the wordmark, top left, at the size the mark is drawn for.
  ctx.drawImage(badge, 72, 72, 200, 200);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `400 72px ${GAME_FONT}`;
  spacing(ctx, 3);
  ctx.fillText('WRACKLINE', 308, 178);
  spacing(ctx, 0);

  const who = sanitizeName(data.name).toUpperCase();
  ctx.font = `900 44px ${UI_FONT}`;
  spacing(ctx, 2.5);
  ctx.fillStyle = DEEP;
  ctx.fillText(who, 308, 238);
  spacing(ctx, 0);

  // The headline is the record, because that is the number worth showing off.
  centered(
    ctx,
    'BEST SCORE',
    CARD_WIDTH / 2,
    520,
    { size: 34, min: 24, family: UI_FONT, weight: '900', spacingPx: 9, color: DEEP },
    900
  );
  centered(
    ctx,
    data.best.toLocaleString('en-US'),
    CARD_WIDTH / 2,
    790,
    { size: 250, min: 90, family: GAME_FONT, color: INK },
    880
  );

  if (data.isNewBest) chip(ctx, 'NEW RECORD', CARD_WIDTH / 2, 852, GOLD, INK);

  centered(
    ctx,
    data.survived ? `ALL ${data.season} WAVES SURVIVED` : `CAUGHT HOLDING LOOT ON WAVE ${data.wave + 1}`,
    CARD_WIDTH / 2,
    1004,
    { size: 40, min: 22, family: UI_FONT, weight: '900', spacingPx: 4, color: CREAM },
    940
  );

  centered(
    ctx,
    `THIS RUN ${data.score.toLocaleString('en-US')}`,
    CARD_WIDTH / 2,
    1180,
    { size: 50, min: 26, family: GAME_FONT, color: INK },
    900
  );
  centered(
    ctx,
    `${data.tide.toUpperCase()} TIDE · WAVE ${Math.min(data.wave, data.season)} OF ${data.season}`,
    CARD_WIDTH / 2,
    1238,
    { size: 32, min: 20, family: UI_FONT, weight: '900', spacingPx: 5, color: DEEP },
    900
  );
  centered(
    ctx,
    data.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toUpperCase(),
    CARD_WIDTH / 2,
    1296,
    { size: 28, min: 18, family: UI_FONT, weight: '900', spacingPx: 5, color: QUIET },
    900
  );

  // Ink frame, drawn last so it sits over every edge.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(26, 26, CARD_WIDTH - 52, CARD_HEIGHT - 52, 54);
  else ctx.rect(26, 26, CARD_WIDTH - 52, CARD_HEIGHT - 52);
  ctx.stroke();
}

export async function renderShareCard(canvas: HTMLCanvasElement, data: ShareCardData): Promise<void> {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('the share card needs a 2d canvas');
  await readyFonts();
  const badge = await mark();
  drawCard(ctx, data, badge);
}

export async function buildShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderShareCard(canvas, data);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the share card could not be encoded as a PNG');
  return blob;
}

export const SHARE_CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT };
