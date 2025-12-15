const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

export function showToast(message, type = 'success', timeout = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const text = document.createElement('span');
  text.textContent = message;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn ghost inline';
  closeBtn.textContent = '✕';
  toast.append(text, closeBtn);
  const timeoutId = setTimeout(() => toast.remove(), timeout);
  closeBtn.onclick = () => {
    clearTimeout(timeoutId);
    toast.remove();
  };
  toastContainer.appendChild(toast);
}

let modalBackdrop;
export function openModal({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, dismissible = true }) {
  if (!modalBackdrop) {
    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    document.body.appendChild(modalBackdrop);
  }
  modalBackdrop.innerHTML = '';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <header><h3>${title}</h3><button class="btn ghost inline" aria-label="Close">✕</button></header>
    <div>${body}</div>
    <footer>
      <button class="btn secondary" data-role="cancel">${cancelText}</button>
      <button class="btn danger" data-role="confirm">${confirmText}</button>
    </footer>
  `;
  modalBackdrop.appendChild(modal);
  modalBackdrop.style.display = 'flex';
  const close = () => { modalBackdrop.style.display = 'none'; };
  modal.querySelector('[aria-label="Close"]').onclick = close;
  modal.querySelector('[data-role="cancel"]').onclick = close;
  modal.querySelector('[data-role="confirm"]').onclick = async () => {
    if (onConfirm) await onConfirm();
    close();
  };
  modalBackdrop.addEventListener('click', (e) => { if (dismissible && e.target === modalBackdrop) close(); });
  return modal;
}

export function toggleSection(target) {
  document.querySelectorAll('.section').forEach((sec) => sec.classList.toggle('active', sec.id === target));
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.route === target));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export function formatChange(value) {
  const num = Number(value) || 0;
  const cls = num >= 0 ? 'positive' : 'negative';
  const prefix = num >= 0 ? '+' : '';
  return `<span class="${cls}">${prefix}${num.toFixed(2)}</span>`;
}

export function pill(label, status) {
  return `<span class="pill ${status}">${label}</span>`;
}
