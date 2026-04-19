(function () {
  var nav = document.querySelector('nav');
  if (!nav) return;

  // ── Scroll hide/show ──────────────────────────────────────────────
  var lastY = window.scrollY;
  var ticking = false;

  function update() {
    var currentY = window.scrollY;
    var wasCollapsed = nav.classList.contains('nav-collapsed');
    if (currentY > lastY && currentY > 80) {
      if (!wasCollapsed) nav.classList.add('nav-collapsed');
    } else {
      if (wasCollapsed) nav.classList.remove('nav-collapsed');
    }
    lastY = currentY;
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });

  // Scroll nav links
  document.querySelectorAll('a[data-scroll]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById(link.getAttribute('data-scroll'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

})();
