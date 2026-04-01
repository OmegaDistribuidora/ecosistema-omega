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
  const eyeOpenIcon = form.querySelector('[data-eye-open]');
  const eyeClosedIcon = form.querySelector('[data-eye-closed]');
  const toggleLabel = form.querySelector('[data-toggle-label]');

  if (passwordInput && togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
      togglePasswordBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
      if (toggleLabel) {
        toggleLabel.textContent = isPassword ? 'Ocultar senha' : 'Mostrar senha';
      }
      if (eyeOpenIcon && eyeClosedIcon) {
        eyeOpenIcon.classList.toggle('hidden', isPassword);
        eyeClosedIcon.classList.toggle('hidden', !isPassword);
      }
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
  const root = document.querySelector('[data-systems-carousel]');
  if (!root) {
    return;
  }

  const viewport = root.querySelector('[data-carousel-viewport]');
  const track = root.querySelector('[data-carousel-track]');
  const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const dotsWrap = root.querySelector('[data-carousel-dots]');
  const descriptionText = root.parentElement && root.parentElement.querySelector('[data-carousel-description-text]');

  if (!viewport || !track || !slides.length) {
    return;
  }

  let activeIndex = 0;
  let touchStartX = null;
  let edgeDirection = 0;
  let edgeTimer = null;

  const EDGE_THRESHOLD_PX = 96;
  const EDGE_THRESHOLD_RATIO = 0.14;
  const EDGE_SCROLL_DELAY_MS = 650;

  function clampIndex(index) {
    return Math.max(0, Math.min(slides.length - 1, index));
  }

  function createDots() {
    if (!dotsWrap) {
      return [];
    }

    return slides.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'carousel-dot';
      button.setAttribute('aria-label', `Ir para card ${index + 1}`);
      button.addEventListener('click', () => {
        activeIndex = index;
        render();
      });
      dotsWrap.appendChild(button);
      return button;
    });
  }

  const dots = createDots();

  function updateTrackPosition() {
    const activeSlide = slides[activeIndex];
    if (!activeSlide) {
      return;
    }

    const viewportStyles = window.getComputedStyle(viewport);
    const viewportPaddingLeft = Number.parseFloat(viewportStyles.paddingLeft || '0') || 0;
    const viewportPaddingRight = Number.parseFloat(viewportStyles.paddingRight || '0') || 0;
    const viewportWidth = viewport.clientWidth - viewportPaddingLeft - viewportPaddingRight;
    const trackWidth = track.scrollWidth;
    const slideOffset = activeSlide.offsetLeft;
    const slideWidth = activeSlide.offsetWidth;
    const target = slideOffset - (viewportWidth - slideWidth) / 2;
    const maxTranslate = Math.max(trackWidth - viewportWidth, 0);
    const translate = Math.max(0, Math.min(target, maxTranslate));

    track.style.transform = `translateX(${-translate}px)`;
  }

  function clearEdgeTimer() {
    if (edgeTimer) {
      clearTimeout(edgeTimer);
      edgeTimer = null;
    }
  }

  function scheduleEdgeScroll() {
    clearEdgeTimer();

    if (!edgeDirection) {
      return;
    }

    edgeTimer = setTimeout(() => {
      edgeTimer = null;

      if (!edgeDirection) {
        return;
      }

      const nextIndex = clampIndex(activeIndex + edgeDirection);
      if (nextIndex !== activeIndex) {
        activeIndex = nextIndex;
        render();
      }

      if (edgeDirection) {
        scheduleEdgeScroll();
      }
    }, EDGE_SCROLL_DELAY_MS);
  }

  function render() {
    slides.forEach((slide, index) => {
      slide.classList.toggle('is-active', index === activeIndex);
      slide.classList.toggle('is-prev', index === activeIndex - 1);
      slide.classList.toggle('is-next', index === activeIndex + 1);
      slide.classList.toggle('is-prev-2', index === activeIndex - 2);
      slide.classList.toggle('is-next-2', index === activeIndex + 2);
      slide.classList.toggle('is-distant', Math.abs(index - activeIndex) > 2);
    });

    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === activeIndex);
      dot.setAttribute('aria-pressed', index === activeIndex ? 'true' : 'false');
    });

    if (descriptionText) {
      const activeLink = slides[activeIndex] && slides[activeIndex].querySelector('.system-card');
      descriptionText.textContent = activeLink
        ? (activeLink.dataset.systemDescription || 'Acessar sistema')
        : '';
    }

    if (prevBtn) {
      prevBtn.disabled = activeIndex === 0;
    }
    if (nextBtn) {
      nextBtn.disabled = activeIndex === slides.length - 1;
    }

    updateTrackPosition();
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      activeIndex = clampIndex(activeIndex - 1);
      render();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      activeIndex = clampIndex(activeIndex + 1);
      render();
    });
  }

  slides.forEach((slide, index) => {
    const link = slide.querySelector('.system-card');

    slide.addEventListener('focusin', () => {
      activeIndex = index;
      render();
    });

    if (link) {
      link.addEventListener('pointerdown', () => {
        link.dataset.wasActiveOnPointerDown = index === activeIndex ? 'true' : 'false';
      });

      link.addEventListener('click', (event) => {
        const wasActiveOnPointerDown = link.dataset.wasActiveOnPointerDown === 'true';
        delete link.dataset.wasActiveOnPointerDown;

        if (!wasActiveOnPointerDown) {
          event.preventDefault();
          activeIndex = index;
          render();
        }
      });
    }
  });

  viewport.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  viewport.addEventListener('touchend', (event) => {
    if (touchStartX === null) {
      return;
    }

    const touchEndX = event.changedTouches[0].clientX;
    const delta = touchEndX - touchStartX;
    touchStartX = null;

    if (Math.abs(delta) < 40) {
      return;
    }

    activeIndex = clampIndex(activeIndex + (delta < 0 ? 1 : -1));
    render();
  }, { passive: true });

  viewport.addEventListener('mousemove', (event) => {
    if (window.innerWidth <= 680) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const threshold = Math.min(EDGE_THRESHOLD_PX, bounds.width * EDGE_THRESHOLD_RATIO);
    const pointerX = event.clientX - bounds.left;

    let nextDirection = 0;
    if (pointerX <= threshold) {
      nextDirection = -1;
    } else if (pointerX >= bounds.width - threshold) {
      nextDirection = 1;
    }

    if (nextDirection === edgeDirection) {
      return;
    }

    edgeDirection = nextDirection;
    if (edgeDirection) {
      scheduleEdgeScroll();
    } else {
      clearEdgeTimer();
    }
  });

  viewport.addEventListener('mouseleave', () => {
    edgeDirection = 0;
    clearEdgeTimer();
  });

  window.addEventListener('resize', render);
  activeIndex = clampIndex(Math.floor((slides.length - 1) / 2));
  render();
})();

