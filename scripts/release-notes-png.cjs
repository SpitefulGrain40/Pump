// Renders the release-notes card to a PNG using node-canvas (no browser needed).
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const W = 1080, H = 1350;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const GREEN = '#34d27b';
const MUTED = '#aab0b6';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

// --- background gradient ---
const bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#0f2417');
bg.addColorStop(0.5, '#070707');
bg.addColorStop(1, '#000000');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const PAD = 64;

// --- brand ---
ctx.fillStyle = GREEN;
roundRect(PAD, 70, 60, 60, 16);
ctx.fill();
ctx.fillStyle = '#06140c';
ctx.font = 'bold 30px Arial';
ctx.textBaseline = 'middle';
ctx.textAlign = 'center';
ctx.fillText('P', PAD + 30, 102);

ctx.textAlign = 'left';
ctx.fillStyle = '#f5f5f5';
ctx.font = 'bold 42px Arial';
ctx.fillText('Pump', PAD + 80, 102);

// --- kicker ---
ctx.fillStyle = GREEN;
ctx.font = 'bold 22px Arial';
ctx.textBaseline = 'alphabetic';
ctx.fillText("W H A T ' S   N E W", PAD, 210);

// --- title ---
ctx.font = 'bold 66px Arial';
ctx.fillStyle = '#ffffff';
ctx.fillText('Set your ', PAD, 290);
const w1 = ctx.measureText('Set your ').width;
ctx.fillStyle = GREEN;
ctx.fillText('goal.', PAD + w1, 290);
ctx.fillStyle = '#ffffff';
ctx.fillText('The app adapts.', PAD, 360);

// --- subtitle ---
ctx.fillStyle = MUTED;
ctx.font = '25px Arial';
let sy = 410;
for (const ln of wrap("A big update — your dashboard and AI coach now revolve around what you're training for.", W - PAD * 2)) {
  ctx.fillText(ln, PAD, sy);
  sy += 34;
}

// --- feature cards ---
const items = [
  ['Pick your goal', 'Cut, Recomp, Bulk or Maintain — and the metric you care about: weight, body fat, waist, lean mass or strength.'],
  ['Track measurements', 'Log waist & body fat to unlock body-fat %, waist and lean-mass trends over time.'],
  ['Smarter Coach', 'Coach now tailors its nutrition advice to your goal — deficit, surplus or protein focus.'],
  ['Workout fixes', "Today's workout shows correctly again, hold-to-finish stops accidental taps, and chat search is easier to scroll."],
];

let y = 500;
const cardW = W - PAD * 2;
for (const [title, desc] of items) {
  ctx.font = '23px Arial';
  const descLines = wrap(desc, cardW - 56 - 30);
  const cardH = 44 + descLines.length * 32 + 28;

  ctx.fillStyle = CARD_BG;
  roundRect(PAD, y, cardW, cardH, 22);
  ctx.fill();
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  roundRect(PAD, y, cardW, cardH, 22);
  ctx.stroke();

  // accent bar
  ctx.fillStyle = GREEN;
  roundRect(PAD + 24, y + 26, 8, cardH - 52, 4);
  ctx.fill();

  const tx = PAD + 56;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(title, tx, y + 52);

  ctx.fillStyle = '#b8bdc2';
  ctx.font = '23px Arial';
  let dy = y + 52 + 36;
  for (const ln of descLines) {
    ctx.fillText(ln, tx, dy);
    dy += 32;
  }

  y += cardH + 24;
}

// --- footer ---
ctx.fillStyle = '#6b7177';
ctx.font = '22px Arial';
ctx.fillText('Reload the app to update', PAD, H - 60);

const pillText = 'June 2026';
ctx.font = 'bold 22px Arial';
const pw = ctx.measureText(pillText).width + 36;
ctx.fillStyle = 'rgba(52,210,123,0.16)';
roundRect(W - PAD - pw, H - 88, pw, 44, 22);
ctx.fill();
ctx.fillStyle = GREEN;
ctx.fillText(pillText, W - PAD - pw + 18, H - 60);

const out = path.join('C:\\Users\\mikes', 'pump-release-notes.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('Wrote ' + out);
