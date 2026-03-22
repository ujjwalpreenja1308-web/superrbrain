(function () {
  var mount = document.getElementById('ascii-mount');
  if (!mount || !mount.querySelector('.ln')) return;

  var HOLD = 4000;
  var FADE_OUT = 2400;
  var FADE_IN = 3000;

  // Reverse animation delays so lines reveal bottom-up on loop
  var lines = mount.querySelectorAll('.ln');
  var delays = Array.prototype.map.call(lines, function (el) {
    return el.style.animationDelay;
  });
  delays.reverse();
  lines.forEach(function (el, i) {
    el.style.animationDelay = delays[i];
  });

  mount.style.transition = 'opacity ' + (FADE_OUT / 1000) + 's ease';

  function loop() {
    mount.style.opacity = '0';
    setTimeout(function () {
      mount.style.transition = 'opacity ' + (FADE_IN / 1000) + 's ease';
      mount.style.opacity = '1';
      setTimeout(loop, FADE_IN + HOLD);
    }, FADE_OUT);
  }

  // Start loop after initial reveal finishes
  var initialReveal = 5600;
  setTimeout(loop, initialReveal + HOLD);
})();