(function () {
  const noticeOverlay = document.querySelector('[data-dashboard-notice]');
  const okButton = document.querySelector('[data-dashboard-notice-ok]');
  if (!noticeOverlay || !okButton) {
    return;
  }

  document.body.classList.add('modal-open');
  okButton.focus();

  okButton.addEventListener('click', () => {
    noticeOverlay.remove();
    document.body.classList.remove('modal-open');
  });
})();

(function () {
  const modals = Array.from(document.querySelectorAll('[data-modal]'));
  if (!modals.length) {
    return;
  }

  const pageBody = document.body;

  function resetFormState(modal) {
    const form = modal.querySelector('form[data-reset-on-open]');
    if (!form) {
      return;
    }

    form.reset();
  }

  function focusFirstField(modal) {
    const target = modal.querySelector('input, select, textarea, button');
    if (target) {
      target.focus();
    }
  }

  function lockBody() {
    pageBody.classList.add('modal-open');
  }

  function unlockBody() {
    const hasOpenModal = modals.some((modal) => !modal.classList.contains('hidden'));
    if (!hasOpenModal) {
      pageBody.classList.remove('modal-open');
    }
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.add('hidden');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    unlockBody();
  }

  function openModal(modal) {
    if (!modal) {
      return;
    }

    modals.forEach((item) => {
      if (item !== modal) {
        closeModal(item);
      }
    });

    resetFormState(modal);
    modal.classList.remove('hidden');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    lockBody();
    window.requestAnimationFrame(() => focusFirstField(modal));
  }

  function openModalByName(name) {
    const modal = document.querySelector(`[data-modal="${name}"]`);
    openModal(modal);
  }

  document.querySelectorAll('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      openModalByName(button.dataset.openModal);
    });
  });

  document.addEventListener('click', (event) => {
    const closeTrigger = event.target.closest('[data-close-modal]');
    if (!closeTrigger) {
      return;
    }

    closeModal(closeTrigger.closest('[data-modal]'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    const openedModal = modals.find((modal) => !modal.classList.contains('hidden'));
    if (openedModal) {
      closeModal(openedModal);
    }
  });

  window.AdminModal = {
    open: openModal,
    close: closeModal,
    openByName: openModalByName,
  };
})();

