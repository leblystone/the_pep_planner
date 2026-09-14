/**
 * Daily + emergency recovery for support/feedback that never landed in the
 * admin User Reports queue (ai_worker_logs).
 *
 * Primary prevention is ensureTicketInWorkQueue on create/append/reopen.
 * This scan is the automatic safety net so admins do not need routine manual pulls.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { COLLECTIONS } = require('./config/collections');
const { verifyAdmin } = require('./adminAuth');

const DEFAULT_LOOKBACK_DAYS = 90;
const META_DOC_PATH = '_system/supportInboxBacklogScan';

async function ensureTicketQueued(db, FieldValue, opts) {
  const {
    ticketId,
    ticketNumber,
    ticketType = 'support',
    subject = 'Support Request',
    userName = 'Unknown',
    userEmail = '',
    originalMessage = '',
    reasoning = 'Recovered by daily backlog scan',
    urgency = 'medium',
    requestNumber = null,
    userAccountInfo = null,
  } = opts || {};

  if (!ticketId) throw new Error('ensureTicketQueued: ticketId required');

  const openLogs = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
    .where('ticketId', '==', ticketId)
    .where('markedFixed', '==', false)
    .limit(5)
    .get();

  const bump = {
    originalMessage: originalMessage || '',
    timestamp: FieldValue.serverTimestamp(),
    adminReadAt: null,
    adminMarkedUnread: true,
    markedFixed: false,
    markedFixedAt: null,
    reasoning,
    subject: subject || 'Support Request',
    ...(requestNumber ? { latestRequestNumber: requestNumber } : {}),
  };

  if (!openLogs.empty) {
    const sorted = openLogs.docs.slice().sort((a, b) => {
      const ta = a.data().timestamp?.toMillis?.() ?? 0;
      const tb = b.data().timestamp?.toMillis?.() ?? 0;
      return tb - ta;
    });
    await sorted[0].ref.update(bump);
    for (let i = 1; i < sorted.length; i++) {
      await sorted[i].ref.update({
        markedFixed: true,
        markedFixedAt: FieldValue.serverTimestamp(),
        adminNotes: `Duplicate open queue row closed by backlog scan; kept ${sorted[0].id}`,
      });
    }
    return { logId: sorted[0].id, created: false, updated: true };
  }

  const logRef = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
    ticketId,
    ticketNumber: ticketNumber || ticketId.slice(-6).toUpperCase(),
    ticketType,
    subject: subject || 'Support Request',
    userName,
    userEmail,
    originalMessage: originalMessage || '',
    timestamp: FieldValue.serverTimestamp(),
    route: 'backlog_scan',
    confidence: 100,
    reasoning,
    complexity: null,
    urgency,
    keywords: [],
    executionModel: null,
    executionCost: 0,
    triageCost: 0,
    totalCost: 0,
    responseGenerated: false,
    responsePosted: false,
    responseContent: null,
    markedFixed: false,
    humanOverride: false,
    addedManually: false,
    autoQueued: true,
    backlogRecovered: true,
    adminReadAt: null,
    adminMarkedUnread: true,
    ...(requestNumber ? { latestRequestNumber: requestNumber } : {}),
    ...(userAccountInfo ? { userAccountInfo } : {}),
  });

  return { logId: logRef.id, created: true, updated: false };
}

async function ensureFeedbackQueued(db, FieldValue, feedbackId, feedback) {
  const displayNumber = `F-${feedbackId.slice(-6).toUpperCase()}`;
  const openLogs = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
    .where('feedbackId', '==', feedbackId)
    .where('markedFixed', '==', false)
    .limit(1)
    .get();

  if (!openLogs.empty) {
    await openLogs.docs[0].ref.update({
      originalMessage: feedback.message || '',
      timestamp: FieldValue.serverTimestamp(),
      adminReadAt: null,
      adminMarkedUnread: true,
      markedFixed: false,
      markedFixedAt: null,
      reasoning: 'Recovered by daily backlog scan (feedback)',
    });
    return { logId: openLogs.docs[0].id, created: false, updated: true, ticketNumber: displayNumber };
  }

  const logRef = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
    feedbackId,
    ticketId: null,
    ticketNumber: displayNumber,
    ticketType: feedback.type === 'bug' ? 'bug' : 'feedback',
    subject: feedback.type === 'bug'
      ? `Bug Report: ${(feedback.message || '').slice(0, 60)}`
      : `Suggestion: ${(feedback.message || '').slice(0, 60)}`,
    userName: feedback.userEmail ? String(feedback.userEmail).split('@')[0] : 'Anonymous',
    userEmail: feedback.userEmail || 'anonymous',
    originalMessage: feedback.message || '',
    timestamp: FieldValue.serverTimestamp(),
    route: 'backlog_scan',
    confidence: 100,
    reasoning: 'Recovered by daily backlog scan (feedback never queued)',
    urgency: feedback.type === 'bug' ? 'high' : 'low',
    keywords: [],
    executionModel: null,
    executionCost: 0,
    triageCost: 0,
    totalCost: 0,
    responseGenerated: false,
    responsePosted: false,
    responseContent: null,
    markedFixed: false,
    humanOverride: false,
    addedManually: false,
    autoQueued: true,
    backlogRecovered: true,
    isFeedback: true,
    adminReadAt: null,
    adminMarkedUnread: true,
  });

  return { logId: logRef.id, created: true, updated: false, ticketNumber: displayNumber };
}

/**
 * Find support tickets / feedback missing from the open User Reports queue and re-queue them.
 */
