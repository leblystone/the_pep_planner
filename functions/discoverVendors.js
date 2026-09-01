/**
 * Community Discover vendors — single callable to avoid Cloud Run CPU quota blowups.
 * Client: httpsCallable(functions, 'discoverApi')({ action, ... })
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { ensureAdmin } = require('./adminAuth');
const { verifyRecaptchaWithEnforcement } = require('./recaptcha');

const VALID_TYPES = new Set(['domestic', 'international', 'groupbuy', 'supplies']);
const VALID_TAGS = new Set([
  'reliable', 'vetted', 'fast_shipping', 'overfill', 'glp1', 'aminos', 'oils', 'pricey',
  'reshipper', 'slow_shipping', 'bad_test', 'bad_packaging', 'broken_vials', 'rude_reps',
  'out_of_service', 'puck_problem',
]);
const VALID_PAYMENTS = new Set([
  'card', 'zelle', 'crypto', 'paypal', 'wire', 'venmo', 'cashapp', 'alipay',
]);

const DAILY_SUBMIT_LIMIT = 5;
const TOKEN_TTL_MS = 60 * 60 * 1000;

function db() {
  return admin.firestore();
}

function emptyTagCounts() {
  return Object.fromEntries([...VALID_TAGS].map((id) => [id, 0]));
}

function emptyPaymentCounts() {
  return Object.fromEntries([...VALID_PAYMENTS].map((id) => [id, 0]));
}

function normalizeWebsite(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(website) {
  try {
    return new URL(website).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

async function resolveLogo(domain) {
  const fallback = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
    : '';
  if (!domain) return { logoUrl: '', logoFallback: fallback };

  const clearbit = `https://logo.clearbit.com/${domain}`;
  try {
    const res = await fetch(clearbit, { method: 'GET', redirect: 'follow' });
    if (res.ok) return { logoUrl: clearbit, logoFallback: fallback };
  } catch (err) {
    logger.warn('Clearbit logo fetch failed', { domain, error: err.message });
  }
  return { logoUrl: fallback, logoFallback: fallback };
}

async function pingDomain(website) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(website, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });
      if (res.status < 400) return false;
    } catch {
      /* try GET below */
    } finally {
      clearTimeout(timer);
    }

    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 6000);
    try {
      const getRes = await fetch(website, {
        method: 'GET',
        redirect: 'follow',
        signal: controller2.signal,
      });
      return getRes.status >= 400;
    } finally {
      clearTimeout(timer2);
    }
  } catch {
    return true;
  }
}