(function () {
  const buttons = Array.from(document.querySelectorAll('[data-notice-edit]'));
  const form = document.querySelector('[data-notice-edit-form]');
  if (!buttons.length || !form) {
    return;
  }

  const modal = form.closest('[data-modal]');
  const title = modal && modal.querySelector('[data-notice-edit-title]');
  const status = modal && modal.querySelector('[data-notice-status]');
  const titleInput = form.querySelector('[data-notice-field="title"]');
  const messageInput = form.querySelector('[data-notice-field="message"]');
  const startsAtInput = form.querySelector('[data-notice-field="starts_at"]');
  const endsAtInput = form.querySelector('[data-notice-field="ends_at"]');
  const userOptions = Array.from(form.querySelectorAll('[data-notice-user-option]'));
  const closeBtn = form.querySelector('[data-notice-close]');
  const cancelBtn = form.querySelector('[data-notice-edit-cancel]');

  function openFor(button) {
    const noticeId = button.dataset.noticeId;
    const noticeTitle = button.dataset.title || '';
    const noticeMessage = decodeURIComponent(button.dataset.message || '');
    const startsAt = button.dataset.startsAt || '';
    const endsAt = button.dataset.endsAt || '';
    const userIds = (button.dataset.userIds || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const statusLabel = button.dataset.statusLabel || '';
    const isClosed = button.dataset.isClosed === '1';

    form.action = `/admin/notices/${noticeId}`;
    if (title) {
      title.textContent = `Editar Comunicado: ${noticeTitle}`;
    }
    if (status) {
      status.textContent = statusLabel ? `Status atual: ${statusLabel}.` : 'Atualize texto, publico ou prazo de exibicao.';
    }
    if (titleInput) {
      titleInput.value = noticeTitle;
    }
    if (messageInput) {
      messageInput.value = noticeMessage;
    }
    if (startsAtInput) {
      startsAtInput.value = startsAt;
    }
    if (endsAtInput) {
      endsAtInput.value = endsAt;
    }

    for (const option of userOptions) {
      option.checked = userIds.includes(Number(option.value));
    }

    if (closeBtn) {
      closeBtn.hidden = isClosed;
      closeBtn.setAttribute('formaction', `/admin/notices/${noticeId}/close`);
      closeBtn.dataset.noticeTitle = noticeTitle;
    }

    if (window.AdminModal && modal) {
      window.AdminModal.open(modal);
    }
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => openFor(button));
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (window.AdminModal && modal) {
        window.AdminModal.close(modal);
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      const noticeTitle = closeBtn.dataset.noticeTitle || 'este comunicado';
      const confirmed = window.confirm(`Encerrar ${noticeTitle} antes do prazo?`);
      if (!confirmed) {
        event.preventDefault();
      }
    });
  }
})();

(function () {
  const buttons = Array.from(document.querySelectorAll('[data-user-edit]'));
  const form = document.querySelector('[data-user-edit-form]');
  if (!buttons.length || !form) {
    return;
  }

  const title = form.querySelector('[data-user-edit-title]');
  const usernameInput = form.querySelector('[data-user-field="username"]');
  const passwordInput = form.querySelector('[data-user-password-field]');
  const isAdminInput = form.querySelector('[data-user-field="is_admin"]');
  const systemOptions = Array.from(form.querySelectorAll('[data-user-system-option]'));
  const ssoInputs = Array.from(form.querySelectorAll('[data-user-sso-login]'));
  const cancelBtn = form.querySelector('[data-user-edit-cancel]');
  const modal = form.closest('[data-modal]');

  if (passwordInput) {
    passwordInput.value = '';
    passwordInput.dataset.userTyped = 'false';
    passwordInput.addEventListener('input', () => {
      passwordInput.dataset.userTyped = passwordInput.value ? 'true' : 'false';
    });
  }

  form.addEventListener('submit', () => {
    if (passwordInput && passwordInput.dataset.userTyped !== 'true') {
      passwordInput.value = '';
    }
  });

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
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.dataset.userTyped = 'false';
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

    if (window.AdminModal && modal) {
      window.AdminModal.open(modal);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => openFor(button));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (window.AdminModal && modal) {
        window.AdminModal.close(modal);
      }
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
  const deleteBtn = form.querySelector('[data-system-delete]');
  const cancelBtn = form.querySelector('[data-system-edit-cancel]');
  const modal = form.closest('[data-modal]');

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
    if (deleteBtn) {
      deleteBtn.hidden = false;
      deleteBtn.setAttribute('formaction', `/admin/systems/${id}/delete`);
      deleteBtn.dataset.systemName = name;
    }
    const uploadInput = form.querySelector('input[name="card_image_file"]');
    if (uploadInput) {
      uploadInput.value = '';
    }

    if (window.AdminModal && modal) {
      window.AdminModal.open(modal);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => openFor(button));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (window.AdminModal && modal) {
        window.AdminModal.close(modal);
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', (event) => {
      const systemName = deleteBtn.dataset.systemName || 'este sistema';
      const confirmed = window.confirm(`Excluir ${systemName}? Esta acao nao pode ser desfeita.`);
      if (!confirmed) {
        event.preventDefault();
      }
    });
  }
})();