async function runSupportInboxBacklogRecovery(options = {}) {
  const lookbackDays = options.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  const trigger = options.trigger || 'manual';
  const dryRun = options.dryRun === true;

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  logger.info(
    `🔎 Support inbox backlog scan starting (lookback=${lookbackDays}d, trigger=${trigger}, dryRun=${dryRun})`
  );

  const openQueueSnap = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
    .where('markedFixed', '==', false)
    .get();

  const openTicketIds = new Set();
  const openFeedbackIds = new Set();
  openQueueSnap.forEach((d) => {
    const data = d.data();
    if (data.ticketId) openTicketIds.add(data.ticketId);
    if (data.feedbackId) openFeedbackIds.add(data.feedbackId);
  });

  const recovered = [];
  const skipped = [];
  const errors = [];

  // Support tickets with recent activity (field written by createSupportTicket)
  const ticketsSnap = await db.collection(COLLECTIONS.SUPPORT_TICKETS)
    .where('lastMessageAt', '>=', cutoff)
    .get();

  for (const ticketDoc of ticketsSnap.docs) {
    const ticket = ticketDoc.data();
    const ticketId = ticketDoc.id;

    if (ticket.status === 'merged') {
      skipped.push({ ticketId, reason: 'merged' });
      continue;
    }

    if (openTicketIds.has(ticketId)) {
      skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: 'already_open_in_queue' });
      continue;
    }

    const lastMsgMs = ticket.lastMessageAt?.toMillis?.() ?? 0;

    let latestLog = null;
    try {
      const logsSnap = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
        .where('ticketId', '==', ticketId)
        .limit(25)
        .get();
      if (!logsSnap.empty) {
        latestLog = logsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.timestamp?.toMillis?.() ?? a.markedFixedAt?.toMillis?.() ?? 0;
            const tb = b.timestamp?.toMillis?.() ?? b.markedFixedAt?.toMillis?.() ?? 0;
            return tb - ta;
          })[0];
      }
    } catch (e) {
      logger.warn(`Backlog scan: could not load logs for ${ticketId}:`, e.message);
    }

    const closedStatuses = new Set(['closed', 'resolved', 'merged']);
    const isClosedTicket = closedStatuses.has(ticket.status);
    const logFixedMs = latestLog?.markedFixedAt?.toMillis?.()
      ?? latestLog?.timestamp?.toMillis?.()
      ?? 0;

    let reason = null;
    if (!latestLog) {
      reason = 'never_queued';
    } else if (latestLog.markedFixed === true && lastMsgMs > logFixedMs) {
      reason = 'user_activity_after_queue_closed';
    } else if (!isClosedTicket && latestLog.markedFixed === true) {
      reason = 'open_ticket_queue_marked_fixed';
    } else {
      skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: 'closed_and_current' });
      continue;
    }

    let originalMessage = ticket.subject || '';
    let requestNumber = null;
    try {
      const msgs = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(ticketId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      const userMsg = msgs.docs.find((d) => d.data().senderType === 'user');
      if (userMsg) {
        originalMessage = userMsg.data().message || userMsg.data().text || originalMessage;
        requestNumber = userMsg.data().requestNumber || null;
      }
    } catch (_) { /* non-fatal */ }

    if (dryRun) {
      recovered.push({
        kind: 'support',
        ticketId,
        ticketNumber: ticket.ticketNumber,
        reason,
        dryRun: true,
      });
      continue;
    }

    try {
      const result = await ensureTicketQueued(db, FieldValue, {
        ticketId,
        ticketNumber: ticket.ticketNumber || ticketId.slice(-6).toUpperCase(),
        ticketType: ticket.type || 'support',
        subject: ticket.subject || 'Support Request',
        userName: ticket.userName || (ticket.userEmail || '').split('@')[0] || 'Unknown',
        userEmail: ticket.userEmail || '',
        originalMessage,
        reasoning: `Daily backlog scan recovery: ${reason}`,
        urgency: ticket.type === 'bug' ? 'high' : 'medium',
        requestNumber,
        userAccountInfo: ticket.userAccountInfo || null,
      });
      openTicketIds.add(ticketId);
      recovered.push({
        kind: 'support',
        ticketId,
        ticketNumber: ticket.ticketNumber,
        reason,
        logId: result.logId,
        created: result.created,
      });
      logger.info(`✅ Backlog recovered ticket ${ticket.ticketNumber || ticketId} (${reason})`);
    } catch (e) {
      errors.push({ ticketId, error: e.message });
      logger.error(`❌ Backlog failed for ticket ${ticketId}:`, e.message);
    }
  }

  // Feedback still status=new without an open queue row
  let feedbackSnap = { docs: [] };
  try {
    feedbackSnap = await db.collection(COLLECTIONS.FEEDBACK)
      .where('status', '==', 'new')
      .get();
  } catch (e) {
    logger.warn('Backlog scan: feedback query failed:', e.message);
  }

  for (const fbDoc of feedbackSnap.docs) {
    const feedbackId = fbDoc.id;
    const feedback = fbDoc.data();

    const submittedMs = feedback.submittedAt?.toMillis?.()
      ?? (feedback.timestamp ? Date.parse(feedback.timestamp) : 0)
      ?? 0;
    if (submittedMs && submittedMs < cutoff.getTime()) continue;

    if (openFeedbackIds.has(feedbackId)) {
      skipped.push({ feedbackId, reason: 'already_open_in_queue' });
      continue;
    }

    if (dryRun) {
      recovered.push({
        kind: 'feedback',
        feedbackId,
        ticketNumber: `F-${feedbackId.slice(-6).toUpperCase()}`,
        reason: 'feedback_never_queued',
        dryRun: true,
      });
      continue;
    }

    try {
      const result = await ensureFeedbackQueued(db, FieldValue, feedbackId, feedback);
      openFeedbackIds.add(feedbackId);
      recovered.push({
        kind: 'feedback',
        feedbackId,
        ticketNumber: result.ticketNumber,
        reason: 'feedback_never_queued',
        logId: result.logId,
        created: result.created,
      });
      logger.info(`✅ Backlog recovered feedback ${result.ticketNumber}`);
    } catch (e) {
      errors.push({ feedbackId, error: e.message });
      logger.error(`❌ Backlog failed for feedback ${feedbackId}:`, e.message);
    }
  }

  const summary = {
    success: true,
    trigger,
    lookbackDays,
    dryRun,
    scannedTickets: ticketsSnap.size,
    scannedFeedback: feedbackSnap.docs.length,
    recoveredCount: recovered.length,
    recovered,
    errorCount: errors.length,
    errors,
    skippedCount: skipped.length,
    finishedAt: new Date().toISOString(),
  };

  try {
    await db.doc(META_DOC_PATH).set({
      lastRunAt: FieldValue.serverTimestamp(),
      lastTrigger: trigger,
      lookbackDays,
      dryRun,
      recoveredCount: recovered.length,
      errorCount: errors.length,
      scannedTickets: ticketsSnap.size,
      scannedFeedback: feedbackSnap.docs.length,
      lastRecovered: recovered.slice(0, 50),
      lastErrors: errors.slice(0, 20),
    }, { merge: true });
  } catch (metaErr) {
    logger.warn('Could not write backlog scan meta:', metaErr.message);
  }

  logger.info(
    `✅ Support inbox backlog scan done: recovered=${recovered.length}, errors=${errors.length}, scannedTickets=${ticketsSnap.size}`
  );

  return summary;
}

