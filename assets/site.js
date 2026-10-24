// Small interactions shared by every page. Without JS the pages are fully readable.
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NOISE = "█▓▒░<>/\\|=+*#%&01~^";

// Scramble an element's text through NOISE, then settle it left to right.
function decode(el, ms = 480) {
  if (still) return;
  const text = (el.dataset.text ??= el.textContent);
  const run = (el._run = (el._run || 0) + 1);
  const t0 = performance.now();
  const frame = (now) => {
    if (el._run !== run) return;
    const p = Math.min(1, (now - t0) / ms);
    const done = Math.floor(p * text.length * 1.15);
    el.textContent = [...text].map((c, i) =>
      i < done || c === " " ? c : NOISE[(Math.random() * NOISE.length) | 0]).join("");
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = text;
  };
  requestAnimationFrame(frame);
}

// A short burst on a .glitch element.
function tear(el, ms = 360) {
  if (still) return;
  el.classList.add("is-glitching");
  clearTimeout(el._tear);
  el._tear = setTimeout(() => el.classList.remove("is-glitching"), ms);
}

for (const el of document.querySelectorAll("[data-decode]")) {
  (el.closest("a") ?? el).addEventListener("pointerenter", () => decode(el));
}

// Headings glitch when hovered; the home-page name is driven by the scope instead.
for (const el of document.querySelectorAll(".glitch:not([data-scope])")) {
  (el.closest("a") ?? el).addEventListener("pointerenter", () => tear(el));
}

// Fade sections in as they arrive. The title of a page tears once on load.
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); seen.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll("[data-reveal]").forEach((el) => seen.observe(el));
const title = document.querySelector(".article h1 .glitch");
if (title) setTimeout(() => tear(title, 520), 250);

// The formula ticker drifts left and speeds up (and leans) with scroll velocity.
const belt = document.querySelector("[data-ticker]");
if (belt && !still) {
  belt.append(belt.firstElementChild.cloneNode(true));
  let lastY = scrollY, v = 0, x = 0;
  const loop = () => {
    v += (scrollY - lastY - v) * 0.1;
    lastY = scrollY;
    x -= 0.5 + Math.abs(v) * 0.3;
    const w = belt.firstElementChild.offsetWidth;
    belt.style.transform = `translate3d(${x % w}px,0,0) skewX(${Math.max(-10, Math.min(10, -v * 0.4))}deg)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
