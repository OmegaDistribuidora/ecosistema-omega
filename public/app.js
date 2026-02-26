(function () {
  const buttons = Array.from(document.querySelectorAll('[data-system-button]'));
  const frame = document.querySelector('[data-system-frame]');
  const title = document.querySelector('[data-system-title]');
  const placeholder = document.querySelector('[data-placeholder]');
  const externalLink = document.querySelector('[data-external-link]');

  if (!buttons.length || !frame || !title || !placeholder || !externalLink) {
    return;
  }

  function activateButton(target) {
    for (const button of buttons) {
      button.classList.toggle('active', button === target);
    }
  }

  function openSystem(button) {
    const url = button.dataset.url;
    const name = button.dataset.name;
    if (!url) {
      return;
    }

    activateButton(button);
    frame.src = url;
    frame.classList.remove('hidden');
    placeholder.classList.add('hidden');
    title.textContent = name || 'Sistema';

    externalLink.href = url;
    externalLink.classList.remove('hidden');

    localStorage.setItem('ecosistema:lastSystem', button.dataset.id || '');
  }

  for (const button of buttons) {
    button.addEventListener('click', () => openSystem(button));
  }

  const lastId = localStorage.getItem('ecosistema:lastSystem');
  const preferred = buttons.find((button) => button.dataset.id === lastId) || buttons[0];
  if (preferred) {
    openSystem(preferred);
  }
})();