/** Daily safety net — auto-queues anything that fell through. */
exports.dailySupportInboxBacklogScan = onSchedule(
  {
    schedule: '0 6 * * *', // 6:00 AM Central
    timeZone: 'America/Chicago',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    return runSupportInboxBacklogRecovery({
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
      trigger: 'daily_schedule',
      dryRun: false,
    });
  }
);

/**
 * Emergency / on-demand scan (admin). Auto-queues misses by default.
 * Manual Add Missed remains for single-ticket emergencies.
 */
exports.runSupportInboxBacklogScanNow = onCall(
  { cors: true, timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    verifyAdmin(request);
    const lookbackDays = Math.min(
      180,
      Math.max(1, Number(request.data?.lookbackDays) || DEFAULT_LOOKBACK_DAYS)
    );
    const dryRun = request.data?.dryRun === true;
    try {
      return await runSupportInboxBacklogRecovery({
        lookbackDays,
        trigger: dryRun ? 'admin_dry_run' : 'admin_emergency',
        dryRun,
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('runSupportInboxBacklogScanNow failed:', error.message, error.stack);
      throw new HttpsError('internal', `Backlog scan failed: ${error.message || 'unknown error'}`);
    }
  }
);

exports.runSupportInboxBacklogRecovery = runSupportInboxBacklogRecovery;
