"use strict";

window.easyCleanFirebaseReady = (async () => {
  const config = window.EASYCLEAN_FIREBASE_CONFIG || {};
  const configured = ["apiKey", "authDomain", "projectId", "appId"].every((key) => Boolean(config[key]));
  if (!configured) return;

  const loadScript = (source) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`โหลด Firebase SDK ไม่สำเร็จ: ${source}`));
    document.head.append(script);
  });

  const version = "13.2.0";
  for (const service of ["app", "auth", "firestore"]) {
    await loadScript(`https://www.gstatic.com/firebasejs/${version}/firebase-${service}-compat.js`);
  }
  await loadScript("firebase-adapter.js");
})();
