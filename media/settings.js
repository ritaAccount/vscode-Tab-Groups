(function () {
  const vscodeApi = acquireVsCodeApi();
  window.__tabGroupsVscode = vscodeApi;

  const navItems = Array.from(document.querySelectorAll('.nav-item[data-pane]'));
  const panes = Array.from(document.querySelectorAll('.settings-pane[data-pane]'));
  const generalStatusEl = document.getElementById('generalStatus');
  const openGroupsButton = document.getElementById('openGroupsFile');
  const openConfigsButton = document.getElementById('openConfigsFile');

  function showPane(paneId) {
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.pane === paneId);
    });
    panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === paneId);
    });
  }

  function setGeneralStatus(text) {
    if (generalStatusEl) {
      generalStatusEl.textContent = text || '';
    }
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const paneId = item.dataset.pane;
      if (paneId) {
        showPane(paneId);
      }
    });
  });

  openGroupsButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openGroupsFile' });
  });

  openConfigsButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openConfigsFile' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'generalStatus') {
      setGeneralStatus(message.text || '');
    }
  });
})();
