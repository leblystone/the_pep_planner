/**
 * Etsy order ingestion — webhook + API backfill into physicalOrders.
 * Creates admin-visible orders (with createdAt) and applies stock once per receipt.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
require('dotenv').config();

const { getMarketplaceTokens, refreshTokenIfNeeded } = require('./marketplaceTokens');
const { etsyFetch, fetchEtsyShopId } = require('./marketplaces');
const { allocateShopOrderNumber } = require('./shopOrderNumbers');
const { activityEntry } = require('./orderActivity');

const ADMIN_EMAILS = [
  'lebrockmaldonado@gmail.com',
  'contact@thepepplanner.com',
  'thepepplanner@gmail.com',
];

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const email = (request.auth.token.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) throw new HttpsError('permission-denied', 'Admin access required');
  return email;
}

function etsyMoneyToCents(money) {
  if (!money || money.amount == null) return 0;
  const divisor = Number(money.divisor) || 100;
  return Math.round((Number(money.amount) / divisor) * 100);
}

function mapEtsyStatus(receipt) {
  const status = String(receipt.status || '').toLowerCase();
  if (status.includes('cancel')) return 'cancelled';
  if (receipt.is_shipped) return 'shipped';
  return 'pending';
}

function buildShippingAddress(receipt) {
  if (!receipt?.first_line && !receipt?.city) return null;
  return {
    line1: receipt.first_line || '',
    line2: receipt.second_line || '',
    city: receipt.city || '',
    state: receipt.state || '',
    postal_code: receipt.zip || '',
    country: receipt.country_iso || '',
  };
}

function canonicalEtsyOrderId(receiptId) {
  return `etsy_${receiptId}`;
}

async function findExistingEtsyOrder(db, receiptId) {
  const canonicalId = canonicalEtsyOrderId(receiptId);
  const canonicalRef = db.collection('physicalOrders').doc(canonicalId);
  const canonical = await canonicalRef.get();
  if (canonical.exists) {
    return { ref: canonicalRef, data: canonical.data(), id: canonicalId, isCanonical: true };
  }

  for (const field of ['externalOrderId', 'etsyReceiptId']) {
    const snap = await db.collection('physicalOrders')
      .where(field, '==', String(receiptId))
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return { ref: doc.ref, data: doc.data(), id: doc.id, isCanonical: false };
    }
  }

  return { ref: canonicalRef, data: null, id: canonicalId, isCanonical: true };
}

async function lookupProductByEtsyListing(db, listingId) {
  if (!listingId) return null;
  const snap = await db.collection('shopProducts')
    .where('platformIds.etsy', '==', String(listingId))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  return { productId: doc.id, name: data.name, price: data.price || 0 };
}

async function buildOrderItems(db, transactions) {
  const items = [];
  for (const txn of transactions || []) {
    const listingId = txn.listing_id != null ? String(txn.listing_id) : '';
    const qty = Number(txn.quantity) || 1;
    const product = listingId ? await lookupProductByEtsyListing(db, listingId) : null;
    const unitCents = etsyMoneyToCents(txn.price) || Math.round((product?.price || 0) * 100);
    items.push({
      productId: product?.productId || null,
      name: txn.title || product?.name || (listingId ? `Etsy listing ${listingId}` : 'Etsy item'),
      quantity: qty,
      amountTotal: unitCents * qty,
      etsyListingId: listingId || null,
      etsyTransactionId: txn.transaction_id != null ? String(txn.transaction_id) : null,
      sku: txn.sku || null,
    });
  }
  return items;
}

async function enrichEtsyReceipt(receipt, receiptId) {
  if (receipt?.name && receipt?.grandtotal) return receipt;

  const tokens = await getMarketplaceTokens();
  const token = await refreshTokenIfNeeded('etsy') || tokens.etsy;
  if (!token?.accessToken || !receiptId) return receipt;

  try {
    const shopId = token.shopId || await fetchEtsyShopId(token);
    return await etsyFetch(`/application/shops/${shopId}/receipts/${receiptId}`, token);
  } catch (err) {
    logger.warn(`Could not enrich Etsy receipt ${receiptId}:`, err.message);
    return receipt;
  }
}

/**
 * Upsert a physicalOrders doc for an Etsy receipt and optionally decrement stock (once).
 */
