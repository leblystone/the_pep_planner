/**
 * Apply welcome-back refresh: backdate active protocols/goals to lastGapDate,
 * flag stockpile/supplies/supplements/medications/scheduledBuys for reconfirm.
 * Does NOT delete any user data.
 */
import { prepareItemForSave } from './userDataSave';
import {
  findActiveProtocolHistoryEntry,
  updateProtocolHistoryEntry,
} from './protocolHistory';
import { getMedications, saveMedications, updateMedication } from './medications';

/**
 * Summarize what a refresh would affect (for intro UI counts).
 */
export function summarizeReengagementImpact({
  protocols = [],
  goals = [],
  stockpile = [],
  supplements = [],
  medications = [],
  scheduledBuys = [],
} = {}) {
  const activeProtocols = (protocols || []).filter((p) => p && p.active);
  const activeGoals = (goals || []).filter((g) => g && !g.completed && !g.deleted);
  const stockItems = (stockpile || []).filter((i) => i && !i.deleted && (Number(i.quantity) || 0) > 0);
  const activeSupplements = (supplements || []).filter((s) => s && !s.archived && !s.deleted);
  const activeMeds = (medications || []).filter((m) => m && !m.archived && !m.deleted && m.active !== false);
  const buys = (scheduledBuys || []).filter(Boolean);

  return {
    activeProtocols,
    activeGoals,
    stockItems,
    activeSupplements,
    activeMeds,
    buys,
    counts: {
      protocols: activeProtocols.length,
      goals: activeGoals.length,
      stockpile: stockItems.length,
      supplements: activeSupplements.length,
      medications: activeMeds.length,
      scheduledBuys: buys.length,
    },
  };
}

/**
 * End a single active protocol as of endDate (YYYY-MM-DD).
 * Mutates via prepareItemForSave; caller batches setProtocols.
 * Also updates protocol history when an active entry exists.
 *
 * @returns {{ protocol: object, historyUpdated: boolean }}
 */
export function endProtocolAsOf(protocol, endDate, { reason = 'ended_reengagement' } = {}) {
  const protocolEndType = reason === 'rescheduled' ? 'rescheduled' : 'manual';
  const updatedProtocol = prepareItemForSave({
    ...protocol,
    active: false,
    endDate,
    endType: protocolEndType,
  });

  let historyUpdated = false;
  const activeHistoryEntry = findActiveProtocolHistoryEntry(protocol.id);
  if (activeHistoryEntry) {
    let completionStatus = 'ended_reengagement';
    if (reason === 'rescheduled') completionStatus = 'rescheduled';
    else if (reason === 'ended_early') completionStatus = 'ended_early';
    else if (reason === 'completed') completionStatus = 'completed';

    const linkedItems = protocol.linkedItems || {};
    const skippedReconstitution = {};
    Object.entries(linkedItems).forEach(([peptideId, item]) => {
      if (item?.status === 'skipped' && item.deliveryMethod) {
        const peptide = protocol.peptides?.find(
          (p) => (p.id || `peptide-${protocol.peptides.indexOf(p)}`) === peptideId
        );
        skippedReconstitution[peptideId] = {
          peptideName: peptide?.name || 'Unknown',
          deliveryMethod: item.deliveryMethod,
        };
      }
    });

    historyUpdated = updateProtocolHistoryEntry(activeHistoryEntry.id, {
      endDate,
      completionStatus,
      endType: protocolEndType,
      protocolData: {
        ...(activeHistoryEntry.protocolData || {}),
        linkedItems,
      },
      skippedReconstitution:
        Object.keys(skippedReconstitution).length > 0 ? skippedReconstitution : null,
    });
  }

  return { protocol: updatedProtocol, historyUpdated };
}

/**
 * Apply the full refresh. Callers pass current arrays + setters from AppContext / hooks.
 *
 * @returns {{ endedProtocolIds: string[], completedGoalIds: string[], flagged: object }}
 */
