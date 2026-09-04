(function () {
  const vscodeApi = acquireVsCodeApi();
  window.__tabGroupsVscode = vscodeApi;

  const navItems = Array.from(document.querySelectorAll('.nav-item[data-pane]'));
  const panes = Array.from(document.querySelectorAll('.settings-pane[data-pane]'));
  const generalStatusEl = document.getElementById('generalStatus');
  const versionDescEl = document.getElementById('versionDesc');
  const openGroupsButton = document.getElementById('openGroupsFile');
  const openConfigsButton = document.getElementById('openConfigsFile');
  const upgradeConfigButton = document.getElementById('upgradeConfig');

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

  function renderVersionInfo(info) {
    if (!versionDescEl) {
      return;
    }
    const need = info.needsUpgrade ? '需要升级配置文件' : '配置已是最新';
    versionDescEl.textContent = `扩展 ${info.extensionVersion} · 配置 ${info.configVersion} · schema ${info.schemaVersion} · ${need}`;
    if (upgradeConfigButton) {
      upgradeConfigButton.textContent = info.needsUpgrade ? '升级配置' : '检查更新';
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

  upgradeConfigButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'upgradeConfig' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'generalStatus') {
      setGeneralStatus(message.text || '');
      return;
    }
    if (message.type === 'versionInfo') {
      renderVersionInfo(message);
    }
  });
})();