async function processEtsyReceipt(db, {
  receipt,
  transactions,
  webhookPayload = null,
  triggeredBy = 'etsy-webhook',
  applyStock = true,
}) {
  const receiptId = String(receipt.receipt_id || receipt.id || '');
  if (!receiptId) throw new Error('Etsy receipt missing receipt_id');

  const fullReceipt = await enrichEtsyReceipt(receipt, receiptId);

  const existing = await findExistingEtsyOrder(db, receiptId);
  const legacyStockApplied = Array.isArray(existing.data?.results)
    && existing.data.results.some((r) => r.status === 'decremented');
  const stockAlreadyApplied = existing.data?.stockApplied === true || legacyStockApplied;
  const isNew = !existing.data;

  const items = await buildOrderItems(db, transactions);
  const amountTotal = etsyMoneyToCents(fullReceipt.grandtotal)
    || items.reduce((sum, item) => sum + (item.amountTotal || 0), 0);

  let shopOrderNumber = existing.data?.shopOrderNumber;
  if (!shopOrderNumber) {
    shopOrderNumber = await allocateShopOrderNumber(db);
  }

  const createdTs = fullReceipt.create_timestamp ?? fullReceipt.creation_tsz ?? fullReceipt.created_timestamp;
  const createdAt = createdTs
    ? admin.firestore.Timestamp.fromMillis(Number(createdTs) * 1000)
    : (existing.data?.createdAt || admin.firestore.FieldValue.serverTimestamp());

  const orderPatch = {
    source: 'etsy',
    etsyReceiptId: receiptId,
    externalOrderId: receiptId,
    shopOrderNumber,
    status: mapEtsyStatus(fullReceipt),
    customerName: fullReceipt.name || existing.data?.customerName || 'Etsy Customer',
    customerEmail: fullReceipt.buyer_email || existing.data?.customerEmail || null,
    shippingName: fullReceipt.name || existing.data?.shippingName || null,
    shippingAddress: buildShippingAddress(fullReceipt) || existing.data?.shippingAddress || null,
    items,
    amountTotal,
    amountSubtotal: etsyMoneyToCents(fullReceipt.subtotal) || null,
    amountShipping: etsyMoneyToCents(fullReceipt.total_shipping_cost) || null,
    amountTax: etsyMoneyToCents(fullReceipt.total_tax_cost) || null,
    currency: String(fullReceipt.grandtotal?.currency_code || fullReceipt.currency_code || 'USD').toLowerCase(),
    paymentMethod: 'Etsy',
    wasPaid: fullReceipt.was_paid !== false,
    createdAt: existing.data?.createdAt || createdAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    paidAt: fullReceipt.was_paid !== false
      ? (existing.data?.paidAt || (typeof createdAt === 'object' ? createdAt : admin.firestore.FieldValue.serverTimestamp()))
      : null,
    etsyShopId: fullReceipt.shop_id != null ? String(fullReceipt.shop_id) : (existing.data?.etsyShopId || null),
    lastIngestedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastIngestedBy: triggeredBy,
    ...(webhookPayload ? { etsyWebhookPayload: webhookPayload } : {}),
  };

  const stockResults = [];
  const shouldApplyStock = applyStock && !stockAlreadyApplied && mapEtsyStatus(fullReceipt) !== 'cancelled';

  if (shouldApplyStock) {
    const { decrementStock, syncStockToAllPlatforms } = require('./inventorySync');
    for (const item of items) {
      if (!item.productId) {
        stockResults.push({ etsyListingId: item.etsyListingId, status: 'not_linked' });
        continue;
      }
      try {
        const newStock = await decrementStock(item.productId, item.quantity);
        await syncStockToAllPlatforms(item.productId);
        stockResults.push({
          productId: item.productId,
          etsyListingId: item.etsyListingId,
          newStock,
          status: 'decremented',
        });
      } catch (err) {
        stockResults.push({
          productId: item.productId,
          etsyListingId: item.etsyListingId,
          status: 'error',
          error: err.message,
        });
      }
    }
    orderPatch.stockApplied = true;
    orderPatch.stockResults = stockResults;
  } else if (stockAlreadyApplied) {
    orderPatch.stockApplied = true;
    if (existing.data?.stockResults) orderPatch.stockResults = existing.data.stockResults;
  }

  const canonicalRef = db.collection('physicalOrders').doc(canonicalEtsyOrderId(receiptId));

  if (isNew) {
    orderPatch.activityLog = [
      activityEntry({
        type: 'order_created',
        title: 'Etsy order received',
        detail: triggeredBy === 'etsy-webhook' ? 'Etsy webhook' : `Etsy import (${triggeredBy})`,
        actor: 'system',
      }),
    ];
    if (shouldApplyStock && stockResults.some((r) => r.status === 'decremented')) {
      orderPatch.activityLog.push(activityEntry({
        type: 'stock_updated',
        title: 'Stock decremented',
        detail: `${stockResults.filter((r) => r.status === 'decremented').length} catalog product(s)`,
        actor: 'system',
      }));
    }
  }

  await canonicalRef.set(orderPatch, { merge: true });

  if (!existing.isCanonical && existing.data && existing.ref.path !== canonicalRef.path) {
    try {
      await existing.ref.delete();
      logger.info(`Migrated legacy Etsy order stub ${existing.id} → ${canonicalRef.id}`);
    } catch (err) {
      logger.warn(`Could not delete legacy Etsy order stub ${existing.id}:`, err.message);
    }
  }

  return {
    orderId: canonicalRef.id,
    receiptId,
    isNew,
    stockApplied: shouldApplyStock,
    stockResults,
    skippedStock: stockAlreadyApplied,
  };
}

