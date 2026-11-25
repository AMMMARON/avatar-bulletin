// Draw locally so the off-air slate also works before providers are connected.
const paths = {
  desk: 'M3 3H10V10H3ZM14 3H21V10H14ZM3 14H10V21H3ZM14 14H21V21H14Z',
  search: 'M16 16L21 21 M18 10.5A7.5 7.5 0 1 1 3 10.5A7.5 7.5 0 1 1 18 10.5',
  select: 'M9 4H5V21H19V4H15 M9 2H15V6H9Z M8.5 13L11 15.5L16 10',
  edit: 'M4 20L9 19L20 8L16 4L5 15Z M14 6L18 10 M12 21H21',
  sliders: 'M4 6H10 M14 6H20 M4 12H14 M18 12H20 M4 18H6 M10 18H20 M10 3V9 M15 9V15 M8 15V21',
  mic: 'M9 5Q9 2 12 2Q15 2 15 5V11Q15 14 12 14Q9 14 9 11Z M5 10V11A7 7 0 0 0 19 11V10 M12 18V22 M8 22H16',
  plug: 'M8 3V8 M16 3V8 M5 8H19V11A7 7 0 0 1 5 11Z M12 18V21H9',
  screen: 'M3 4H21V17H3Z M12 17V21 M8 21H16',
  clip: 'M7 3H17L20 6V21H4V3Z M8 9H16 M8 13H16 M8 17H13',
  layers: 'M2 7L12 2L22 7L12 12Z M3 12L12 17L21 12 M3 17L12 22L21 17',
  clock: 'M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12 M12 6V12L16 14',
  list: 'M8 6H21 M8 12H21 M8 18H21 M3 6H4 M3 12H4 M3 18H4',
  radio:
    'M4.5 5A10 10 0 0 0 4.5 19 M8 8A6 6 0 0 0 8 16 M19.5 5A10 10 0 0 1 19.5 19 M16 8A6 6 0 0 1 16 16 M13 12A1 1 0 1 1 11 12A1 1 0 1 1 13 12',
  user: 'M16 8A4 4 0 1 1 8 8A4 4 0 1 1 16 8 M4 21V19Q4 14 12 14Q20 14 20 19V21',
  lock: 'M5 10H19V21H5Z M8 10V7A4 4 0 1 1 16 7V10 M12 14V17',
  login: 'M14 3H20V21H14 M3 12H15 M10 7L15 12L10 17',
  menu: 'M3 5H21 M3 12H21 M3 19H21',
  close: 'M5 5L19 19 M19 5L5 19',
  plus: 'M12 4V20 M4 12H20',
  play: 'M7 3L20 12L7 21Z',
  stop: 'M5 5H19V19H5Z',
  up: 'M5 15L12 8L19 15',
  down: 'M5 9L12 16L19 9',
  globe: 'M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12 M3 12H21 M12 3Q5 12 12 21Q19 12 12 3',
  waveform: 'M3 10V14 M7 6V18 M12 2V22 M17 7V17 M21 10V14',
};
export const ic = (name) => '<canvas aria-hidden="true" class="icon" data-icon="' + name + '"></canvas>';
export function drawIcons(scope = document) {
  for (const canvas of scope.querySelectorAll('canvas[data-icon]')) {
    const path = paths[canvas.dataset.icon];
    if (!path) continue;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    canvas.width = 48;
    canvas.height = 48;
    ctx.scale(2, 2);
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.lineWidth = 1.65;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D(path));
  }
}
const continents = [
  [
    [-168, 66],
    [-140, 70],
    [-122, 68],
    [-114, 72],
    [-90, 70],
    [-82, 64],
    [-72, 60],
    [-65, 58],
    [-54, 51],
    [-67, 44],
    [-76, 40],
    [-80, 29],
    [-82, 26],
    [-90, 29],
    [-97, 26],
    [-93, 20],
    [-86, 17],
    [-83, 10],
    [-79, 9],
    [-84, 8],
    [-90, 14],
    [-96, 17],
    [-105, 20],
    [-115, 29],
    [-123, 40],
    [-125, 49],
    [-130, 56],
    [-142, 59],
    [-151, 56],
    [-160, 58],
  ],
  [
    [-81, 12],
    [-70, 12],
    [-64, 10],
    [-59, 8],
    [-51, 4],
    [-49, -1],
    [-36, -5],
    [-35, -9],
    [-40, -20],
    [-48, -27],
    [-53, -34],
    [-60, -40],
    [-67, -55],
    [-72, -51],
    [-75, -40],
    [-72, -29],
    [-74, -16],
    [-81, -3],
  ],
  [
    [-73, 60],
    [-49, 60],
    [-29, 70],
    [-20, 80],
    [-42, 83],
    [-64, 78],
  ],
  [
    [-10, 36],
    [-9, 43],
    [-3, 44],
    [-5, 48],
    [1, 51],
    [6, 53],
    [10, 55],
    [7, 58],
    [6, 62],
    [14, 68],
    [27, 71],
    [32, 68],
    [25, 60],
    [30, 59],
    [39, 67],
    [59, 70],
    [78, 72],
    [95, 77],
    [114, 73],
    [128, 72],
    [143, 69],
    [159, 69],
    [175, 64],
    [168, 60],
    [157, 57],
    [160, 51],
    [151, 47],
    [139, 46],
    [133, 42],
    [129, 35],
    [122, 39],
    [119, 33],
    [121, 29],
    [116, 23],
    [108, 21],
    [109, 16],
    [104, 9],
    [100, 15],
    [97, 17],
    [93, 22],
    [88, 21],
    [83, 18],
    [78, 8],
    [75, 11],
    [70, 22],
    [64, 25],
    [60, 25],
    [57, 24],
    [56, 19],
    [50, 15],
    [44, 12],
    [41, 16],
    [37, 22],
    [34, 29],
    [32, 31],
    [35, 35],
    [29, 36],
    [25, 40],
    [22, 38],
    [19, 41],
    [15, 45],
    [13, 42],
    [16, 38],
    [12, 40],
    [9, 44],
    [5, 44],
    [2, 42],
    [-2, 37],
  ],
  [
    [-17, 15],
    [-17, 21],
    [-12, 26],
    [-10, 31],
    [-6, 36],
    [4, 37],
    [10, 37],
    [12, 33],
    [18, 31],
    [23, 33],
    [32, 31],
    [34, 25],
    [38, 18],
    [43, 12],
    [51, 12],
    [49, 5],
    [44, -1],
    [41, -4],
    [41, -13],
    [36, -20],
    [36, -25],
    [30, -30],
    [26, -34],
    [18, -35],
    [15, -28],
    [12, -17],
    [13, -9],
    [9, -4],
    [9, 3],
    [4, 5],
    [-2, 5],
    [-8, 5],
    [-13, 9],
  ],
  [
    [113, -23],
    [114, -18],
    [123, -14],
    [131, -12],
    [136, -14],
    [142, -11],
    [147, -18],
    [153, -28],
    [150, -36],
    [141, -39],
    [135, -35],
    [128, -32],
    [117, -35],
  ],
  [
    [44, -13],
    [50, -12],
    [49, -21],
    [45, -26],
    [43, -23],
  ],
  [
    [-8, 50],
    [-4, 50],
    [1, 52],
    [-2, 55],
    [-3, 59],
    [-6, 58],
    [-5, 54],
  ],
  [
    [129, 32],
    [135, 34],
    [140, 37],
    [143, 43],
    [146, 44],
    [144, 39],
    [138, 34],
  ],
];
function inside(x, y, poly) {
  let v = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [c, d] = poly[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) v = !v;
  }
  return v;
}
const land = [];
for (let lat = -57; lat < 84; lat += 2.2) {
  const inc = 2.2 / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
  for (let lon = -179; lon < 180; lon += inc)
    if (continents.some((poly) => inside(lon, lat, poly))) land.push([lon, lat]);
}
export function drawSignal(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (w < 1 || h < 1) return;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * d;
  canvas.height = h * d;
  ctx.scale(d, d);
  const r = Math.min(w * 0.3, h * 0.66),
    cx = w * 0.27,
    cy = h * 0.61,
    rad = Math.PI / 180,
    tilt = 18 * rad;
  const project = (lon, lat) => {
    const a = (lon - 36) * rad,
      b = lat * rad,
      cb = Math.cos(b),
      z = cb * Math.cos(a),
      y = Math.sin(b);
    return [
      cx + r * cb * Math.sin(a),
      cy - r * (y * Math.cos(tilt) - z * Math.sin(tilt)),
      y * Math.sin(tilt) + z * Math.cos(tilt),
    ];
  };
  ctx.fillStyle = '#1b201d';
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.25, 0, cx, cy, r * 1.6);
  glow.addColorStop(0, '#784027');
  glow.addColorStop(0.55, '#392d22');
  glow.addColorStop(1, '#1b201d');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(190,161,114,.08)';
  ctx.lineWidth = 0.7;
  const step = Math.max(18, w / 22);
  for (let x = step / 3; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = step / 3; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const surface = ctx.createRadialGradient(cx - r * 0.43, cy - r * 0.45, r * 0.05, cx, cy, r);
  surface.addColorStop(0, '#935236');
  surface.addColorStop(0.66, '#5a392a');
  surface.addColorStop(1, '#32291f');
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#bd7952';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  function curve(nodes) {
    ctx.beginPath();
    let active = false;
    for (const [lon, lat] of nodes) {
      const [x, y, z] = project(lon, lat);
      if (z < 0) {
        active = false;
        continue;
      }
      if (active) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      active = true;
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(232,159,112,.31)';
  ctx.lineWidth = 0.65;
  for (let lat = -75; lat <= 75; lat += 15) {
    const line = [];
    for (let lon = -180; lon <= 180; lon += 3) line.push([lon, lat]);
    curve(line);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const line = [];
    for (let lat = -90; lat <= 90; lat += 3) line.push([lon, lat]);
    curve(line);
  }
  for (const [lon, lat] of land) {
    const [x, y, z] = project(lon, lat);
    if (z <= 0) continue;
    ctx.fillStyle = 'rgba(255,165,105,' + (0.35 + 0.52 * z) + ')';
    const dot = Math.max(0.65, r * 0.0058);
    ctx.beginPath();
    ctx.arc(x, y, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.34);
  ctx.strokeStyle = 'rgba(246,138,78,.52)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.31, r * 0.39, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const [sx, sy] = project(46.7, 24.7);
  ctx.fillStyle = '#ffd3a4';
  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,187,132,.82)';
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.stroke();
}
const observer = new ResizeObserver((entries) => {
  for (const { target } of entries) drawSignal(target);
});
let observed = [];
export function paint(scope = document) {
  drawIcons(scope);
  for (const c of observed) observer.unobserve(c);
  observed = Array.from(scope.querySelectorAll('.signal-art'));
  for (const c of observed) {
    drawSignal(c);
    observer.observe(c);
  }
}
