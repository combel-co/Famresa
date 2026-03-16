// ==========================================
// UI HELPERS
// ==========================================
function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function closeSheet() {
  document.getElementById('overlay').classList.remove('open');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// Reusable PIN input setup (auto-advance, backspace, auto-submit)
function setupPinInputs(inputs, onComplete) {
  inputs.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.length > 1) e.target.value = val.slice(-1);
      if (val && i < inputs.length - 1) inputs[i + 1].focus();
      if (i === inputs.length - 1 && val && onComplete) onComplete();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
      if (e.key === 'Enter' && onComplete) onComplete();
    });
  });
}

function handlePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 120; canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min)/2, (img.height - min)/2, min, min, 0, 0, size, size);
      tempPhoto = canvas.toDataURL('image/jpeg', 0.6);
      const preview = document.getElementById('photo-preview');
      if (preview) { preview.innerHTML = `<img src="${tempPhoto}" alt="">`; preview.classList.add('has-photo'); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateUserPill() {
  const avatar = document.getElementById('header-avatar');
  const name = document.getElementById('header-name');
  if (currentUser) {
    name.textContent = currentUser.name;
    avatar.innerHTML = currentUser.photo ? `<img src="${currentUser.photo}" alt="">` : getInitials(currentUser.name);
  } else {
    avatar.innerHTML = '?';
    name.textContent = 'Se connecter';
  }
}

function _syncHeaderHeight() {
  var h = document.getElementById('app-header');
  if (h && h.offsetHeight > 0)
    document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}

function enterApp() {
  document.getElementById('app-header').style.display = 'flex';
  document.getElementById('app-main').style.display = 'block';
  // Sync CSS variable to actual rendered header height (fixes sticky gap on all screen sizes)
  requestAnimationFrame(_syncHeaderHeight);
  updateUserPill();
  loadFamilyName();
  switchTab(activeTab || 'dashboard');
  renderCalendar();
  setTimeout(() => maybePromptPendingFuel(), 350);
}
