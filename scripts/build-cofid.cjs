#!/usr/bin/env node
/**
 * Converts the CoFID Excel workbook into a trimmed JSON dataset for offline use.
 * Source (OGL v3.0): https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
 * Download the workbook to scripts/cofid-source.xlsx (git-ignored) first.
 * Usage: node scripts/build-cofid.cjs   (or `npm run build:cofid`)
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'cofid-source.xlsx');
const OUT = path.join(__dirname, '..', 'src', 'data', 'cofid.json');

if (!fs.existsSync(SRC)) {
  console.error('✗ scripts/cofid-source.xlsx not found. Download the CoFID workbook first.');
  process.exit(1);
}

const wb = XLSX.readFile(SRC);
// The proximates sheet holds kcal/protein/carb/fat.
const sheetName = wb.SheetNames.find((n) => /proximate/i.test(n)) || wb.SheetNames[1];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

// Locate the header row (the one containing "Food Name").
const headerIdx = rows.findIndex((r) => r.some((c) => /food name/i.test(String(c))));
const header = rows[headerIdx].map((c) => String(c || '').toLowerCase());
const col = (re) => header.findIndex((h) => re.test(h));

const iName = col(/food name/);
const iKcal = col(/energy.*kcal|kcal/);
const iProt = col(/protein/);
const iCarb = col(/carbohydrate/);
const iFat = col(/^fat|fat \(g\)|fat$/);

const num = (v) => {
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
};

const out = [];
for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  const name = r[iName] && String(r[iName]).trim();
  if (!name) continue;
  out.push({
    name,
    kcalPer100g: num(r[iKcal]),
    proteinPer100g: num(r[iProt]),
    carbsPer100g: num(r[iCarb]),
    fatPer100g: num(r[iFat]),
    category: '',
  });
}

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`✓ wrote ${out.length} foods to ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
