(function () {
  const NAMESPACE = 'AI_SMART_EDIT';
  let isActive = false;
  let overlay = null;
  let selectedOverlay = null;

  // Initialize overlay elements
  function createOverlay(id, color, zIndex) {
    const el = document.createElement('div');
    el.id = id;
    el.style.position = 'absolute';
    el.style.border = `2px solid ${color}`;
    el.style.backgroundColor = `${color}33`; // 20% opacity
    el.style.pointerEvents = 'none'; // Click-through
    el.style.zIndex = zIndex;
    el.style.display = 'none';
    el.style.transition = 'all 0.1s ease-out';
    document.body.appendChild(el);
    return el;
  }

  function ensureOverlays() {
    if (!overlay) overlay = createOverlay('ai-smart-edit-hover', '#0070f3', '2147483646');
    if (!selectedOverlay) selectedOverlay = createOverlay('ai-smart-edit-selected', '#f5a623', '2147483647');
  }

  function getStableSelector(el) {
    if (el.id) return `#${el.id}`;
    let path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        selector += `.${el.className.trim().split(/\s+/).join('.')}`;
      }
      let siblingIndex = 1;
      let sibling = el.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName === el.nodeName) siblingIndex++;
        sibling = sibling.previousElementSibling;
      }
      if (siblingIndex > 1) selector += `:nth-of-type(${siblingIndex})`;
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(' > ');
  }

  function captureContext(el) {
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    
    // Parent info
    const parent = el.parentElement;
    
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || '',
      className: el.className instanceof String ? el.className.trim() : (el.classList ? Array.from(el.classList).join(' ') : ''),
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      computedStyles: {
        display: computed.display,
        position: computed.position,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        margin: computed.margin,
        padding: computed.padding,
        border: computed.border,
        borderRadius: computed.borderRadius,
        zIndex: computed.zIndex,
        textAlign: computed.textAlign,
        opacity: computed.opacity,
        visibility: computed.visibility
      },
      innerText: el.innerText ? el.innerText.substring(0, 300).trim() : '',
      html: el.outerHTML || '',
      innerHTML: el.innerHTML ? el.innerHTML.substring(0, 300).trim() : '',
      selector: getStableSelector(el),
      parent: parent ? {
        tagName: parent.tagName.toLowerCase(),
        id: parent.id || ''
      } : null,
      url: window.location.href,
      route: window.location.pathname,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  function updateOverlay(overlayEl, targetEl) {
    if (!targetEl) {
      overlayEl.style.display = 'none';
      return;
    }
    const rect = targetEl.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    overlayEl.style.display = 'block';
    overlayEl.style.left = `${rect.left + scrollX}px`;
    overlayEl.style.top = `${rect.top + scrollY}px`;
    overlayEl.style.width = `${rect.width}px`;
    overlayEl.style.height = `${rect.height}px`;
  }

  // --- Event Handlers ---

  function handleMouseOver(e) {
    if (!isActive) return;
    updateOverlay(overlay, e.target);
  }

  function handleClick(e) {
    if (!isActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    // Highlight selected
    updateOverlay(selectedOverlay, target);
    
    // Capture and send
    const context = captureContext(target);
    window.parent.postMessage({
      type: `${NAMESPACE}:SELECTED`,
      payload: context
    }, '*'); // In production, replace '*' with specific origin if possible
  }

  function handleGenericMessage(e) {
      // Security measure: In a real environment, check e.origin here
      // if (e.origin !== "http://localhost:3000") return;

      if (e.data && e.data.type) {
        switch (e.data.type) {
          case `${NAMESPACE}:PING`:
            window.parent.postMessage({ type: `${NAMESPACE}:PONG` }, '*');
            break;
          case `${NAMESPACE}:ENABLE`:
            isActive = true;
            ensureOverlays();
            document.body.style.cursor = 'crosshair';
            document.addEventListener('mouseover', handleMouseOver, true);
            document.addEventListener('click', handleClick, true);
            break;
          case `${NAMESPACE}:DISABLE`:
            isActive = false;
            if (overlay) overlay.style.display = 'none';
            if (selectedOverlay) selectedOverlay.style.display = 'none';
            document.body.style.cursor = '';
            document.removeEventListener('mouseover', handleMouseOver, true);
            document.removeEventListener('click', handleClick, true);
            break;
        }
      }
  }

  // Listen for messages from parent
  window.addEventListener('message', handleGenericMessage);

  // Handle Scroll to detect bottom
  let scrollTimeout;
  const onScroll = () => {
    if (!isActive) return;
    
    if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
    
    scrollTimeout = requestAnimationFrame(() => {
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight;
        
        // Check if we are within 100px of the bottom
        const isBottom = (scrollTop + clientHeight) >= (scrollHeight - 100);
        
        window.parent.postMessage({
            type: `${NAMESPACE}:SCROLL_UPDATE`,
            payload: { isBottom }
        }, '*');
    });
  };
  
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Handle ESC key to exit
  document.addEventListener('keydown', (e) => {
    if (isActive && e.key === 'Escape') {
      isActive = false;
      document.body.style.cursor = '';
      if (overlay) overlay.style.display = 'none';
      if (selectedOverlay) selectedOverlay.style.display = 'none';
      window.parent.postMessage({ type: `${NAMESPACE}:DISABLE` }, '*');
    }
  });

  console.log('[AI Smart Edit] Target script loaded.');
})();
