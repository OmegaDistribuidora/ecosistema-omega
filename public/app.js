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
