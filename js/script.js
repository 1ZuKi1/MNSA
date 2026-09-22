// Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо — сайтын скрипт
(function () {
  "use strict";

  // Mobile nav toggle
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.querySelector("nav.primary");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      toggle.classList.toggle("open");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.classList.remove("open");
      });
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove("open");
        toggle.classList.remove("open");
      }
    });
  }

  // Mark active nav link by current file name
  var here = (location.pathname.split("/").pop() || "index.html");
  document.querySelectorAll("nav.primary a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href === here || (here === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });

  // Reveal-on-scroll
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  // Copy-to-clipboard for contact values
  document.querySelectorAll("[data-copy]").forEach(function (el) {
    el.addEventListener("click", function () {
      var text = el.getAttribute("data-copy");
      var hint = el.parentElement.querySelector(".copy-hint");
      var done = function () {
        if (hint) {
          var original = hint.textContent;
          hint.textContent = "Хуулсан ✓";
          setTimeout(function () { hint.textContent = original; }, 1600);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {});
      }
    });
  });

  // Back-to-top button
  var toTop = document.querySelector(".to-top");
  if (toTop) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > 480) toTop.classList.add("show");
      else toTop.classList.remove("show");
    });
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Footer year
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
