/**
 * Apple App Store Connect API — Sales & Finance Reports
 * Fetches monthly subscription proceeds and unit counts for admin revenue dashboard.
 */
const { logger } = require('firebase-functions');
const jwt = require('jsonwebtoken');
const https = require('https');
const zlib = require('zlib');

const ASC_API_BASE = 'https://api.appstoreconnect.apple.com';

function hasAscCredentials() {
  return !!(
    process.env.APPLE_ASC_KEY_ID &&
    process.env.APPLE_ASC_ISSUER_ID &&
    process.env.APPLE_ASC_PRIVATE_KEY
  );
}

function generateAscJwt() {
  const raw = process.env.APPLE_ASC_PRIVATE_KEY || '';
  const privateKey = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;

  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '20m',
    audience: 'appstoreconnect-v1',
    issuer: process.env.APPLE_ASC_ISSUER_ID,
    keyid: process.env.APPLE_ASC_KEY_ID,
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

async function fetchSalesReport(reportDate) {
  if (!hasAscCredentials()) {
    return { ok: false, reason: 'apple_asc_not_configured' };
  }

  const token = generateAscJwt();
  const params = new URLSearchParams({
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[frequency]': 'MONTHLY',
    'filter[reportDate]': reportDate,
    'filter[vendorNumber]': process.env.APPLE_VENDOR_NUMBER || '',
  });

  const url = `${ASC_API_BASE}/v1/salesReports?${params.toString()}`;
  const res = await httpsGet(url, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/a-gzip',
  });

  if (res.status === 404 || res.status === 204) {
    return { ok: true, rows: [], reportDate };
  }

  if (res.status !== 200) {
    const body = res.body.toString();
    return { ok: false, reason: `HTTP ${res.status}: ${body.substring(0, 200)}` };
  }

  const decompressed = await new Promise((resolve, reject) => {
    zlib.gunzip(res.body, (err, buf) => (err ? reject(err) : resolve(buf.toString('utf8'))));
  });

  const lines = decompressed.split('\n').filter(Boolean);
  if (lines.length < 2) return { ok: true, rows: [], reportDate };

  const headers = lines[0].split('\t');
  const rows = lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (cells[i] || '').trim(); });
    return row;
  });

  return { ok: true, rows, reportDate };
}

function parseSalesRows(rows) {
  let proceeds = 0;
  let units = 0;
  const byProduct = {};

  for (const row of rows) {
    const type = row['Product Type Identifier'] || '';
    // Auto-renewable subscriptions: type codes start with 1 (e.g. 1, 1E, 1F, 1T)
    if (!type.startsWith('1')) continue;

    const rowUnits = parseInt(row['Units'] || '0', 10) || 0;
    const rowProceeds = parseFloat(row['Developer Proceeds'] || '0') || 0;
    const productId = row['Apple Identifier'] || row['Subscription Group Identifier'] || row['Product Identifier'] || 'unknown';
    const title = row['Title'] || productId;

    units += rowUnits;
    proceeds += rowProceeds * rowUnits;

    if (!byProduct[productId]) byProduct[productId] = { title, units: 0, proceeds: 0 };
    byProduct[productId].units += rowUnits;
    byProduct[productId].proceeds += rowProceeds * rowUnits;
  }

  return {
    proceeds: Math.round(proceeds * 100) / 100,
    units,
    byProduct,
  };
}

/**
 * Fetch the last 3 months of Apple subscription sales.
 * Returns proceeds (net, after Apple's 15-30% cut), units sold, and a per-product breakdown.
 */
async function getAppleRevenueSummary() {
  if (!hasAscCredentials()) {
    return { ok: false, reason: 'apple_asc_not_configured', months: [] };
  }

  const months = [];
  const now = new Date();

  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const reportDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(reportDate);
  }

  const results = await Promise.allSettled(months.map((m) => fetchSalesReport(m)));

  const monthData = results.map((r, i) => {
    if (r.status === 'rejected' || !r.value?.ok) {
      return { reportDate: months[i], ok: false, reason: r.reason?.message || r.value?.reason, proceeds: 0, units: 0 };
    }
    const parsed = parseSalesRows(r.value.rows);
    return { reportDate: months[i], ok: true, ...parsed };
  });

  const latestOk = monthData.find((m) => m.ok && m.proceeds > 0) || monthData[0];

  return {
    ok: true,
    currentMonthProceeds: latestOk?.proceeds || 0,
    currentMonthUnits: latestOk?.units || 0,
    currentReportDate: latestOk?.reportDate || months[0],
    byProduct: latestOk?.byProduct || {},
    months: monthData,
  };
}

module.exports = { getAppleRevenueSummary, hasAscCredentials };
