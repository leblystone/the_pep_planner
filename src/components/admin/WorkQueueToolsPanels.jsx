import React from 'react';
import { MagnifyingGlass, Plus, GitCommit } from '@phosphor-icons/react';
import { ChipButton } from './UserReportsInbox';

/** Collapsible admin tools: backlog scan, add missed ticket, commit audit */
export default function WorkQueueToolsPanels({
  t,
  GH_CONFIG,
  showBacklogScan,
  setShowBacklogScan,
  backlogScanning,
  runBacklogScan,
  backlogResults,
  expandedBacklogItems,
  toggleBacklogItem,
  backlogMessages,
  showAddMissed,
  setShowAddMissed,
  addMissedSearch,
  setAddMissedSearch,
  searchMissedTicket,
  addMissedSearching,
  addMissedError,
  addMissedResult,
  addMissedTicketToQueue,
  addMissedAdding,
  showCommitAudit,
  setShowCommitAudit,
  commitAuditDays,
  setCommitAuditDays,
  commitAuditRunning,
  runCommitAudit,
  commitAuditResults,
  setCommitAuditResults,
  workQueue,
  linkingNoMatchSha,
  setLinkingNoMatchSha,
  selectedLogIdForNoMatch,
  setSelectedLogIdForNoMatch,
  linkNoMatchCommitToTicket,
  openTicket,
  functions,
  httpsCallable,
}) {
  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      <ChipButton
        active={showBacklogScan}
        onClick={() => setShowBacklogScan((v) => !v)}
      >
        <MagnifyingGlass size={13} /> Backlog Scan
        {Array.isArray(backlogResults) && backlogResults.length > 0 && (
          <span style={{ backgroundColor: '#EF4444', color: '#fff', borderRadius: '10px', fontSize: '10px', padding: '1px 6px' }}>
            {backlogResults.length}
          </span>
        )}
      </ChipButton>
      <ChipButton active={showAddMissed} onClick={() => { setShowAddMissed((v) => !v); }}>
        <Plus size={13} /> Add Missed
      </ChipButton>
      <ChipButton active={showCommitAudit} onClick={() => setShowCommitAudit((v) => !v)}>
        <GitCommit size={13} /> Commit Audit
      </ChipButton>
    </div>

    {showAddMissed && (
      <div style={{ backgroundColor: t.cardBackground, border: `1px solid ${t.primary}40`, borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontWeight: '600', fontSize: '13px', color: t.text, marginBottom: '8px' }}>Find &amp; Add Missed Ticket</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            value={addMissedSearch}
            onChange={(e) => setAddMissedSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMissedTicket()}
            placeholder="e.g. Z100"
            style={{ flex: 1, padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', textTransform: 'uppercase' }}
          />
          <ChipButton onClick={searchMissedTicket} disabled={addMissedSearching || !addMissedSearch.trim()} loading={addMissedSearching}>
            <MagnifyingGlass size={13} /> Search
          </ChipButton>
        </div>
        {addMissedError && <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>{addMissedError}</div>}
        {addMissedResult && (
          <div style={{ fontSize: '12px', color: t.textLight, marginBottom: '8px' }}>
            {addMissedResult.isFeedback ? 'Feedback' : 'Ticket'} #{addMissedResult.ticketNumber} — {addMissedResult.userEmail}
            {addMissedResult._note && (
              <div style={{ marginTop: '4px', color: '#B45309' }}>{addMissedResult._note}</div>
            )}
            <div style={{ marginTop: '8px' }}>
              <ChipButton onClick={addMissedTicketToQueue} loading={addMissedAdding} variant="primary">
                Add to User Reports
              </ChipButton>
            </div>
          </div>
        )}
      </div>
    )}

    {showCommitAudit && (
      <div style={{ backgroundColor: t.cardBackground, border: '1px solid #8B5CF640', borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '8px' }}>Commit Audit</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <input
            type="number"
            min="1"
            max="730"
            value={commitAuditDays}
            onChange={(e) => setCommitAuditDays(Number(e.target.value) || 365)}
            style={{ width: '65px', padding: '5px 8px', border: `1px solid ${t.border}`, borderRadius: '6px', fontSize: '12px' }}
          />
          <span style={{ fontSize: '12px' }}>days on {GH_CONFIG.branch}</span>
          <ChipButton onClick={() => runCommitAudit(commitAuditDays)} loading={commitAuditRunning} variant="primary">
            Run Audit
          </ChipButton>
          {commitAuditResults && (
            <ChipButton onClick={() => setCommitAuditResults(null)}>Clear</ChipButton>
          )}
        </div>
        {commitAuditResults && (
          <div style={{ fontSize: '12px', color: t.textLight }}>
            {commitAuditResults.totalCommits} commits · {commitAuditResults.linked?.filter((l) => !l.skipped).length} linked · {commitAuditResults.noMatch?.length} unmatched
          </div>
        )}
      </div>
    )}

    {showBacklogScan && (
      <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontWeight: '600', fontSize: '13px', color: '#92400E', marginBottom: '8px' }}>Backlog Audit (90 days)</div>
        <ChipButton onClick={runBacklogScan} loading={backlogScanning} style={{ marginBottom: '8px' }}>
          Run Scan
        </ChipButton>
        {Array.isArray(backlogResults) && backlogResults.length > 0 && (
          <div style={{ fontSize: '12px', color: '#92400E' }}>
            {backlogResults.length} potentially missed — expand in full tools view or add from list
          </div>
        )}
        {backlogResults?.error && <div style={{ color: '#DC2626', fontSize: '12px' }}>{backlogResults.error}</div>}
      </div>
    )}
  </div>
  );
}
