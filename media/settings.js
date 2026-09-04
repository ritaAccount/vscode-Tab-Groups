(function () {
  const navItems = Array.from(document.querySelectorAll('.nav-item[data-pane]'));
  const panes = Array.from(document.querySelectorAll('.settings-pane[data-pane]'));

  function showPane(paneId) {
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.pane === paneId);
    });
    panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === paneId);
    });
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const paneId = item.dataset.pane;
      if (paneId) {
        showPane(paneId);
      }
    });
  });
})();