async function syncEtsyOrdersFromApi(db, { daysBack = 90, triggeredBy = 'admin', applyStock = true } = {}) {
  const tokens = await getMarketplaceTokens();
  const token = await refreshTokenIfNeeded('etsy') || tokens.etsy;
  if (!token?.accessToken) {
    throw new Error('Etsy not connected — connect in Admin → Products → Marketplaces');
  }

  const shopId = token.shopId || await fetchEtsyShopId(token);
  if (!shopId) throw new Error('No Etsy shop found on connected account');

  const minCreated = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
  let offset = 0;
  const allReceipts = [];

  while (true) {
    const params = new URLSearchParams({
      limit: '100',
      offset: String(offset),
      min_created: String(minCreated),
    });
    const data = await etsyFetch(`/application/shops/${shopId}/receipts?${params.toString()}`, token);
    const batch = data.results || [];
    allReceipts.push(...batch);
    if (batch.length < 100) break;
    offset += batch.length;
    if (offset >= 500) break;
  }

  const summary = {
    scanned: allReceipts.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    stockApplied: 0,
    errors: [],
  };

  for (const receipt of allReceipts) {
    try {
      let transactions = receipt.transactions;
      if (!Array.isArray(transactions) || !transactions.length) {
        transactions = await fetchEtsyReceiptTransactions(token, shopId, receipt.receipt_id);
      }
      if (!transactions.length) {
        summary.skipped++;
        continue;
      }

      const result = await processEtsyReceipt(db, {
        receipt,
        transactions,
        triggeredBy,
        applyStock,
      });

      if (result.isNew) summary.imported++;
      else if (result.stockApplied) {
        summary.updated++;
        summary.stockApplied++;
      } else summary.skipped++;
    } catch (err) {
      logger.error(`Etsy import failed for receipt ${receipt.receipt_id}:`, err);
      summary.errors.push({ receiptId: String(receipt.receipt_id), error: err.message });
    }
  }

  await db.doc('_config/etsyOrderSyncHistory').set(
    {
      lastSync: {
        ...summary,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        triggeredBy,
        daysBack,
      },
    },
    { merge: true },
  );

  return summary;
}

async function fetchEtsyReceiptTransactions(token, shopId, receiptId) {
  const data = await etsyFetch(
    `/application/shops/${shopId}/receipts/${receiptId}/transactions`,
    token,
  );
  return data.results || [];
}

exports.processEtsyReceipt = processEtsyReceipt;
exports.syncEtsyOrdersFromApi = syncEtsyOrdersFromApi;

exports.syncEtsyOrders = onCall({ cors: true }, async (request) => {
  requireAdmin(request);
  const daysBack = Math.min(Math.max(Number(request.data?.daysBack) || 90, 1), 365);
  const applyStock = request.data?.applyStock !== false;

  try {
    const summary = await syncEtsyOrdersFromApi(admin.firestore(), {
      daysBack,
      triggeredBy: request.auth.token.email || 'admin',
      applyStock,
    });
    return { ok: true, ...summary };
  } catch (err) {
    logger.error('syncEtsyOrders failed:', err);
    throw new HttpsError('internal', err.message || 'Etsy order sync failed');
  }
});

/** Poll Etsy every 30 minutes for orders missed by webhooks. */
exports.scheduledEtsyOrderSync = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'America/New_York' },
  async () => {
    try {
      const tokens = await getMarketplaceTokens();
      if (!tokens.etsy?.accessToken) {
        logger.info('scheduledEtsyOrderSync: Etsy not connected, skipping');
        return;
      }
      const summary = await syncEtsyOrdersFromApi(admin.firestore(), {
        daysBack: 14,
        triggeredBy: 'scheduled',
        applyStock: true,
      });
      logger.info('scheduledEtsyOrderSync complete', summary);
    } catch (err) {
      logger.error('scheduledEtsyOrderSync error:', err);
    }
  },
);
