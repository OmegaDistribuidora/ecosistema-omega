(function () {
  const form = document.querySelector('[data-login-form]');
  if (!form) {
    return;
  }

  const passwordInput = form.querySelector('[data-password-input]');
  const togglePasswordBtn = form.querySelector('[data-toggle-password]');
  const capsWarning = form.querySelector('[data-caps-warning]');
  const submitBtn = form.querySelector('[data-login-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const submitSpinner = form.querySelector('[data-submit-spinner]');

  if (passwordInput && togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? 'Ocultar' : 'Mostrar';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
      passwordInput.focus();
    });

    passwordInput.addEventListener('keyup', (event) => {
      if (!capsWarning) {
        return;
      }
      const capsOn = typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
      capsWarning.classList.toggle('hidden', !capsOn);
    });
  }

  form.addEventListener('submit', () => {
    if (!submitBtn) {
      return;
    }
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    if (submitLabel) {
      submitLabel.textContent = 'Entrando...';
    }
    if (submitSpinner) {
      submitSpinner.classList.remove('hidden');
    }
  });
})();

(function () {
  const buttons = Array.from(document.querySelectorAll('[data-user-edit]'));
  const form = document.querySelector('[data-user-edit-form]');
  if (!buttons.length || !form) {
    return;
  }

  const title = form.querySelector('[data-user-edit-title]');
  const usernameInput = form.querySelector('[data-user-field="username"]');
  const isAdminInput = form.querySelector('[data-user-field="is_admin"]');
  const systemOptions = Array.from(form.querySelectorAll('[data-user-system-option]'));
  const ssoInputs = Array.from(form.querySelectorAll('[data-user-sso-login]'));
  const cancelBtn = form.querySelector('[data-user-edit-cancel]');

  function openFor(button) {
    const id = button.dataset.userId;
    const username = button.dataset.username || '';
    const isAdmin = button.dataset.isAdmin === '1';
    const ids = (button.dataset.systemIds || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    let ssoMappings = [];
    try {
      const rawMappings = decodeURIComponent(button.dataset.ssoMappings || '');
      ssoMappings = rawMappings ? JSON.parse(rawMappings) : [];
    } catch (error) {
      ssoMappings = [];
    }
    const mappingIndex = new Map(
      (Array.isArray(ssoMappings) ? ssoMappings : []).map((item) => [Number(item.systemId), item.externalLogin || ''])
    );

    form.action = `/admin/users/${id}`;
    if (title) {
      title.textContent = `Editar Usuario: ${username}`;
    }
    if (usernameInput) {
      usernameInput.value = username;
    }
    if (isAdminInput) {
      isAdminInput.checked = isAdmin;
    }

    for (const option of systemOptions) {
      const optionId = Number(option.value);
      option.checked = ids.includes(optionId);
    }

    for (const input of ssoInputs) {
      const systemId = Number(input.dataset.userSsoLogin);
      input.value = mappingIndex.get(systemId) || '';
    }

    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  for (const button of buttons) {
    button.addEventListener('click', () => openFor(button));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      form.classList.add('hidden');
    });
  }
})();

(function () {
  const buttons = Array.from(document.querySelectorAll('[data-system-edit]'));
  const form = document.querySelector('[data-system-edit-form]');
  if (!buttons.length || !form) {
    return;
  }

  const title = form.querySelector('[data-system-edit-title]');
  const nameInput = form.querySelector('[data-system-field="name"]');
  const urlInput = form.querySelector('[data-system-field="url"]');
  const descriptionInput = form.querySelector('[data-system-field="description"]');
  const ssoEnabledInput = form.querySelector('[data-system-field="sso_enabled"]');
  const ssoKeyInput = form.querySelector('[data-system-field="sso_key"]');
  const previewSelect = form.querySelector('[data-system-field="preview_image_url"]');
  const cancelBtn = form.querySelector('[data-system-edit-cancel]');

  function openFor(button) {
    const id = button.dataset.systemId;
    const name = button.dataset.name || '';
    const url = button.dataset.url || '';
    const description = button.dataset.description || '';
    const ssoEnabled = button.dataset.ssoEnabled === '1';
    const ssoKey = button.dataset.ssoKey || '';
    const preview = button.dataset.previewImageUrl || '';

    form.action = `/admin/systems/${id}`;
    if (title) {
      title.textContent = `Editar Sistema: ${name}`;
    }
    if (nameInput) {
      nameInput.value = name;
    }
    if (urlInput) {
      urlInput.value = url;
    }
    if (descriptionInput) {
      descriptionInput.value = description;
    }
    if (ssoEnabledInput) {
      ssoEnabledInput.checked = ssoEnabled;
    }
    if (ssoKeyInput) {
      ssoKeyInput.value = ssoKey;
    }
    if (previewSelect) {
      previewSelect.value = preview;
    }

    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  for (const button of buttons) {
    button.addEventListener('click', () => openFor(button));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      form.classList.add('hidden');
    });
  }
})();
