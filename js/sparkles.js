// Sparkles.js with Persistent Toggle
let sparklesEnabled = true; // Single global declaration
let sparkleInterval = null;
let animateInterval = null;
const sparkles = 50;
window.addEventListener('DOMContentLoaded', () => {
  const colour = "random";
  
  const colours = [
    "#ff0000", "#00ff00", "#ffffff", "#ff00ff",
    "#ffa500", "#ffff00", "#00ff00", "#ffffff", "#ff00ff"
  ];

  const maxFPS = 30;
  const enableOnMobile = false;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (isMobile && !enableOnMobile) return;

  let x = 0, y = 0, swide = window.innerWidth, shigh = window.innerHeight;
  let sleft = 0, sdown = 0, ox = 0, oy = 0;

  const tiny = [], star = [], starv = [], tinyv = [], starx = [], stary = [], tinyx = [], tinyy = [];

  function createDiv(height, width) {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.height = height + "px";
    div.style.width = width + "px";
    div.style.overflow = "hidden";
    return div;
  }

  function newColour() {
    const c = [255, Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)].sort(() => 0.5 - Math.random());
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function animate() {
    if (!sparklesEnabled) return;
    const o = window.pageYOffset;
    for (let i = 0; i < 10; i++) {
      const temp1 = document.getElementById("dots" + i).style;
      temp1.background = colours[Math.floor(Math.random() * colours.length)];
      if (i < 9) {
        const temp2 = document.getElementById("dots" + (i + 1)).style;
        temp1.top = temp2.top;
        temp1.left = temp2.left;
      } else {
        temp1.top = y + o + "px";
        temp1.left = x + "px";
      }
    }
  }

  function sparkle() {
    if (!sparklesEnabled) return;
    if (Math.abs(x - ox) > 1 || Math.abs(y - oy) > 1) {
      ox = x; oy = y;
      for (let c = 0; c < sparkles; c++) {
        if (!starv[c]) {
          star[c].style.pointerEvents = "none";
          star[c].style.left = (starx[c] = x) + "px";
          star[c].style.top = (stary[c] = y + 1) + "px";
          star[c].style.clip = "rect(0px, 5px, 5px, 0px)";
          const col = colour === "random" ? newColour() : colour;
          star[c].childNodes[0].style.backgroundColor = col;
          star[c].childNodes[0].style['box-shadow'] = `0 0 1px black`;
          star[c].childNodes[1].style.backgroundColor = col;
          star[c].childNodes[1].style['box-shadow'] = `0 0 1px black`;
          star[c].style.visibility = "visible";
          starv[c] = 50;
          break;
        }
      }
    }
    for (let c = 0; c < sparkles; c++) {
      if (starv[c]) update_star(c);
      if (tinyv[c]) update_tiny(c);
    }
  }

  function update_star(i) {
    if (--starv[i] === 25) star[i].style.clip = "rect(1px, 4px, 4px, 1px)";
    if (starv[i]) {
      stary[i] = Math.min(stary[i] + 1 + Math.random() * 3, shigh + sdown - 10);
      starx[i] += (i % 5 - 2) / 5;
      star[i].style.top = stary[i] + "px";
      star[i].style.left = starx[i] + "px";
    } else {
      tinyv[i] = 50;
      tiny[i].style.top = (tinyy[i] = stary[i]) + "px";
      tiny[i].style.left = (tinyx[i] = starx[i]) + "px";
      tiny[i].style.width = tiny[i].style.height = "2px";
      tiny[i].style.backgroundColor = star[i].childNodes[0].style.backgroundColor;
      star[i].style.visibility = "hidden";
      tiny[i].style.visibility = "visible";
    }
  }

  function update_tiny(i) {
    if (--tinyv[i] === 25) {
      tiny[i].style.width = "1px";
      tiny[i].style.height = "1px";
    }
    if (tinyv[i]) {
      tinyy[i] = Math.min(tinyy[i] + 1 + Math.random() * 3, shigh + sdown - 10);
      tinyx[i] += (i % 5 - 2) / 5;
      tiny[i].style.top = tinyy[i] + "px";
      tiny[i].style.left = tinyx[i] + "px";
    } else {
      tiny[i].style.visibility = "hidden";
    }
  }

  function set_scroll() {
    sdown = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    sleft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  }

  function set_width() {
    swide = window.innerWidth;
    shigh = window.innerHeight;
  }

  function clearAllSparkles() {
    for (let i = 0; i < sparkles; i++) {
      if (star[i]) {
        star[i].style.visibility = "hidden";
        starv[i] = 0;
      }
      if (tiny[i]) {
        tiny[i].style.visibility = "hidden";
        tinyv[i] = 0;
      }
    }
  }

  // Event listeners
  window.addEventListener("scroll", set_scroll);
  window.addEventListener("resize", () => {
    set_width();
    clearAllSparkles();
  });
  window.addEventListener("mousemove", e => { x = e.pageX; y = e.pageY; });

  // Sparkle toggle logic
  const toggleButton = document.createElement("button");
  toggleButton.textContent = "✦";
  toggleButton.style.position = "fixed";
  toggleButton.style.bottom = "10px";
  toggleButton.style.right = "10px";
  toggleButton.style.zIndex = "1000";
  toggleButton.style.padding = "8px 12px";
  toggleButton.style.borderRadius = "8px";
  toggleButton.style.border = "none";
  toggleButton.style.backgroundColor = "#333";
  toggleButton.style.color = "#fff";
  toggleButton.style.cursor = "pointer";
  document.body.appendChild(toggleButton);

  function toggleSparkles(enabled) {
    sparklesEnabled = enabled;
    localStorage.setItem("sparkles", enabled ? "enabled" : "disabled");

    for (let i = 0; i < sparkles; i++) {
      if (tiny[i]) tiny[i].style.visibility = enabled ? "visible" : "hidden";
      if (star[i]) star[i].style.visibility = enabled ? "visible" : "hidden";
    }

    if (enabled) {
      if (!sparkleInterval) sparkleLoop();
      if (!animateInterval) animateLoop();
    } else {
      clearTimeout(sparkleInterval);
      clearTimeout(animateInterval);
      sparkleInterval = null;
      animateInterval = null;
    }
  }

  function sparkleLoop() {
    if (!sparklesEnabled) return;
    sparkle();
    sparkleInterval = setTimeout(sparkleLoop, 40);
  }

  function animateLoop() {
    if (!sparklesEnabled) return;

    animateInterval = setTimeout(animateLoop, 1000 / maxFPS);
  }

  toggleButton.addEventListener("click", () => {
    toggleSparkles(!sparklesEnabled);
  });

  // Create stars and run based on saved preference
  window.onload = function () {
    for (let i = 0; i < sparkles; i++) {
      tiny[i] = createDiv(3, 3);
      tiny[i].style.visibility = "hidden";
      tiny[i].style.zIndex = "999";
      document.body.appendChild(tiny[i]);

      starv[i] = 0; tinyv[i] = 0;
      const starDiv = createDiv(5, 5);
      starDiv.style.backgroundColor = "transparent";
      starDiv.style.visibility = "hidden";
      starDiv.style.zIndex = "999";

      const rlef = createDiv(1, 5);
      const rdow = createDiv(5, 1);
      rlef.style.top = "2px"; rlef.style.left = "0px";
      rdow.style.top = "0px"; rdow.style.left = "2px";
      starDiv.appendChild(rlef);
      starDiv.appendChild(rdow);
      document.body.appendChild(star[i] = starDiv);
    }

    set_width();

    const saved = localStorage.getItem("sparkles");
    toggleSparkles(saved !== "disabled");
  };

  // Create dots for trail effect
  for (let i = 0; i < 10; i++) {
    const dot = document.createElement("div");
    dot.id = "dots" + i;
    dot.style.position = "absolute";
    dot.style.width = dot.style.height = dot.style.fontSize = (i / 2) + "px";
    dot.style.top = dot.style.left = "0px";
    dot.style.background = "#ff0000";
    document.body.appendChild(dot);
  }
});
