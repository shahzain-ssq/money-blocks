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
  const header = document.createElement('header');
  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn ghost inline';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  header.append(titleEl, closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = body;

  const footer = document.createElement('footer');
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary';
  cancelBtn.dataset.role = 'cancel';
  cancelBtn.textContent = cancelText;
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn danger';
  confirmBtn.dataset.role = 'confirm';
  confirmBtn.textContent = confirmText;
  footer.append(cancelBtn, confirmBtn);

  modal.append(header, bodyEl, footer);
  modalBackdrop.appendChild(modal);
  modalBackdrop.style.display = 'flex';
  const close = () => { modalBackdrop.style.display = 'none'; };
  closeBtn.onclick = close;
  cancelBtn.onclick = close;
  confirmBtn.onclick = async () => {
    if (onConfirm) await onConfirm();
    close();
  };
  const backdropHandler = (e) => { if (dismissible && e.target === modalBackdrop) close(); };
  modalBackdrop.addEventListener('click', backdropHandler, { once: true });
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
  const span = document.createElement('span');
  span.className = `pill ${status}`;
  span.textContent = label;
  return span;
}
