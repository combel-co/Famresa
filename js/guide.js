// ==========================================
// GUIDE — HOUSE GUIDE CARDS
// ==========================================

async function showGuideSheet() {
  const res = resources.find(r => r.id === selectedResource);
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>📖 Guide maison</h2>
      <div style="color:var(--text-light);font-size:13px;margin-bottom:16px">${res?.name || 'Maison'}</div>
      <div id="guide-cards" style="min-height:60px">
        <div style="color:var(--text-light);font-size:14px">Chargement...</div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px" onclick="showAddGuideCard()">+ Ajouter une fiche</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
  await refreshGuideCards();
}

async function refreshGuideCards() {
  const el = document.getElementById('guide-cards');
  if (!el) return;
  try {
    const snap = await guidesMaisonRef()
      .where('ressource_id', '==', selectedResource)
      .get();
    if (snap.empty) {
      el.innerHTML = '<div style="color:var(--text-light);font-size:14px;padding:8px 0">Aucune fiche. Ajoutez des infos utiles (Wi-Fi, urgences, voisins...)</div>';
      return;
    }
    el.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      return `<div style="background:#f8f9fa;border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="font-weight:700;font-size:15px;margin-bottom:6px">${d.emoji || '📌'} ${d.title || ''}</div>
        <div style="font-size:14px;color:var(--text);white-space:pre-wrap">${d.content || ''}</div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="color:var(--danger);font-size:14px">Erreur de chargement.</div>';
  }
}

function showAddGuideCard() {
  const GUIDE_EMOJIS = ['📌','🔑','📶','🚿','⚡','🔥','🧹','📞','🚑','👥','🐕','🌿'];
  let selectedEmoji = '📌';
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Ajouter une fiche</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
        ${GUIDE_EMOJIS.map(e => `<button style="font-size:24px;background:none;border:2px solid transparent;border-radius:8px;padding:4px 6px;cursor:pointer" id="gemoji-${e}" onclick="selectGuideEmoji('${e}', this)">${e}</button>`).join('')}
      </div>
      <div class="input-group">
        <label>Titre</label>
        <input type="text" id="guide-title" placeholder="Ex: Wi-Fi, Urgences, Poubelles...">
      </div>
      <div class="input-group">
        <label>Contenu</label>
        <textarea id="guide-content" rows="4" placeholder="Informations utiles..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;resize:none"></textarea>
      </div>
      <button class="btn btn-primary" onclick="saveGuideCard()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="showGuideSheet()">Retour</button>
    </div>`;
  // Select first emoji
  setTimeout(() => {
    const firstBtn = document.getElementById('gemoji-📌');
    if (firstBtn) firstBtn.style.borderColor = 'var(--accent)';
  }, 50);
}

function selectGuideEmoji(emoji, btn) {
  document.querySelectorAll('[id^="gemoji-"]').forEach(b => b.style.borderColor = 'transparent');
  btn.style.borderColor = 'var(--accent)';
  window._selectedGuideEmoji = emoji;
}

async function saveGuideCard() {
  const title = (document.getElementById('guide-title')?.value || '').trim();
  const content = (document.getElementById('guide-content')?.value || '').trim();
  const emoji = window._selectedGuideEmoji || '📌';
  if (!title) { showToast('Entrez un titre'); return; }
  try {
    const snap = await guidesMaisonRef().where('ressource_id', '==', selectedResource).get();
    const maxOrder = snap.docs.reduce((m, d) => Math.max(m, d.data().order || 0), 0);
    await guidesMaisonRef().add({
      ressource_id: selectedResource,
      title, content, emoji,
      order: maxOrder + 1,
      createdAt: ts()
    });
    showToast('Fiche ajoutée ✓');
    showGuideSheet();
  } catch(e) { showToast('Erreur — réessayez'); }
}
