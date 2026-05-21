(function () {
  const vscode = acquireVsCodeApi();

  /** @type {Record<string, string>} */
  let shortcuts = {
    addToGroup: 'ctrl+shift+i',
    removeFromGroup: 'ctrl+shift+o',
    createGroup: 'ctrl+shift+u',
    deleteGroup: 'ctrl+shift+p',
  };

  /** @type {string | null} */
  let recordingField = null;
  let isMac = false;

  const statusEl = document.getElementById('status');
  const saveButton = document.getElementById('save');
  const resetButton = document.getElementById('reset');
  const shortcutButtons = Array.from(document.querySelectorAll('[data-shortcut]'));

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function renderButtons() {
    shortcutButtons.forEach((button) => {
      const field = button.dataset.shortcut;
      if (field) {
        button.textContent = shortcuts[field];
      }
    });
  }

  function stopRecording() {
    recordingField = null;
    shortcutButtons.forEach((button) => button.classList.remove('recording'));
    setStatus('');
  }

  function startRecording(field, button) {
    stopRecording();
    recordingField = field;
    button.classList.add('recording');
    setStatus('请按下新的快捷键组合，Esc 取消');
    button.focus();
  }

  function normalizeKey(key) {
    if (key === ' ') {
      return 'space';
    }
    if (key.length === 1) {
      return key.toLowerCase();
    }
    return key.toLowerCase();
  }

  function isModifierKey(key) {
    return ['Control', 'Shift', 'Alt', 'Meta'].includes(key);
  }

  function eventToShortcut(event) {
    const parts = [];
    if (event.ctrlKey) {
      parts.push('ctrl');
    }
    if (event.altKey) {
      parts.push('alt');
    }
    if (event.shiftKey) {
      parts.push('shift');
    }
    if (event.metaKey) {
      parts.push(isMac ? 'cmd' : 'win');
    }

    if (isModifierKey(event.key)) {
      return null;
    }

    parts.push(normalizeKey(event.key));
    return parts.join('+');
  }

  function bindShortcutButton(field, button) {
    button.addEventListener('click', () => {
      startRecording(field, button);
    });

    button.addEventListener('keydown', (event) => {
      if (recordingField !== field) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopRecording();
        return;
      }

      const shortcut = eventToShortcut(event);
      if (!shortcut) {
        return;
      }

      shortcuts[field] = shortcut;
      renderButtons();
      stopRecording();
      setStatus(`已更新：${shortcut}`);
    });
  }

  shortcutButtons.forEach((button) => {
    const field = button.dataset.shortcut;
    if (field) {
      bindShortcutButton(field, button);
    }
  });

  saveButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'save',
      shortcuts: { ...shortcuts },
    });
  });

  resetButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'reset' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'init') {
      shortcuts = message.shortcuts;
      isMac = Boolean(message.isMac);
      renderButtons();
      return;
    }
    if (message.type === 'saved') {
      shortcuts = message.shortcuts;
      renderButtons();
      setStatus(message.text || '已保存');
      return;
    }
    if (message.type === 'error') {
      setStatus(message.text || '保存失败');
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