export function applyReengagementRefresh({
  lastGapDate,
  excludedProtocolIds = [],
  excludedGoalIds = [],
  protocols = [],
  setProtocols,
  goals = [],
  setGoals,
  stockpile = [],
  setStockpile,
  supplements = [],
  setSupplements,
  medications = null,
  setMedications = null,
  scheduledBuys = [],
  setScheduledBuys,
  // updateProtocolWithForceSync kept for callers; bulk sync uses saveAppData instead
} = {}) {
  if (!lastGapDate) {
    throw new Error('lastGapDate is required');
  }

  const excludeProtocols = new Set(excludedProtocolIds || []);
  const excludeGoals = new Set(excludedGoalIds || []);

  const endedProtocolIds = [];
  let nextProtocols = Array.isArray(protocols) ? [...protocols] : [];

  nextProtocols = nextProtocols.map((p) => {
    if (!p?.active || excludeProtocols.has(p.id)) return p;
    const { protocol } = endProtocolAsOf(p, lastGapDate, { reason: 'ended_reengagement' });
    endedProtocolIds.push(p.id);
    return protocol;
  });

  if (typeof setProtocols === 'function') {
    setProtocols(nextProtocols);
  }

  try {
    localStorage.setItem('tpprover_protocols', JSON.stringify(nextProtocols));
    localStorage.setItem('tpprover_protocols_lastUpdate', String(Date.now()));
  } catch (_) {}

  try {
    window.dispatchEvent(
      new CustomEvent('tpp:protocol-changed', {
        detail: { protocolIds: endedProtocolIds, source: 'reengagement', timestamp: Date.now() },
      })
    );
  } catch (_) {}

  const completedGoalIds = [];
  let nextGoals = Array.isArray(goals) ? [...goals] : [];
  nextGoals = nextGoals.map((g) => {
    if (!g || g.completed || g.deleted || excludeGoals.has(g.id)) return g;
    completedGoalIds.push(g.id);
    return prepareItemForSave({
      ...g,
      completed: true,
      completedDate: lastGapDate,
    });
  });
  if (typeof setGoals === 'function') {
    setGoals(nextGoals);
  }

  let nextStockpile = Array.isArray(stockpile) ? [...stockpile] : [];
  let flaggedStockpile = 0;
  nextStockpile = nextStockpile.map((item) => {
    if (!item || item.deleted) return item;
    if ((Number(item.quantity) || 0) <= 0) return item;
    flaggedStockpile += 1;
    return prepareItemForSave({ ...item, needsReconfirm: true });
  });
  if (typeof setStockpile === 'function') {
    setStockpile(nextStockpile);
  }
  try {
    localStorage.setItem('tpprover_stockpile', JSON.stringify(nextStockpile));
  } catch (_) {}

  let nextSupplements = Array.isArray(supplements) ? [...supplements] : [];
  let flaggedSupplements = 0;
  nextSupplements = nextSupplements.map((s) => {
    if (!s || s.archived || s.deleted) return s;
    flaggedSupplements += 1;
    return prepareItemForSave({ ...s, needsReconfirm: true });
  });
  if (typeof setSupplements === 'function') {
    setSupplements(nextSupplements);
  }
  try {
    localStorage.setItem('tpprover_supplements', JSON.stringify(nextSupplements));
  } catch (_) {}

  let flaggedMedications = 0;
  const medsList = Array.isArray(medications) ? medications : getMedications();
  const nextMeds = medsList.map((m) => {
    if (!m || m.archived || m.deleted || m.active === false) return m;
    flaggedMedications += 1;
    return prepareItemForSave({ ...m, needsReconfirm: true });
  });
  saveMedications(nextMeds);
  if (typeof setMedications === 'function') {
    setMedications(nextMeds);
  }

  let nextBuys = Array.isArray(scheduledBuys) ? [...scheduledBuys] : [];
  let flaggedBuys = 0;
  nextBuys = nextBuys.map((b) => {
    if (!b) return b;
    flaggedBuys += 1;
    return prepareItemForSave({ ...b, needsReconfirm: true });
  });
  if (typeof setScheduledBuys === 'function') {
    setScheduledBuys(nextBuys);
  }
  try {
    localStorage.setItem('tpprover_scheduled_buys', JSON.stringify(nextBuys));
  } catch (_) {}

  return {
    endedProtocolIds,
    completedGoalIds,
    flagged: {
      stockpile: flaggedStockpile,
      supplements: flaggedSupplements,
      medications: flaggedMedications,
      scheduledBuys: flaggedBuys,
    },
  };
}

/** Clear needsReconfirm on a stockpile/supply item (Looks Right). */
export function clearStockpileReconfirm(item) {
  if (!item) return item;
  return prepareItemForSave({ ...item, needsReconfirm: false });
}

/** Clear needsReconfirm on a supplement. */
export function clearSupplementReconfirm(supplement) {
  if (!supplement) return supplement;
  return prepareItemForSave({ ...supplement, needsReconfirm: false });
}

/** Clear needsReconfirm on a medication. */
export function clearMedicationReconfirm(medicationId) {
  return updateMedication(medicationId, { needsReconfirm: false });
}

/** Clear needsReconfirm on a scheduled buy. */
export function clearScheduledBuyReconfirm(buy) {
  if (!buy) return buy;
  return prepareItemForSave({ ...buy, needsReconfirm: false });
}