async function submitVendorSuggestion(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to suggest a source.');
  const uid = request.auth.uid;
  const data = request.data || {};
  const name = String(data.name || '').trim().slice(0, 80);
  const type = String(data.type || 'domestic');
  const website = normalizeWebsite(data.website);
  const recaptchaToken = data.recaptchaToken || null;
  const tagIds = Array.isArray(data.tagIds) ? data.tagIds.filter((t) => VALID_TAGS.has(t)) : [];
  const paymentIds = Array.isArray(data.paymentIds)
    ? data.paymentIds.filter((p) => VALID_PAYMENTS.has(p))
    : [];

  if (!name) throw new HttpsError('invalid-argument', 'Source name is required.');
  if (!VALID_TYPES.has(type)) throw new HttpsError('invalid-argument', 'Invalid category.');
  if (!website) throw new HttpsError('invalid-argument', 'A valid http(s) website URL is required.');

  if (recaptchaToken) {
    const captcha = await verifyRecaptchaWithEnforcement(recaptchaToken, 0.5, 'suggest_vendor');
    if (!captcha.success) {
      throw new HttpsError('permission-denied', 'Security check failed. Please try again.');
    }
  }

  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const recentSnap = await db()
    .collection('community_vendors')
    .where('submittedByUid', '==', uid)
    .limit(30)
    .get();

  const recentCount = recentSnap.docs.filter((d) => {
    const ms = d.data().submittedAt?.toMillis?.() || 0;
    return ms >= sinceMs;
  }).length;

  if (recentCount >= DAILY_SUBMIT_LIMIT) {
    throw new HttpsError(
      'resource-exhausted',
      `Daily limit reached (${DAILY_SUBMIT_LIMIT} suggestions per day). Try again tomorrow.`
    );
  }

  const domain = domainFromUrl(website);
  const [{ logoUrl, logoFallback }, domainUnreachable] = await Promise.all([
    resolveLogo(domain),
    pingDomain(website),
  ]);

  const tags = emptyTagCounts();
  const payments = emptyPaymentCounts();
  tagIds.forEach((id) => { tags[id] = 1; });
  paymentIds.forEach((id) => { payments[id] = 1; });
  const hasVotes = tagIds.length > 0 || paymentIds.length > 0;

  const ref = db().collection('community_vendors').doc();
  await ref.set({
    id: ref.id,
    name,
    type,
    website,
    domain: domain || '',
    logoUrl,
    logoFallback,
    domainUnreachable: !!domainUnreachable,
    tags,
    payments,
    upvotes: 0,
    downvotes: 0,
    lastVoteAt: hasVotes ? admin.firestore.FieldValue.serverTimestamp() : null,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    submittedByUid: uid,
    status: 'pending',
    confirmedByOwner: false,
    discountCode: '',
    discountNote: '',
    claimStatus: 'none',
    claimContact: '',
    claimBusinessName: '',
    claimNote: '',
    claimSubmittedAt: null,
  });

  logger.info('Vendor suggestion submitted', { id: ref.id, uid, domain, domainUnreachable });
  return { success: true, id: ref.id, status: 'pending', domainUnreachable: !!domainUnreachable };
}

