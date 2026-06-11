(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none)').matches;

  /* ---------- Copyright year ---------- */
  var yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Mirror LINKS to data-link buttons (CTA section) ---------- */
  if (typeof LINKS !== 'undefined') {
    document.querySelectorAll('[data-link]').forEach(function (el) {
      var url = LINKS[el.getAttribute('data-link')];
      if (url) {
        el.href = url;
        el.rel = 'noopener noreferrer';
        el.removeAttribute('aria-disabled');
        el.classList.remove('btn-disabled');
      }
    });
  }

  /* ---------- Preloader (max ~1s) ---------- */
  var preloader = document.getElementById('preloader');
  if (preloader) {
    var hide = function () {
      preloader.classList.add('is-done');
    };
    if (document.readyState === 'complete') {
      setTimeout(hide, 350);
    } else {
      window.addEventListener('load', function () {
        setTimeout(hide, 250);
      });
      setTimeout(hide, 1000); // hard cap
    }
  }

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  /* ---------- Gold particles ---------- */
  var canvas = document.getElementById('particles');
  if (canvas && !reducedMotion) {
    var ctx = canvas.getContext('2d');
    var particles = [];
    var COUNT = isTouch ? 34 : 60;
    var running = true;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function makeParticle() {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 0.6 + Math.random() * 1.7,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.04 - Math.random() * 0.14,
        a: 0.08 + Math.random() * 0.3,
        tw: Math.random() * Math.PI * 2,
      };
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.012;
        if (p.y < -8 || p.x < -8 || p.x > canvas.width + 8) {
          particles[i] = makeParticle();
          particles[i].y = canvas.height + 6;
          continue;
        }
        var alpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(212, 175, 55, ' + alpha.toFixed(3) + ')';
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }

    resize();
    for (var i = 0; i < COUNT; i++) particles.push(makeParticle());
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(tick);
    });
    requestAnimationFrame(tick);
  }

  /* ---------- Magnetic buttons ---------- */
  if (!isTouch && !reducedMotion) {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var strength = 9;
      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        var dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        btn.style.transform =
          'translate(' + (dx * strength).toFixed(1) + 'px, ' + (dy * strength).toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* ---------- Ripple effect ---------- */
  document.querySelectorAll('[data-ripple]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (btn.classList.contains('btn-disabled')) return;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = e.clientX - rect.left - size / 2 + 'px';
      span.style.top = e.clientY - rect.top - size / 2 + 'px';
      btn.appendChild(span);
      setTimeout(function () {
        span.remove();
      }, 700);
    });
  });

  /* ---------- Feature card tilt ---------- */
  if (!isTouch && !reducedMotion) {
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      var maxTilt = 6;
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform =
          'perspective(800px) rotateX(' +
          (-py * maxTilt).toFixed(2) +
          'deg) rotateY(' +
          (px * maxTilt).toFixed(2) +
          'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  /* ---------- Showcase: 3D phone + screen cycling ---------- */
  var stage = document.getElementById('showcase-stage');
  var phone = document.getElementById('showcase-phone');
  if (stage && phone && !isTouch && !reducedMotion) {
    stage.addEventListener('mousemove', function (e) {
      var rect = stage.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      phone.style.transform =
        'rotateY(' + (px * 16).toFixed(2) + 'deg) rotateX(' + (-py * 10).toFixed(2) + 'deg)';
    });
    stage.addEventListener('mouseleave', function () {
      phone.style.transform = '';
    });
  }

  var panes = document.querySelectorAll('.app-pane');
  var dots = document.querySelectorAll('.showcase-dots button');
  var paneIdx = 0;
  var paneTimer = null;

  function showPane(idx) {
    panes.forEach(function (p, i) {
      p.classList.toggle('is-active', i === idx);
    });
    dots.forEach(function (d, i) {
      d.classList.toggle('is-active', i === idx);
    });
    paneIdx = idx;
  }

  function startPaneCycle() {
    if (paneTimer) clearInterval(paneTimer);
    if (reducedMotion) return;
    paneTimer = setInterval(function () {
      if (document.hidden) return;
      showPane((paneIdx + 1) % panes.length);
    }, 3800);
  }

  if (panes.length) {
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        showPane(i);
        startPaneCycle();
      });
    });
    startPaneCycle();
  }

  /* ---------- Count-up stats ---------- */
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var counterIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          counterIO.unobserve(entry.target);
          var el = entry.target;
          var target = parseInt(el.getAttribute('data-count'), 10);
          if (reducedMotion) {
            el.textContent = String(target);
            return;
          }
          var dur = 1400;
          var start = null;
          function step(ts) {
            if (!start) start = ts;
            var t = Math.min((ts - start) / dur, 1);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach(function (el) {
      counterIO.observe(el);
    });
  }

  /* ---------- Subtle hero parallax on scroll ---------- */
  if (!reducedMotion) {
    var heroInner = document.querySelector('.hero-inner');
    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (ticking || !heroInner) return;
        ticking = true;
        requestAnimationFrame(function () {
          var y = window.scrollY;
          if (y < window.innerHeight) {
            heroInner.style.transform = 'translateY(' + (y * 0.18).toFixed(1) + 'px)';
            heroInner.style.opacity = String(Math.max(1 - y / (window.innerHeight * 0.85), 0));
          }
          ticking = false;
        });
      },
      { passive: true }
    );
  }
})();
