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
