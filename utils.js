// ===== SHARE / RESET / UTILS =====
function shareSignal() {
  let entry, sl;
  if (mode === 'limit') {
    entry = document.getElementById('entry').value;
  } else {
    entry = document.getElementById('marketEntry').value;
  }
  sl = document.getElementById('sl').value;
  const tp = document.getElementById('tp') ? document.getElementById('tp').value : '';
  let url = `${location.origin}${location.pathname}?e=${entry}&sl=${sl}&d=${direction}&m=${mode}`;
  if (tp) url += `&tp=${tp}`;
  navigator.clipboard.writeText(url);
  showToast('Link copied!', false);
  vibrate([50]);
}

function confirmReset() {
  document.getElementById('modalOverlay').innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal-box">
        <p>Clear current signal and start new?</p>
        <div class="modal-actions">
          <button class="modal-cancel" onclick="closeModal()">Cancel</button>
          <button class="modal-confirm" onclick="resetAll()">Reset</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modalOverlay').classList.add('hidden');
}

function resetAll() {
  direction = null;
  currentStep = 0;
  copySequence = [];
  calculated = false;
  document.getElementById('entry').value = '';
  document.getElementById('sl').value = '';
  document.getElementById('tp').value = '';
  document.getElementById('marketEntry').value = '';
  document.getElementById('btnBuy').className = '';
  document.getElementById('btnSell').className = '';
  document.getElementById('results').classList.add('hidden');
  document.getElementById('shareSection').classList.add('hidden');
  document.getElementById('signalSummary').classList.add('hidden');
  document.getElementById('progressSection').classList.add('hidden');
  document.getElementById('stepCounter').classList.add('hidden');
  document.getElementById('confirmScreen').classList.add('hidden');
  document.getElementById('inputSection').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.add('hidden');
  clearError();
  history.replaceState(null, '', location.pathname);
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.classList.remove('show'), 1500);
}

// Initialize on load
init();