async function adminDiscoverAction(request) {
  await ensureAdmin(request);
  const data = request.data || {};
  const action = String(data.moderationAction || data.adminAction || '');
  const vendorId = String(data.vendorId || '');
  if (!vendorId) throw new HttpsError('invalid-argument', 'vendorId is required.');

  const ref = db().collection('community_vendors').doc(vendorId);

  if (action === 'approve') {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Vendor not found.');
    await ref.update({
      status: 'approved',
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: request.auth.uid,
    });
    return { success: true, status: 'approved' };
  }

  if (action === 'reject') {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Vendor not found.');
    await ref.update({
      status: 'rejected',
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: request.auth.uid,
    });
    return { success: true, status: 'rejected' };
  }

  if (action === 'delete') {
    await ref.delete();
    return { success: true, deleted: true };
  }

  if (action === 'updateMeta') {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Vendor not found.');
    const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (typeof data.confirmedByOwner === 'boolean') patch.confirmedByOwner = data.confirmedByOwner;
    if (typeof data.discountCode === 'string') patch.discountCode = data.discountCode.trim().slice(0, 64);
    if (typeof data.discountNote === 'string') patch.discountNote = data.discountNote.trim().slice(0, 200);
    if (typeof data.name === 'string' && data.name.trim()) patch.name = data.name.trim().slice(0, 80);
    if (typeof data.website === 'string') {
      const website = normalizeWebsite(data.website);
      if (website) {
        patch.website = website;
        patch.domain = domainFromUrl(website) || '';
      }
    }
    if (VALID_TYPES.has(data.type)) patch.type = data.type;
    await ref.update(patch);
    return { success: true, updated: true };
  }

  if (action === 'resolveClaim') {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Vendor not found.');
    const decision = data.decision === 'approved' ? 'approved' : 'rejected';
    const patch = {
      claimStatus: decision === 'approved' ? 'approved' : 'none',
      claimResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (decision === 'approved') {
      patch.confirmedByOwner = true;
      if (typeof data.discountCode === 'string') patch.discountCode = data.discountCode.trim().slice(0, 64);
      if (typeof data.discountNote === 'string') patch.discountNote = data.discountNote.trim().slice(0, 200);
    } else {
      patch.claimContact = '';
      patch.claimBusinessName = '';
      patch.claimNote = '';
    }
    await ref.update(patch);
    const claimId = data.claimId ? String(data.claimId) : null;
    if (claimId) {
      await db().collection('community_vendor_claims').doc(claimId).update({
        status: decision,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { success: true, claimStatus: patch.claimStatus };
  }

  throw new HttpsError('invalid-argument', `Unknown moderation action: ${action}`);
}

async function voteOnDiscoverVendor(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const vendorId = String(request.data?.vendorId || '');
  const direction = request.data?.direction;
  if (!vendorId) throw new HttpsError('invalid-argument', 'vendorId required.');
  if (direction !== 'up' && direction !== 'down' && direction !== null) {
    throw new HttpsError('invalid-argument', 'direction must be up, down, or null.');
  }

  const vendorRef = db().collection('community_vendors').doc(vendorId);
  const voteRef = db().collection('community_vendor_votes').doc(`${uid}_${vendorId}`);

  await db().runTransaction(async (tx) => {
    const vendorSnap = await tx.get(vendorRef);
    if (!vendorSnap.exists) throw new HttpsError('not-found', 'Vendor not found.');
    const vendor = vendorSnap.data();
    if (vendor.status !== 'approved' && !vendor.isSeed) {
      throw new HttpsError('failed-precondition', 'Vendor is not available for voting.');
    }

    const voteSnap = await tx.get(voteRef);
    const prev = voteSnap.exists ? voteSnap.data().direction : null;
    let upvotes = vendor.upvotes || 0;
    let downvotes = vendor.downvotes || 0;

    if (prev === 'up') upvotes = Math.max(0, upvotes - 1);
    if (prev === 'down') downvotes = Math.max(0, downvotes - 1);
    if (direction === 'up') upvotes += 1;
    if (direction === 'down') downvotes += 1;

    tx.update(vendorRef, {
      upvotes,
      downvotes,
      lastVoteAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (direction == null) {
      if (voteSnap.exists) tx.delete(voteRef);
    } else {
      tx.set(voteRef, {
        uid,
        vendorId,
        direction,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  return { success: true };
}

async function toggleDiscoverVendorMeta(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const vendorId = String(request.data?.vendorId || '');
  const kind = request.data?.kind;
  const metaId = String(request.data?.metaId || '');
  const selected = !!request.data?.selected;

  if (!vendorId || !metaId) throw new HttpsError('invalid-argument', 'vendorId and metaId required.');
  if (kind === 'tag' && !VALID_TAGS.has(metaId)) throw new HttpsError('invalid-argument', 'Invalid tag.');
  if (kind === 'payment' && !VALID_PAYMENTS.has(metaId)) throw new HttpsError('invalid-argument', 'Invalid payment.');
  if (kind !== 'tag' && kind !== 'payment') throw new HttpsError('invalid-argument', 'kind must be tag or payment.');

  const vendorRef = db().collection('community_vendors').doc(vendorId);
  const metaRef = db().collection('community_vendor_meta_votes').doc(`${uid}_${vendorId}_${kind}_${metaId}`);
  const field = kind === 'tag' ? 'tags' : 'payments';

  await db().runTransaction(async (tx) => {
    const vendorSnap = await tx.get(vendorRef);
    if (!vendorSnap.exists) throw new HttpsError('not-found', 'Vendor not found.');
    const vendor = vendorSnap.data();
    if (vendor.status !== 'approved' && !vendor.isSeed) {
      throw new HttpsError('failed-precondition', 'Vendor is not available.');
    }

    const metaSnap = await tx.get(metaRef);
    const wasSelected = metaSnap.exists ? !!metaSnap.data().selected : false;
    if (wasSelected === selected) return;

    const bag = { ...(vendor[field] || {}) };
    const current = bag[metaId] || 0;
    bag[metaId] = selected ? current + 1 : Math.max(0, current - 1);

    tx.update(vendorRef, {
      [field]: bag,
      lastVoteAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (selected) {
      tx.set(metaRef, {
        uid,
        vendorId,
        kind,
        metaId,
        selected: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (metaSnap.exists) {
      tx.delete(metaRef);
    }
  });

  return { success: true };
}

async function generateDiscoverToken(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + TOKEN_TTL_MS);
  await db().collection('_discover_tokens').doc(token).set({
    uid: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return {
    success: true,
    token,
    expiresAt: expiresAt.toMillis(),
    urlPath: `/discover?token=${token}`,
  };
}

async function validateDiscoverToken(request) {
  const token = String(request.data?.token || '').trim();
  if (!token || token.length < 16) throw new HttpsError('invalid-argument', 'Invalid token.');
  const snap = await db().collection('_discover_tokens').doc(token).get();
  if (!snap.exists) return { valid: false, reason: 'not_found' };
  const data = snap.data();
  const expiresMs = data.expiresAt?.toMillis?.() || 0;
  if (!expiresMs || expiresMs < Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, expiresAt: expiresMs };
}

async function submitVendorClaim(request) {
  const data = request.data || {};
  const vendorId = String(data.vendorId || '');
  const contact = String(data.contact || '').trim().slice(0, 120);
  const businessName = String(data.businessName || '').trim().slice(0, 120);
  const note = String(data.note || '').trim().slice(0, 500);
  const recaptchaToken = data.recaptchaToken || null;

  if (!vendorId) throw new HttpsError('invalid-argument', 'vendorId required.');
  if (!contact || !contact.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid contact email is required.');
  }
  if (!businessName) throw new HttpsError('invalid-argument', 'Business name is required.');

  if (recaptchaToken) {
    const captcha = await verifyRecaptchaWithEnforcement(recaptchaToken, 0.4, 'claim_vendor');
    if (!captcha.success) {
      throw new HttpsError('permission-denied', 'Security check failed. Please try again.');
    }
  }

  const vendorRef = db().collection('community_vendors').doc(vendorId);
  const snap = await vendorRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Vendor not found.');
  const vendor = snap.data();
  if (vendor.status !== 'approved') {
    throw new HttpsError('failed-precondition', 'Only approved listings can be claimed.');
  }
  if (vendor.claimStatus === 'pending' || vendor.claimStatus === 'approved') {
    throw new HttpsError('already-exists', 'A claim is already pending or approved for this listing.');
  }

  const claimRef = db().collection('community_vendor_claims').doc();
  await claimRef.set({
    id: claimRef.id,
    vendorId,
    vendorName: vendor.name || '',
    contact,
    businessName,
    note,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await vendorRef.update({
    claimStatus: 'pending',
    claimContact: contact,
    claimBusinessName: businessName,
    claimNote: note,
    claimSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
    claimId: claimRef.id,
  });

  return { success: true, claimId: claimRef.id };
}

const HANDLERS = {
  submitVendorSuggestion,
  adminDiscoverAction,
  voteOnDiscoverVendor,
  toggleDiscoverVendorMeta,
  generateDiscoverToken,
  validateDiscoverToken,
  submitVendorClaim,
};

/**
 * Single Discover API (1 Cloud Run service) — routes by `action`.
 */
exports.discoverApi = onCall(
  { cors: true, invoker: 'public', timeoutSeconds: 30, memory: '256MiB', cpu: 0.5 },
  async (request) => {
    const action = String(request.data?.action || '').trim();
    const handler = HANDLERS[action];
    if (!handler) {
      throw new HttpsError(
        'invalid-argument',
        `Unknown action "${action}". Expected one of: ${Object.keys(HANDLERS).join(', ')}`
      );
    }
    return handler(request);
  }
);
