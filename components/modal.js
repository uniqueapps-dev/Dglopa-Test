/**
 * DGLOPA PLATFORM — MODAL COMPONENT
 * Bottom-sheet style modal for Android.
 */

let _activeModal = null;

export function openModal({ title = '', bodyHTML = '', id = 'default-modal' }) {
  closeModal(); // close any existing

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = `modal-${id}`;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  backdrop.innerHTML = `
    <div class="modal" role="document">
      <div class="modal-handle"></div>
      ${title ? `<h2 class="modal-title">${_escape(title)}</h2>` : ''}
      <div class="modal-body">${bodyHTML}</div>
    </div>
  `;

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.body.appendChild(backdrop);
  _activeModal = backdrop;

  // Trigger open animation next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => backdrop.classList.add('open'));
  });

  return backdrop;
}

export function closeModal() {
  if (!_activeModal) return;
  _activeModal.classList.remove('open');
  _activeModal.addEventListener('transitionend', () => {
    _activeModal?.remove();
    _activeModal = null;
  }, { once: true });
}

function _escape(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
