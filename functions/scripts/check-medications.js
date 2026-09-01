const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'tpp-splendide' });

(async () => {
  const d = (await admin.firestore().collection('userData').doc('G2Msgqiu28PVc2B2WjsE4ciVz5W2').get()).data() || {};
  console.log('medications field:', JSON.stringify(d.medications, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
