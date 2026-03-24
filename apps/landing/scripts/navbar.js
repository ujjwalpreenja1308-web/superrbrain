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

  // ── Auth state: read Supabase session from shared .covable.app cookie ───
  function getSession() {
    try {
      var match = document.cookie.match(/(?:^|; )covable-auth=([^;]*)/);
      if (!match) return null;
      var raw = decodeURIComponent(match[1]);
      var parsed = JSON.parse(raw);
      var session = parsed.currentSession || parsed;
      if (!session || !session.user) return null;
      if (session.expires_at && session.expires_at * 1000 < Date.now()) return null;
      return session;
    } catch (e) { return null; }
  }

  function signOut() {
    // Clear the shared cookie on parent domain
    document.cookie = 'covable-auth=; domain=.covable.app; path=/; max-age=0';
    window.location.reload();
  }

  function renderAuthedNav(session) {
    var user = session.user;
    var avatar = (user.user_metadata && user.user_metadata.avatar_url) || null;
    var name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || '';
    var initials = name ? name.charAt(0).toUpperCase() : '?';

    var navCta = nav.querySelector('.nav-cta');
    if (!navCta) return;

    navCta.innerHTML =
      '<a href="https://home.covable.app" class="btn-primary nav-btn-start" style="padding:8px 16px;font-size:12px;">Go to dashboard</a>' +
      '<div class="nav-user-menu" style="position:relative;display:inline-flex;align-items:center;">' +
        '<button class="nav-avatar-btn" style="background:none;border:none;cursor:pointer;padding:0;margin-left:8px;display:flex;align-items:center;gap:8px;">' +
          (avatar
            ? '<img src="' + avatar + '" alt="' + initials + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.15);">'
            : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#0A0A09;">' + initials + '</div>'
          ) +
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-tertiary);"><path d="m6 9 6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="nav-dropdown" style="display:none;position:absolute;top:calc(100% + 8px);right:0;background:var(--surface);border:1px solid var(--border);border-radius:6px;min-width:160px;padding:4px;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,0.4);">' +
          '<div style="padding:8px 12px;font-size:11px;color:var(--text-tertiary);border-bottom:1px solid var(--border);margin-bottom:4px;">' + (user.email || '') + '</div>' +
          '<button id="nav-signout-btn" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:8px 12px;font-size:13px;color:var(--text-secondary);border-radius:4px;font-family:inherit;">Sign out</button>' +
        '</div>' +
      '</div>';

    // Toggle dropdown
    var btn = navCta.querySelector('.nav-avatar-btn');
    var dropdown = navCta.querySelector('.nav-dropdown');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function () {
      dropdown.style.display = 'none';
    });
    navCta.querySelector('#nav-signout-btn').addEventListener('click', signOut);
  }

  var session = getSession();
  if (session) renderAuthedNav(session);
})();
