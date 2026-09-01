const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'tpp-splendide' });

const UID = 'G2Msgqiu28PVc2B2WjsE4ciVz5W2';

(async () => {
  const userDoc = await admin.firestore().collection('users').doc(UID).get();
  const userDataDoc = await admin.firestore().collection('userData').doc(UID).get();
  const u = userDoc.data() || {};
  const d = userDataDoc.data() || {};

  const tz = u.settings?.region?.timeZone || 'America/New_York';
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
  console.log('Server "today" in user tz (' + tz + '):', fmt.format(now));
  console.log('---');

  const protocols = d.protocols || [];
  console.log(`Protocols: ${protocols.length}`);
  for (const p of protocols) {
    console.log(`\n[Protocol] ${p.protocolName || p.name || '(unnamed)'} | active=${p.active} | startDate=${p.startDate} | endDate=${p.endDate} | duration=${JSON.stringify(p.duration)}`);
    for (const pep of p.peptides || []) {
      console.log(`  - Peptide: ${pep.name} | freq.type=${pep.frequency?.type} | time=${JSON.stringify(pep.frequency?.time)} | onDays=${pep.frequency?.onDays} offDays=${pep.frequency?.offDays} | customDays=${pep.frequency?.customDays} | days=${JSON.stringify(pep.frequency?.days)} | customReminder=${pep.frequency?.customReminder} reminderTime=${pep.frequency?.reminderTime}`);
    }
  }

  console.log('\n---\nSupplements:', (d.supplements || []).length);
  for (const s of d.supplements || []) {
    console.log(`  - ${s.name} | schedule=${JSON.stringify(s.schedule)} | days=${JSON.stringify(s.days)} | startDate=${s.startDate} | endDate=${s.endDate} | heldByFreePlan=${s.heldByFreePlan} | id=${s.id}`);
  }

  const todayKey = fmt.format(now).split(', ')[1]?.split('/').reverse().join('-') || '';
  console.log('\n---\ntaskCompletion keys:', Object.keys(d.taskCompletion || {}));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
