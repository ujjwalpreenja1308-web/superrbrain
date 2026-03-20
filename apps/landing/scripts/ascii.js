(function () {
  var mount = document.getElementById('ascii-mount');
  if (!mount) return;

  // How long to show the fully-revealed flower before fading out
  var HOLD = 4000;
  // Fade out duration (ms) — must match CSS transition below
  var FADE_OUT = 2400;
  // Fade back in duration (ms)
  var FADE_IN = 3000;

  mount.style.transition = 'opacity ' + (FADE_OUT / 1000) + 's ease';

  function loop() {
    // Fade out the whole container slowly
    mount.style.opacity = '0';
    setTimeout(function () {
      // Fade back in
      mount.style.transition = 'opacity ' + (FADE_IN / 1000) + 's ease';
      mount.style.opacity = '1';
      // Hold, then repeat
      setTimeout(loop, FADE_IN + HOLD);
    }, FADE_OUT);
  }

  function reverseDelays(lines) {
    var delays = Array.prototype.map.call(lines, function (el) {
      return el.style.animationDelay;
    });
    delays.reverse();
    lines.forEach(function (el, i) {
      el.style.animationDelay = delays[i];
    });
  }

  fetch('/ascii-snippet.html')
    .then(function (r) { return r.text(); })
    .then(function (html) {
      mount.innerHTML = html;
      reverseDelays(mount.querySelectorAll('.ln'));
      // Wait for initial reveal to finish, then start gentle loop
      var initialReveal = 5600;
      setTimeout(loop, initialReveal + HOLD);
    })
    .catch(function () {});
})();
