(function () {
  var mount = document.getElementById('ascii-mount');
  if (!mount) return;

  var HOLD = 4000;
  var FADE_OUT = 2400;
  var FADE_IN = 3000;

  mount.style.transition = 'opacity ' + (FADE_OUT / 1000) + 's ease';

  function loop() {
    mount.style.opacity = '0';
    setTimeout(function () {
      mount.style.transition = 'opacity ' + (FADE_IN / 1000) + 's ease';
      mount.style.opacity = '1';
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

  function init(html) {
    mount.innerHTML = html;
    reverseDelays(mount.querySelectorAll('.ln'));
    var initialReveal = 5600;
    setTimeout(loop, initialReveal + HOLD);
  }

  // Try fetch first; if it fails (e.g. rewrite catches it), use inline fallback
  fetch('/ascii-snippet.html')
    .then(function (r) {
      if (!r.ok) throw new Error('not ok');
      return r.text();
    })
    .then(function (html) {
      // Sanity check: make sure we got the snippet, not an HTML page
      if (html.indexOf('class="ln"') === -1) throw new Error('bad response');
      init(html);
    })
    .catch(function () {
      // Fallback: load via <link rel="prefetch"> already fetched the file,
      // try once more as a no-cache request
      fetch('/ascii-snippet.html?v=1', { cache: 'no-store' })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          if (html.indexOf('class="ln"') !== -1) init(html);
        })
        .catch(function () {});
    });
})();
