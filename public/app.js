(function () {
  const dropdown = document.querySelector('[data-admin-dropdown]');
  if (!dropdown) {
    return;
  }

  const tabButtons = Array.from(dropdown.querySelectorAll('[data-admin-tab-button]'));
  const tabPanels = Array.from(dropdown.querySelectorAll('[data-admin-tab-panel]'));

  if (!tabButtons.length || !tabPanels.length) {
    return;
  }

  function setActiveTab(tab) {
    for (const button of tabButtons) {
      button.classList.toggle('is-active', button.dataset.tab === tab);
    }

    for (const panel of tabPanels) {
      panel.classList.toggle('hidden', panel.dataset.adminTabPanel !== tab);
    }
  }

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab);
    });
  }

  document.addEventListener('click', (event) => {
    if (dropdown.open && !dropdown.contains(event.target)) {
      dropdown.open = false;
    }
  });

  setActiveTab(tabButtons[0].dataset.tab);
})();

(function () {
  const links = Array.from(document.querySelectorAll('[data-preview-link]'));
  const frame = document.querySelector('[data-preview-frame]');
  const title = document.querySelector('[data-preview-title]');
  const placeholder = document.querySelector('[data-preview-placeholder]');

  if (!links.length || !frame || !title || !placeholder) {
    return;
  }

  function setActive(link) {
    for (const item of links) {
      item.classList.toggle('is-active', item === link);
    }
  }

  function showPreview(link) {
    const url = link.dataset.previewUrl;
    const name = link.dataset.previewTitle;
    if (!url) {
      return;
    }

    setActive(link);
    title.textContent = name || 'Preview';
    frame.src = url;
    frame.classList.remove('hidden');
    placeholder.classList.add('hidden');
  }

  for (const link of links) {
    link.addEventListener('mouseenter', () => showPreview(link));
    link.addEventListener('focus', () => showPreview(link));
  }

  const lastUrl = localStorage.getItem('omega:lastPreviewUrl');
  const preferred = links.find((link) => link.dataset.previewUrl === lastUrl) || links[0];
  if (preferred) {
    showPreview(preferred);
  }

  for (const link of links) {
    link.addEventListener('click', () => {
      localStorage.setItem('omega:lastPreviewUrl', link.dataset.previewUrl || '');
    });
  }
})();
