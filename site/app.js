/* CevikEdit landing page behaviour.
   No dependencies, no tracking. Everything here is progressive enhancement:
   without JS the page reads and the download links still work. */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------------------------------------------------------------- nav -- */
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ------------------------------------------------------------- reveal -- */
  const reveals = [...document.querySelectorAll("[data-reveal]")].filter(
    (node) => node.getAttribute("data-reveal") !== "nav",
  );

  if (!("IntersectionObserver" in window) || reduceMotion.matches) {
    reveals.forEach((node) => node.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    reveals.forEach((node) => observer.observe(node));
  }

  /* -------------------------------------------------------------- curve -- */
  const board = document.querySelector(".curve-board");
  if (!board) return;

  const SIZE = 320;
  const PAD = 24;
  const SPAN = SIZE - PAD * 2;

  const path = document.getElementById("curve-path");
  const fillPath = document.getElementById("curve-fill-path");
  const dot = document.getElementById("curve-dot");
  const arm1 = document.getElementById("arm-1");
  const arm2 = document.getElementById("arm-2");
  const handle1 = document.getElementById("handle-1");
  const handle2 = document.getElementById("handle-2");
  const values = document.getElementById("curve-values");
  const caption = document.getElementById("curve-caption");
  const presets = [...document.querySelectorAll("[data-curve]")];

  const PRESETS = {
    soft: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
    snappy: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
    windup: { x1: 0.6, y1: -0.35, x2: 0.4, y2: 1.35 },
    linear: { x1: 0.33, y1: 0.33, x2: 0.67, y2: 0.67 },
  };

  let curve = { ...PRESETS.soft };
  let dragging = null;
  let frame = 0;
  let startTime = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /* Same solver as src/core/bezier.ts: Newton, then bisection. */
  const axis = (t, p1, p2) => {
    const u = 1 - t;
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
  };
  const slope = (t, p1, p2) => {
    const u = 1 - t;
    return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
  };
  const progress = (value) => {
    const target = clamp(value, 0, 1);
    if (target <= 0) return 0;
    if (target >= 1) return 1;
    const { x1, y1, x2, y2 } = curve;
    let t = target;
    for (let i = 0; i < 8; i += 1) {
      const x = axis(t, x1, x2) - target;
      if (Math.abs(x) < 1e-7) break;
      const m = slope(t, x1, x2);
      if (!Number.isFinite(m) || Math.abs(m) < 1e-6) break;
      t -= x / m;
      if (t < 0 || t > 1) break;
    }
    if (t < 0 || t > 1) {
      let low = 0;
      let high = 1;
      for (let i = 0; i < 40; i += 1) {
        t = (low + high) / 2;
        if (axis(t, x1, x2) < target) low = t;
        else high = t;
      }
    }
    return clamp(axis(t, y1, y2), -1, 2);
  };

  const screenX = (x) => PAD + x * SPAN;
  /* y is inverted: 0 sits on the bottom edge; overshoot leaves the box. */
  const screenY = (y) => PAD + (1 - y) * SPAN;

  function draw() {
    const { x1, y1, x2, y2 } = curve;
    const d = `M${screenX(0)},${screenY(0)} C${screenX(x1)},${screenY(y1)} ${screenX(
      x2,
    )},${screenY(y2)} ${screenX(1)},${screenY(1)}`;
    path.setAttribute("d", d);
    fillPath.setAttribute("d", `${d} L${screenX(1)},${screenY(0)} Z`);
    arm1.setAttribute("x2", screenX(x1));
    arm1.setAttribute("y2", screenY(y1));
    arm2.setAttribute("x2", screenX(x2));
    arm2.setAttribute("y2", screenY(y2));
    handle1.setAttribute("cx", screenX(x1));
    handle1.setAttribute("cy", screenY(y1));
    handle2.setAttribute("cx", screenX(x2));
    handle2.setAttribute("cy", screenY(y2));
    handle1.setAttribute("aria-valuetext", `${x1.toFixed(2)}, ${y1.toFixed(2)}`);
    handle2.setAttribute("aria-valuetext", `${x2.toFixed(2)}, ${y2.toFixed(2)}`);
    values.textContent = `${x1.toFixed(2)}, ${y1.toFixed(2)}, ${x2.toFixed(
      2,
    )}, ${y2.toFixed(2)}`;
    presets.forEach((button) => {
      const preset = PRESETS[button.dataset.curve];
      const active =
        preset &&
        ["x1", "y1", "x2", "y2"].every(
          (key) => Math.abs(preset[key] - curve[key]) < 0.005,
        );
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function stopPreview() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  /* One authored run along the curve whenever the shape changes. */
  function playPreview() {
    if (!caption) return;
    stopPreview();
    if (reduceMotion.matches) {
      caption.style.transform = "none";
      caption.style.opacity = "1";
      return;
    }
    const duration = 780;
    startTime = performance.now();
    const step = (now) => {
      const t = clamp((now - startTime) / duration, 0, 1);
      const eased = progress(t);
      caption.style.transform = `translateY(${(1 - eased) * 16}px) scale(${
        0.94 + eased * 0.06
      })`;
      caption.style.opacity = String(clamp(eased * 1.6, 0, 1));
      dot.setAttribute("cx", screenX(t));
      dot.setAttribute("cy", screenY(eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else frame = 0;
    };
    frame = requestAnimationFrame(step);
  }

  function pointerToCurve(event) {
    const rect = board.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * SIZE;
    return {
      x: clamp((x - PAD) / SPAN, 0, 1),
      y: clamp(1 - (y - PAD) / SPAN, -1, 2),
    };
  }

  /* Pointer capture lives on the window: the drag keeps tracking even when the
     cursor leaves the board, and no SVG capture quirk can swallow the moves. */
  function beginDrag(which, event) {
    event.preventDefault();
    dragging = which;
    const onMove = (move) => {
      if (!dragging) return;
      apply(dragging, pointerToCurve(move));
    };
    const onUp = () => {
      dragging = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      playPreview();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function apply(which, point) {
    if (which === 1) {
      curve.x1 = Math.min(point.x, curve.x2);
      curve.y1 = point.y;
    } else {
      curve.x2 = Math.max(point.x, curve.x1);
      curve.y2 = point.y;
    }
    draw();
  }

  handle1?.addEventListener("pointerdown", (event) => beginDrag(1, event));
  handle2?.addEventListener("pointerdown", (event) => beginDrag(2, event));

  /* Keyboard: 0.02 steps, shift for 0.1. */
  const keyStep = (which, event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const keys = {
      ArrowLeft: ["x", -step],
      ArrowRight: ["x", step],
      ArrowUp: ["y", step],
      ArrowDown: ["y", -step],
    };
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    const [axisName, delta] = move;
    const point = {
      x: which === 1 ? curve.x1 : curve.x2,
      y: which === 1 ? curve.y1 : curve.y2,
    };
    point[axisName] = clamp(
      point[axisName] + delta,
      axisName === "x" ? 0 : -1,
      axisName === "x" ? 1 : 2,
    );
    apply(which, { x: clamp(point.x, 0, 1), y: clamp(point.y, -1, 2) });
    playPreview();
  };

  handle1?.addEventListener("keydown", (event) => keyStep(1, event));
  handle2?.addEventListener("keydown", (event) => keyStep(2, event));

  presets.forEach((button) => {
    button.addEventListener("click", () => {
      const preset = PRESETS[button.dataset.curve];
      if (!preset) return;
      curve = { ...preset };
      draw();
      playPreview();
    });
  });

  reduceMotion.addEventListener?.("change", () => {
    if (reduceMotion.matches) stopPreview();
  });

  draw();
  if ("IntersectionObserver" in window) {
    const once = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          playPreview();
          once.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    once.observe(board);
  } else {
    playPreview();
  }
})();
