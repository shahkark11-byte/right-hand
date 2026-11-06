// Nav highlight and reveal-on-scroll. No libraries.
(function () {
  var secs = document.querySelectorAll('main section[id]');
  var links = {};
  document.querySelectorAll('.nav nav a').forEach(function (a) {
    links[a.getAttribute('href').slice(1)] = a;
  });
  // "others" (section 8) sits under Costs in the nav
  links.others = links.costs;

  if (!('IntersectionObserver' in window)) {
    secs.forEach(function (s) { s.classList.add('in'); });
    return;
  }

  var reveal = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  secs.forEach(function (s) { reveal.observe(s); });

  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      Object.keys(links).forEach(function (k) { links[k].classList.remove('active'); links[k].removeAttribute('aria-current'); });
      var a = links[e.target.id];
      if (a) { a.classList.add('active'); a.setAttribute('aria-current', 'true'); }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  secs.forEach(function (s) { spy.observe(s); });
})();
