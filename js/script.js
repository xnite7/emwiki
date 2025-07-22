let imgg;

const modalCache = {
  modal: document.getElementById("product-modal"),
  popo: document.getElementById("popo"),
  content: document.getElementById("modal-content"),
  title: document.getElementById("modal-title"),
  prc: document.getElementById("modal-prc"),
  description: document.getElementById("modal-description"),
  price: document.getElementById("modal-price-value"),
  retired: document.getElementById("modal-retired"),
  premium: document.getElementById("modal-premium"),
  untradable: document.getElementById("modal-untradable")
};

if (document.querySelector('.intro')) {

  window.scrollTo(0, 0);
  let intro = document.querySelector('.intro');
  let logo = document.querySelector('.logo-header');
  let logo3 = document.querySelector('.logo3');
  let xnite = document.querySelector('.credit');

  let logoSpan = document.querySelectorAll('.logo');
  var d = Math.random();

  if (d > 0.99) {
    imgg = "./imgs/burrito.png"
  } else if (d > 0.98) {
    imgg = "./imgs/tran.webp"
  } else if (d > 0.9) {
    imgg = "./imgs/o7IJiwl.png"
  } else {
    imgg = "./imgs/XRmpB1c.png"
  }
  logo3.src = imgg
  window.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector(".sparkle")) { document.querySelector(".sparkle").style.opacity = "0"; }
    let logo4 = document.querySelector('.logo4')
    logo4.src = imgg
    let header = document.querySelector('.headersheet')
    document.fonts.ready.then(() => {


      setTimeout(() => {
        window.scrollTo(0, 0);
        logoSpan.forEach((span, idx) => {
          setTimeout(() => {
            span.classList.add('active')
            logo3.classList.add('active')
            document.body.classList.add('fonts-loaded');
          }, (idx + 1) * 400)
        });
        xnite.style.color = "#000000b0";
        setTimeout(() => {
          logoSpan.forEach((span, idx) => {
            window.scrollTo(0, 0);

            setTimeout(() => {
              span.classList.remove('active')
              span.classList.add('fade')
              logo3.classList.remove('active')
              logo3.classList.add('fade')

            }, (idx + 1) * 20)
          })
        }, 2100)

        setTimeout(() => {
          window.scrollTo(0, 0);
          const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

          if (isTouch) {
            document.querySelector(".parallax-bg").style.backgroundSize = "auto 104vh"

          } else {
            document.querySelector(".parallax-bg").style.backgroundSize = "124vw auto"

          }

          intro.style['transition'] = "0.5s"

        }, 2000)


        setTimeout(() => {
          logo.style.scale = "1.2"
          intro.style.backdropFilter = 'blur(0px)'
          intro.style.filter = 'opacity(0) blur(9px)'
          document.documentElement.style.overflow = "scroll"
          document.documentElement.style.overflowX = "hidden"
          xnite.style.color = "#ffffffb0";
          document.querySelector(".sparkle").style.opacity = "1"


        }, 2440)
        setTimeout(() => {
          intro.style.top = "-100vh"
          header.style.opacity = "1"
          let main = document.querySelector("main");
          main.style.scale = "1"
          main.style.filter = 'opacity(1)'

        }, 2800)
        setTimeout(() => {
          const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

          if (!isTouch) {
            document.querySelector(".parallax-bg").style.transition = "none";
          } else {
            document.querySelector(".parallax-bg").style.transition = "transform 0.1s ease-out, opacity 0.2s ease";
          }
          // intro.style.display = "none"
        }, 3700)

        setTimeout(() => {
          xnite.style.color = "#ffffff00";
        }, 5600)
      })
    });
  })





  function fetchDonations() {
  const donatorsList = document.getElementById('donators-list');
  if (!donatorsList) return;

  const loadDonations = () => {
    fetch('/api/donations')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch donation data');
        return res.json();
      })
      .then(data => {
        donatorsList.innerHTML = '';
        const topDonators = data.sort((a, b) => b.amount - a.amount).slice(0, 5);
        topDonators.forEach(user => {
          const li = document.createElement('li');
          const img = document.createElement('img');
          img.src = user.avatar || 'https://emwiki.site/imgs/plr.jpg';
          img.alt = user.displayName || user.name || 'User avatar';
          img.className = 'avatar';
          li.appendChild(img);
          li.appendChild(document.createTextNode(`${user.username} — ${user.amount} Robux`));
          donatorsList.appendChild(li);
        });
      })
      .catch(err => {
        console.error('Error fetching donations:', err);
        donatorsList.innerHTML = '<li>Error loading donators</li>';
      });
  };

  // Use requestIdleCallback or fallback to setTimeout
  if (window.requestIdleCallback) {
    requestIdleCallback(loadDonations, { timeout: 2000 });
  } else {
    setTimeout(loadDonations, 100);
  }
}

// Call fetchDonations when DOM is ready
document.addEventListener('DOMContentLoaded', fetchDonations);



  // Modal toggling
  const donateBtn = document.getElementById('donate-btn');
  const donateModal = document.getElementById('donate-modal');
  const closeModalBtn = document.getElementById('close-donate-modal');
  const modalOverlay = document.getElementById('modal-overlay');

  donateBtn.onclick = () => {
    donateModal.style.display = 'block';
    modalOverlay.style.display = 'block';
  };

  closeModalBtn.onclick = () => {
    donateModal.style.display = 'none';
    modalOverlay.style.display = 'none';
  };

  modalOverlay.onclick = () => {
    donateModal.style.display = 'none';

    modalOverlay.style.display = 'none';
  };


  const installBtn = document.getElementById('installBtn');
  const iosPopup = document.getElementById('iosInstallPopup');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  let deferredPrompt;

  // Show button only if not already installed
  if (!(isIOS && isStandalone)) {
    installBtn.style.display = 'inline';
  }

  // Show real install prompt on Android/desktop
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!isIOS) {
      installBtn.style.display = 'inline';
    }

    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        installBtn.style.display = 'none';
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Install outcome: ${outcome}`);
        deferredPrompt = null;

        if (outcome === 'dismissed') {
          installBtn.style.display = 'inline';
        } else {
          installBtn.style.display = 'none';
        }
      }
    });
  });

  // Show animated popup for iOS users
  if (isIOS && !isStandalone) {
    installBtn.addEventListener('click', () => {
      iosPopup.style.display = 'block';
      requestAnimationFrame(() => {
        iosPopup.style.bottom = '20px';
        iosPopup.style.opacity = '1';
      });

      // Auto-hide after 8 seconds
      setTimeout(() => {
        hideIosPopup();
      }, 8000);
    });
  }

  function hideIosPopup() {
    iosPopup.style.bottom = '-150px';
    iosPopup.style.opacity = '0';
    setTimeout(() => {
      iosPopup.style.display = 'none';
    }, 600);
  }
  const creditsmodal = document.getElementById("credits-modal");
  const content = document.getElementById("credits-content");
  const button = document.getElementById("credits-button");
  const close = document.getElementById("close-credits");

  const isTouche = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Show modal
  function showModal(e) {
    creditsmodal.style.display = "block";
    creditsmodal.style.pointerEvents = "auto";

    if (!isTouche) {
      // Position near mouse on desktop
      const x = button.getBoundingClientRect().left - content.getBoundingClientRect().width;
      const y = button.getBoundingClientRect().top - 30;
      content.style.position = "absolute";
      content.style.left = `${x}px`;
      content.style.top = `${y}px`;
      close.style.display = "none";
      creditsmodal.style.padding = "0";
    } else {
      // Fullscreen on mobile with blur background
      creditsmodal.style.position = "fixed";
      creditsmodal.style.top = "0";
      creditsmodal.style.left = "0";
      creditsmodal.style.width = "-webkit-fill-available";
      creditsmodal.style.height = "-webkit-fill-available";
      creditsmodal.style.backdropFilter = "blur(6px)";
      creditsmodal.style.backgroundColor = "rgba(0,0,0,0.5)";
      content.style.position = "relative";
      content.style.margin = "60px auto";
    }
  }

  // Close modal
  function hideModal() {
    creditsmodal.style.display = "none";
    creditsmodal.style.pointerEvents = "none";
  }

  // Events
  button.addEventListener("touchend", (e) => {
    showModal(e);
  });
  button.addEventListener("mouseover", (e) => {
    if (!isTouche) showModal(e);
  });
  button.addEventListener("mouseout", (e) => {
    if (!isTouche) hideModal();
  });
  close.addEventListener("click", hideModal);
  creditsmodal.addEventListener("click", (e) => {
    if (e.target === creditsmodal) hideModal();
  });

  const bg = document.querySelector('.parallax-bg');
  const isTouchr = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (!isTouchr) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      bg.style.transform = `translateY(${scrollY * -0.4}px)`;

      const fadePoint = 2500;
      const opacity = Math.max(0, 1 - scrollY / fadePoint);
      bg.style.opacity = opacity.toFixed(2);
    });
  }

  const API_URL = 'https://emwiki-poll.xnite7.workers.dev/api/poll';
  const pollResult = document.getElementById('pollResult');
  const pollTotals = document.getElementById('pollTotals');
  const voteButtons = document.querySelectorAll('.vote-button');

  // Check if user already voted using localStorage
  const alreadyVoted = localStorage.getItem('hasVoted') === 'true';

  function disableVoting(message) {
    voteButtons.forEach(btn => { btn.style.display = "none"; btn.disabled = true });

    pollResult.textContent = message;
    pollResult.style.display = 'block';
  }

  async function fetchResults() {
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      pollTotals.textContent = `👍 ${data.like} · 👎 ${data.dislike}`;
    } catch {
      pollTotals.textContent = '⚠️ Error loading poll results.';
    }
  }

  async function submitVote(vote) {
    if (alreadyVoted) return;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote })
      });

      if (res.status === 403) {
        disableVoting('You have already voted.');
        document.querySelector('.poll-box').style.display = 'none'
      } else if (res.ok) {
        disableVoting('Thanks for voting!');
      } else {
        pollResult.textContent = 'Error submitting vote.';
        pollResult.style.display = 'block';
        return;
      }

      localStorage.setItem('hasVoted', 'true');
      await fetchResults();
    } catch {
      pollResult.textContent = 'Network error.';
      pollResult.style.display = 'block';
    }
  }

  // Attach click handlers
  voteButtons.forEach(button => {
    button.addEventListener('click', () => {
      const vote = button.getAttribute('data-vote');
      submitVote(vote);
    });
  });

  // Init on load
  if (alreadyVoted) {
    disableVoting('You have already voted.');
    document.querySelector('.poll-box').style.display = 'none'
  }

  const countdownEl = document.getElementById("countdown");
  const countdownEl2 = document.getElementById("countdown2");

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;


  const baseStart = new Date(Date.UTC(2025, 4, 24, 24));
  const baseStart2 = new Date(Date.UTC(2025, 4, 29, 24));

  let cachedUTC = null;
  let cachedAt = 0;

  async function getAccurateUTC() {
    const now = Date.now();
    // Use cached value if less than 5 minutes old
    if (cachedUTC && (now - cachedAt < 5 * 60 * 1000)) {
      // Add the elapsed time since last fetch
      return new Date(cachedUTC.getTime() + (now - cachedAt));
    }
    try {
      const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text);
      }
      cachedUTC = new Date(data.utc_datetime);
      cachedAt = Date.now();
      return cachedUTC;
    } catch (e) {
      // Fallback: use device time as UTC (not perfect, but better than nothing)
      console.warn("Falling back to device UTC time:", e);
      return new Date(Date.now());
    }
  }

  let lastUTC = null;
  let lastUTCAt = 0;

  async function syncUTC() {
    lastUTC = await getAccurateUTC();
    lastUTCAt = Date.now();
  }

  function getCurrentUTC() {
    if (!lastUTC) return new Date(Date.now());
    const now = Date.now();
    return new Date(lastUTC.getTime() + (now - lastUTCAt));
  }

  function updateCountdown() {
    const utcNow = getCurrentUTC();

    const elapsed = utcNow - baseStart;
    const elapsed2 = utcNow - baseStart2;
    const timeIntoCurrentCycle = elapsed % WEEK_MS;
    const timeIntoCurrentCycle2 = elapsed2 % WEEK_MS;

    const timeLeft = WEEK_MS - timeIntoCurrentCycle;
    const timeLeft2 = WEEK_MS - timeIntoCurrentCycle2;

    countdownEl.style.color = timeLeft < SIX_HOURS_MS ? "#ff9999" : "#cccccc";
    countdownEl2.style.color = timeLeft2 < SIX_HOURS_MS ? "#ff9999" : "#cccccc";

    const formatTime = (ms) => {
      const totalSeconds = Math.floor(ms / 1000);
      const days = Math.floor(totalSeconds / (24 * 3600));
      const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const pad = (n) => n.toString().padStart(2, '0');
      return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    };

    countdownEl.textContent = formatTime(timeLeft);
    countdownEl2.textContent = formatTime(timeLeft2);
  }

  // Initial sync
  updateCountdown();


  //after everything is loaded, run this
  window.addEventListener('load', () => {
    const container = document.getElementById('top-donators');
    const canvas = document.getElementById('tentacles-canvas');
    const ctx = canvas.getContext('2d');
    const btn = document.getElementById('donate-btn');

    let w, h;
    let centerX, centerY;

    const tentaclesCount = 8;
    const maxTentacleLength = 120;
    const suckerCount = 6;

    let animationProgress = 0;
    let targetProgress = 0;

    let isActive = false; // new flag for glowing tentacles

    function resize() {
      w = canvas.width = container.clientWidth;
      h = canvas.height = container.clientHeight;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      centerX = w / 2;
      centerY = h / 2;
    }

    window.addEventListener('resize', resize);
    resize();

    function cubicBezier(p0, p1, p2, p3, t) {
      const mt = 1 - t;
      return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
    }

    function getBezierPoint(path, t) {
      const { startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY } = path;
      const x = cubicBezier(startX, cp1X, cp2X, endX, t);
      const y = cubicBezier(startY, cp1Y, cp2Y, endY, t);
      return { x, y };
    }

    function getTentaclePath(baseAngle, progress, time) {
      const length = maxTentacleLength * progress;

      const startX = centerX;
      const startY = centerY;

      const endX = centerX + Math.cos(baseAngle) * length;
      const endY = centerY + Math.sin(baseAngle) * length;

      const waveAmplitude = progress > 0 ? 15 : 0;
      const waveFreq = 3;

      const cp1Dist = length * 0.4 * progress;
      const cp2Dist = length * 0.7 * progress;

      const cp1Angle = baseAngle - Math.PI / 4 + (progress * Math.sin(time * waveFreq) * 0.3);
      const cp2Angle = baseAngle + Math.PI / 4 + (progress * Math.cos(time * waveFreq + Math.PI / 2) * 0.3);

      const cp1X = centerX + Math.cos(cp1Angle) * cp1Dist + Math.sin(time * waveFreq) * waveAmplitude * progress;
      const cp1Y = centerY + Math.sin(cp1Angle) * cp1Dist + Math.cos(time * waveFreq) * waveAmplitude * progress;

      const cp2X = centerX + Math.cos(cp2Angle) * cp2Dist + Math.cos(time * waveFreq) * waveAmplitude * progress;
      const cp2Y = centerY + Math.sin(cp2Angle) * cp2Dist + Math.sin(time * waveFreq) * waveAmplitude * progress;

      return { startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY };
    }

    function drawTentacle(path, time) {
      ctx.lineWidth = 6;

      if (isActive) {
        // Gold glow style
        ctx.shadowColor = 'gold';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'; // gold
      } else {
        ctx.shadowColor = 'rgba(150, 100, 255, 0.6)';
        ctx.shadowBlur = 6;
        const grad = ctx.createLinearGradient(path.startX, path.startY, path.endX, path.endY);
        grad.addColorStop(0, 'rgba(128,0,128,0.8)');
        grad.addColorStop(1, 'rgba(255,0,255,0.5)');
        ctx.strokeStyle = grad;
      }

      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(path.startX, path.startY);
      ctx.bezierCurveTo(path.cp1X, path.cp1Y, path.cp2X, path.cp2Y, path.endX, path.endY);
      ctx.stroke();

      // Draw suckers
      for (let i = 1; i <= suckerCount; i++) {
        const t = i / (suckerCount + 1);
        const pos = getBezierPoint(path, t);
        const suckerRadius = 4 + Math.sin(time * 10 + i) * 1;

        ctx.beginPath();
        ctx.fillStyle = isActive ? 'rgba(255, 223, 100, 0.8)' : 'rgba(200,150,255,0.7)';
        ctx.shadowColor = isActive ? 'rgba(255, 215, 0, 0.8)' : 'rgba(150,100,255,0.6)';
        ctx.shadowBlur = isActive ? 10 : 4;
        ctx.arc(pos.x, pos.y, suckerRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function animate(time = 0) {
      ctx.clearRect(0, 0, w, h);

      const speed = 0.05;
      animationProgress += (targetProgress - animationProgress) * speed;

      if (animationProgress > 0.01) {
        for (let i = 0; i < tentaclesCount; i++) {
          const baseAngle = (i / tentaclesCount) * Math.PI * 2;
          const path = getTentaclePath(baseAngle, animationProgress, time / 1000);
          drawTentacle(path, time / 1000);
        }
      }

      requestAnimationFrame(animate);
    }

    animate();

    btn.addEventListener('mouseenter', () => {
      targetProgress = 1;
    });

    btn.addEventListener('mouseleave', () => {
      targetProgress = 0;
    });

    btn.addEventListener('mousedown', () => {
      isActive = true;
    });

    btn.addEventListener('mouseup', () => {
      isActive = false;
    });

    btn.addEventListener('mouseleave', () => {
      isActive = false;
    });

  });

  document.querySelector('a[href="#patchnotes"]').addEventListener("click", (e) => {
    const patch = document.getElementById("patchnotes");

    // Remove and re-add class to retrigger animation
    patch.classList.remove("animate");
    void patch.offsetWidth; // force reflow
    patch.classList.add("animate");
  });

  // Fix 100vh on iOS by setting --vh to actual visible height
  function updateVh() {
    // Get the actual visible height
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
  };



  // Run it after layout is ready

  window.addEventListener('load', debounce(updateVh, 100));
  window.addEventListener('resize', debounce(updateVh, 100));
  window.addEventListener('orientationchange', debounce(updateVh, 100));


  // Optional: Run again after slight delay to handle iOS animation quirks
  setTimeout(updateVh, 500);

} else {
  document.documentElement.style.overflow = "scroll"
  document.documentElement.style.overflowX = "hidden"
  let main = document.querySelector("main");
  if (main.style.scale == '1') {
    main.style.filter = 'opacity(1)'
  }
}
window.addEventListener('DOMContentLoaded', () => {



  const navButtons = [
    { id: "gearstab", href: "./gears", img: "./imgs/AYUbTJv.png" },
    { id: "deathstab", href: "./deaths", img: "./imgs/fADZwOh.png" },
    { id: "petstab", href: "./pets", img: "./imgs/GHXB0nC.png" },
    { id: "effectstab", href: "./effects", img: "./imgs/l90cgxf.png" },
    { id: "titlestab", href: "./titles", img: "./imgs/ZOP8l9g.png" },
    { id: "cheststab", href: "./chests", img: "./imgs/XwkWVJJ.png" },
    { id: "scammerstab", href: "./scammers", img: "./imgs/SK5csOS.png" },
    { id: "gamenightstab", href: "./gamenights", img: "./imgs/gn.png" }
  ];

  function insertNavButtons() {
    const nav = document.querySelector("nav");
    if (!nav) return;
    // Get current page filename, default to "index" if blank
    let current = location.pathname.split('/').pop();
    if (!current || current === "") current = "index";
    nav.innerHTML = navButtons
      .filter(btn => !btn.href.endsWith(current.replace('.html', '')))
      .map(btn =>
        `<a id="${btn.id}" href="${btn.href}"><img src="${btn.img}" style="max-width: -webkit-fill-available;" draggable="false" display="none" onmousedown="return false"></a>`
      ).join('\n');
  }
  insertNavButtons()





  const leftArrow = document.createElement("div");
  leftArrow.id = "modal-left-arrow";
  leftArrow.className = "modal-arrow";
  leftArrow.innerHTML = "&#8592;";
  modalCache.modal.appendChild(leftArrow);

  const rightArrow = document.createElement("div");
  rightArrow.id = "modal-right-arrow";
  rightArrow.className = "modal-arrow";
  rightArrow.innerHTML = "&#8594;";
  modalCache.modal.appendChild(rightArrow);

  // Mobile swipe support for modal navigation
  let touchStartX = 0;
  let touchEndX = 0;

  modalCache.content.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, false);

  modalCache.content.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
  }, false);

  let arrowTimeout;

  function showModalArrows() {
    document.getElementById("modal-left-arrow").classList.add("show");
    document.getElementById("modal-right-arrow").classList.add("show");
    showSwipeTutorial()
    clearTimeout(arrowTimeout);
    arrowTimeout = setTimeout(() => {
      document.getElementById("modal-left-arrow").classList.remove("show");
      document.getElementById("modal-right-arrow").classList.remove("show");
    }, 2000); // hide after 2s of inactivity
  };

  // Show arrows when modal opens
  const originalModal = Modal;
  Modal = function () {
    originalModal.apply(this, arguments); // preserve original logic
    showModalArrows();
  };

  // Show arrows on mouse move/hover over modal
  modalCache.modal.addEventListener("mousemove", showModalArrows);
  modalCache.modal.addEventListener("touchstart", showModalArrows); // for quick re-show on touch




  const refreshBtn = document.getElementById('refresh-button');
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      refreshBtn.children[0].style.animation = "";
      refreshBtn.children[0].style.webkitAnimation = "";
      setTimeout(() => {
        refreshBtn.children[0].style.animation = "rotate 0.7s ease-in-out 0s 1 alternate";
        refreshBtn.children[0].style.webkitAnimation = "rotate 0.7s ease-in-out 0s 1 alternate";
      }, 50);
      // Only refresh random grid, not the whole page!
      randomGridPopulate(window._randomArr, window._randomCategoryColors);
    };
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      openSiblingModal("next");
    } else if (event.key === "ArrowLeft") {
      openSiblingModal("prev");
    }
  });

  document.getElementById("modal-left-arrow").addEventListener("click", () => {
    openSiblingModal("prev");
  });

  document.getElementById("modal-right-arrow").addEventListener("click", () => {
    openSiblingModal("next");
  });

  function handleSwipeGesture() {
    const delta = touchEndX - touchStartX;
    const threshold = 50; // minimum px to be considered swipe

    if (Math.abs(delta) > threshold) {
      if (delta < 0) {
        openSiblingModal("next");
      } else {
        openSiblingModal("prev");
      }
    }
  }
})


// Simplified modal interaction logic
let isModalOpen = false;

// DRY utility for modal navigation
function openSiblingModal(direction) {
  const currentItem = document.querySelector(".item.showing");
  if (!currentItem) return;
  const sibling = direction === "next"
    ? currentItem.nextElementSibling
    : currentItem.previousElementSibling;
  if (sibling && sibling.classList.contains("item")) {
    isModalOpen = false;

    closeModalHandler();
    setTimeout(() => {
      sibling.click();
    }, 90);
  }
}


function Modal(event) {
  if (isModalOpen) return;
  const item = event.target.closest(".item");
  if (!item) return;

  modalCache.retired.style.visibility = "hidden";
  modalCache.premium.style.visibility = "hidden";
  modalCache.untradable.style.visibility = "hidden";

  //if found untradable icon, then show untradable modal
  if (item.querySelector(".untradable")) {
    modalCache.untradable.style.visibility = "visible";
  }
  //if found premium icon, then show premium modal
  if (item.querySelector(".premium")) {
    modalCache.premium.style.visibility = "visible";
  }
  //if found retired icon, then show retired modal
  if (item.querySelector(".retired")) {
    modalCache.retired.style.visibility = "visible";
  }


  document.querySelectorAll(".item").forEach((el) => el.classList.remove("showing"));
  item.classList.add("showing");

  const title = item.querySelector("#h3").textContent;
  const imageSrc = item.dataset.image;
  const from = item.querySelector("#from").textContent.replace(/<br>/g, "\n");
  const prcdra = item.querySelector("#pricecoderarity").textContent;
  const price = item.querySelector("p img").nextSibling.textContent.trim();

  modalCache.content.style.pointerEvents = "none";
  modalCache.content.style.backgroundColor = item.style.backgroundColor;
  modalCache.title.textContent = title;
  const existingCanvas = modalCache.content.querySelector("#content-area canvas");
  if (existingCanvas) existingCanvas.remove();

  if (imageSrc) {


    const canvas = document.createElement("canvas");
    canvas.style.zIndex = "99";
    Object.assign(canvas.style, {
      width: "100%",
      height: "auto",
      placeSelf: "center",
      display: "block",
      userSelect: "none",
      webkitUserSelect: "none",
      pointerEvents: "none"
    });

    modalCache.content.querySelector("#content-area").insertBefore(canvas, modalCache.description);

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageSrc;
  }

  modalCache.description.textContent = from;
  modalCache.price.setAttribute("draggable", false);
  modalCache.title.style.display = item.id === "titles" ? "none" : "block";

  modalCache.content.querySelectorAll(".font").forEach((el) => el.remove());

  const bgColors = {
    pets: "rgb(39, 102, 221)",
    effects: "rgb(243, 164, 37)",
    deaths: "rgb(221, 89, 62)",
    titles: "rgb(154, 45, 209)",
    gears: "rgb(55, 205, 68)"
  };

  if (bgColors[item.id]) {
    modalCache.content.style.backgroundColor = bgColors[item.id];
  }

  if (!imageSrc) {
    const clone = item.querySelector("#h3").cloneNode(true);
    Object.assign(clone.style, {
      height: "100%",
      paddingTop: "4px",
      zoom: "2",
      width: "-webkit-fill-available",
      zIndex: "22",
      margin: "31px 0px 46px 0px",
      alignSelf: "center",
      position: "relative",
      alignContent: "center"
    });
    if (clone.children.length > 0) {
      Object.assign(clone.children[0].style, {
        height: "97%",
        position: "absolute",
        placeContent: "center",
        width: "inherit",
      });
    }
    clone.classList.add("font");
    modalCache.content.querySelector("#content-area").insertBefore(clone, modalCache.description);
  }

  const splitted = prcdra.split("<br>");


  // Remove duplicates but keep the first occurrence
  const seen = new Set();
  const uniqueLines = splitted.filter(line => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  modalCache.price.src = "./imgs/trs.png";
  const modalText = modalCache.price.nextSibling;
  if (modalText) {
    modalText.textContent = uniqueLines[0];
    Object.assign(modalText.style, {
      color: "#e1e1e1",
      fontSize: "30px",
      fontWeight: 400,
      textStroke: "",
      webkitTextStroke: "",
      textShadow: ""
    });
  }

  modalCache.popo.parentElement.querySelectorAll(".price").forEach((el, idx) => {
    if (idx > 0) el.remove();
  });

  uniqueLines.slice(1).forEach((line) => {
    const newPrice = modalCache.popo.cloneNode(true);
    newPrice.childNodes[1].textContent = line;
    modalCache.popo.parentElement.appendChild(newPrice);
  });

  modalCache.popo.parentElement.querySelectorAll(".price").forEach((priceEl) => {
    const children = priceEl.children;
    if (children.length > 1) {
      const text = children[1].textContent;
      if (!text) return priceEl.style.display = "none";

      if (text.includes("Tokens")) {
        Object.assign(children[1].style, { fontWeight: 500, textStroke: "1px rgb(255, 83, 219)", webkitTextStroke: "1px rgb(255, 83, 219)" });
      }
      if (text.includes("Robux")) {
        Object.assign(children[1].style, { fontWeight: 700 });
      }

      const iconMap = {
        Robux: "./imgs/cf8ZvY7.png",
        Coins: "./imgs/Coin.webp",
        Stars: "./imgs/WKeX5AS.png",
        Visors: "./imgs/7IoLZCN.png",
        Pumpkins: "./imgs/bHRBTrU.png",
        Eggs: "./imgs/qMxjgQy.png",
        Opals: "./imgs/wwMMAvr.png",
        Opal: "./imgs/wwMMAvr.png",
        Baubles: "./imgs/bauble.png",
        Bauble: "./imgs/bauble.png",
        Tokens: "./imgs/Cy9r140.png",
        Token: "./imgs/Cy9r140.png"
      };

      for (const [key, src] of Object.entries(iconMap)) {
        if (text.includes(key)) {
          children[1].textContent = text.replace(` ${key}`, "");
          children[0].src = src;
          break;
        }
      }
      Object.assign(children[1].style, { fontFamily: "BuilderSans" });
      if (text.includes("%")) {
        children[1].style.color = "rgb(193 68 255)";
        children[1].style.fontWeight = 500;
        children[1].style.textShadow = "0 0 6px rgb(199 0 255)";
      } else if (text.includes("[EXPIRED]")) {
        Object.assign(children[1].style, { fontFamily: "monospace", fontSize: "23px", color: "#cd1f1f" });
      } else if (text.includes("[ACTIVE]")) {
        Object.assign(children[1].style, { fontFamily: "monospace", fontSize: "23px", color: "rgb(251 255 68)" });
      } else if (text.includes("Unobtainable")) {
        children[0].src = "./imgs/Red_x.png";
        children[1].style.color = "rgb(255 44 44)";
      }

      priceEl.style.display = children[1].textContent ? "flex" : "none";
    }
  });

  modalCache.prc.innerHTML = `<img src="./imgs/iZGLVYo.png" style="height: 37px;">${price || 0}`;

  // Show the modal with animation
  const itemRect = item.getBoundingClientRect();
  modalCache.modal.style.display = "flex";
  modalCache.modal.classList.add("show");
  isModalOpen = true;

  // Start with cloned size/position
  Object.assign(modalCache.content.style, {
    position: "absolute",
    top: `${itemRect.top}px`,
    left: `${itemRect.left}px`,
    width: `${itemRect.width}px`,
    height: `${itemRect.height}px`,
    opacity: "0",
    transform: "scale(0.9)",
    boxShadow: "0 0 0 rgba(0,0,0,0)"
  });

  requestAnimationFrame(() => {
    modalCache.content.classList.add("expand");
    modalCache.content.style.pointerEvents = "auto";
    Object.assign(modalCache.content.style, {
      position: "relative",
      top: "0",
      left: "0",
      width: "",
      height: "",
      opacity: "",
      transform: "",
      boxShadow: ""
    });
  });
};

let tut = false;

// Add this after your Modal open logic (e.g., inside Modal() or after showing the modal)
function showSwipeTutorial() {
  // Only show on mobile/touch devices
  if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;

  // Prevent multiple tutorials
  if (document.getElementById('swipe-tutorial')) return;

  if (tut) return; // Prevent multiple tutorials
  tut = true;
  const tutorial = document.createElement('div');
  tutorial.id = 'swipe-tutorial';
  tutorial.textContent = 'Swipe left or right to view previous/next item';
  Object.assign(tutorial.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    color: '#fff',
    padding: '14px 22px',
    borderRadius: '16px',
    fontSize: '1.2em',
    zIndex: 99999,
    boxShadow: '0 4px 16px #000a',
    textAlign: 'center',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.3s'
  });
  document.body.appendChild(tutorial);

  // Fade in
  setTimeout(() => { tutorial.style.opacity = '1'; }, 10);
  // Fade out after 2.5s
  setTimeout(() => {
    tutorial.style.opacity = '0';
    setTimeout(() => tutorial.remove(), 600);
  }, 2500);
}



const closeModalHandler = () => {
  modalCache.content.classList.remove("expand");
  modalCache.modal.classList.remove("show");
  modalCache.content.style.pointerEvents = "none";
  setTimeout(() => {
    isModalOpen = false;
  }, 150)
};


window.addEventListener("click", (event) => {
  if (event.target === modalCache.modal) closeModalHandler();
});
window.addEventListener("touchend", (event) => {
  if (event.target === modalCache.modal) closeModalHandler();
});



resize_to_fit();

function resize_to_fit() {
  const items = document.querySelectorAll('.catalog-grid .item'); // Define items here

  const observer = new MutationObserver((mutations, obs) => {
    const items = document.querySelectorAll('.catalog-grid .item'); // Move query inside the function
    if (items.length > 0) { // Check if items are generated
      obs.disconnect(); // Stop observing
      items.forEach(item => {
        if (item.id != "titles") {
          return;
        }
        if (item.childNodes[1]) {
          let fontsize = parseInt(window.getComputedStyle(item.childNodes[1]).fontSize, 10);

          while (item.childNodes[1].offsetWidth > 150 && fontsize > 14) {
            fontsize -= 2;
            item.childNodes[1].style.fontSize = `${fontsize}px`;
          }
        }
      });
    }
  });

  observer.observe(document.querySelector('.catalog-grid'), { childList: true, subtree: true });

  items.forEach(item => {
    if (item.id != "titles") {
      return;
    }
    if (item.childNodes[1]) {
      let fontsize = parseInt(window.getComputedStyle(item.childNodes[1]).fontSize, 10);

      while (item.childNodes[1].offsetWidth > 150 && fontsize > 14) {
        fontsize -= 2;
        item.childNodes[1].style.fontSize = `${fontsize}px`;
      }
    }
    // Decrease the font size
  });
}



function setupLazyLoading() {
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const gridId = entry.target.id;
        
        const categoryMap = {
          gears: { data: window._randomArr.gears, color: window._randomCategoryColors.gears },
          deaths: { data: window._randomArr.deaths, color: window._randomCategoryColors.deaths },
          titles: { data: window._randomArr.titles, color: window._randomCategoryColors.titles },
          pets: { data: window._randomArr.pets, color: window._randomCategoryColors.pets },
          effects: { data: window._randomArr.effects, color: window._randomCategoryColors.effects }
        };

        const page = window.location.pathname.split('/').pop() || "index";
        let items = window._randomArr;
        let color = "rgb(0, 0, 0)";

        //with .html and without .html
        if (page.endsWith('.html')) {
          const pageName = page.replace('.html', '');

          if (pageName in categoryMap) {
            items = categoryMap[pageName].data;
            color = categoryMap[pageName].color;
            
          }
        } else if (page in categoryMap) {
          items = categoryMap[page].data;
          color = categoryMap[page].color;
        }
        

        if (gridId === "random") {
 
          randomGridPopulate(window._randomArr, window._randomCategoryColors);
        }else if (gridId === "ctlg" && document.getElementById("itemlist")) {
          // Pass each item's color if available, else use default color
          const itemsWithColor = Array.isArray(items)
            ? items.map(item => ({ ...item, _color: color }))
            : Object.values(items).flat().map(item => ({ ...item, _color: color }));
          populateGrid(gridId, itemsWithColor);
          console.log("Populated catalog grid with items:", itemsWithColor);
        } else {
          const filteredItems = Array.isArray(items)
            ? items.filter(item => item[gridId] === true).map(item => ({ ...item, _color: color }))
            : Object.entries(window._randomCategoryColors).flatMap(([key, catColor]) =>
                (items[key]?.filter(item => item[gridId] === true) || []).map(item => ({ ...item, _color: catColor }))
              );
          populateGrid(gridId, filteredItems);
          console.log("Populated catalog grid with items2:", filteredItems);
        }



        // Hide "new" container if empty
        if (gridId === "new" && entry.target.children.length === 0) {
          entry.target.parentElement.style.display = "none";
        }

        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '100px' });

  document.querySelectorAll('.catalog-grid').forEach(grid => observer.observe(grid));
}


let currentItems = []; // Top of your script

// In script.js

// Consolidated grid population function
function populateGrid(gridId, items, limit = null) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = ""; // Clear previous content

  const itemsToDisplay = limit ? items.slice(0, limit) : items;
  itemsToDisplay.forEach(item => {
    
    grid.appendChild(createNewItem(item, item._color));
  });

  // Attach modal click handler
  grid.querySelectorAll('.item').forEach(item => {
    item.onclick = (event) => Modal(event);
  });
}

// Modified rinse function
async function rinse() {
  try {
    const data = await fetchData();
    window._randomArr = data;
    window._randomCategoryColors = {
      gears: "rgb(91, 254, 106)",
      deaths: "rgb(255, 122, 94)",
      titles: "rgb(201, 96, 254)",
      pets: "rgb(55, 122, 250)",
      effects: "rgb(255, 177, 53)"
    };

    // Prepare search data
    let color = "rgb(0, 0, 0)";
    let flatArray = Array.isArray(data)
      ? data.map(item => ({ ...item, _color: color }))
      : Object.entries(window._randomCategoryColors).flatMap(([key, color]) =>
          data[key]?.map(item => ({ ...item, _category: key, _color: color })) || []
        );

    flatArray.forEach(item => createNewItem(item, item._color));
    setupSearch(flatArray, color);
    setupLazyLoading(); // Initialize lazy loading
      
  } catch (error) {
    console.error('Error in rinse:', error);
  }
}

function randomGridPopulate(arr, categoryColors) {
  const randomGrid = document.getElementById("random");
  if (!randomGrid) return;

  const categories = [
    { data: arr.gears, color: categoryColors.gears },
    { data: arr.deaths, color: categoryColors.deaths },
    { data: arr.titles, color: categoryColors.titles },
    { data: arr.pets, color: categoryColors.pets },
    { data: arr.effects, color: categoryColors.effects }
  ];

  const selectedItems = [];
  for (let step = 0; step < 4; step++) {
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];

    const item = randomCategory.data[Math.floor(Math.random() * randomCategory.data.length)];
    selectedItems.push({ item, color: randomCategory.color });
  }
  //clear previous items
  randomGrid.innerHTML = "";
  selectedItems.forEach(({ item, color }) => {
    createNewItem(item, color);
    const lastItem = document.querySelector("#itemlist .item:last-child");
    if (lastItem) document.getElementById("random").appendChild(lastItem);
  });
    randomGrid.querySelectorAll('.item').forEach(item => {
    item.onclick = (event) => Modal(event);
  });
}

// New fetchData function
async function fetchData() {
  const res = await fetch('https://api.github.com/gists/0d0a3800287f3e7c6e5e944c8337fa91');
  if (!res.ok) throw new Error('Failed to fetch data');
  const data = await res.json();
  return JSON.parse(data.files["auto.json"].content);
}

let num = 0




rinse()




function createNewItem(item, color) {

  const fragment = document.createDocumentFragment();
  const newItem = document.createElement("div");
  
  newItem.classList.add("item");
  newItem.style.overflow = "hidden";
  newItem.style.scale = "1";
  // Untradable icon for non-titles
  if (item.weeklystar) {
    if (item["price/code/rarity"].toLowerCase().includes("60")) {
      newItem.style.outlineColor = "#b31aff";
    }
    if (item["price/code/rarity"].toLowerCase().includes("30")) {
      newItem.style.outlineColor = "#ff2a00";
    }
    if (item["price/code/rarity"].toLowerCase().includes("15")) {
      newItem.style.outlineColor = "#fae351";
    }
    if (item["price/code/rarity"].toLowerCase().includes("5")) {
      newItem.style.outlineColor = "#e0e6df";
    }
  }

  // Retired tag
  if (item.retired) {
    const retired = document.createElement("img");
    retired.classList.add("retired");
    retired.style.display = "none";
    //retired.src = "./imgs/retired.png";
    retired.style.width = "17%";
    retired.style.height = "auto";
    retired.style.position = "sticky";
    retired.style.marginRight = "-73%";
    retired.style.marginTop = "-18px";
    retired.setAttribute('draggable', false);
    newItem.appendChild(retired);
  }
  // Premium icon
  if (item.premium) {
    const premium = document.createElement("img");
    premium.classList.add("premium");
    premium.src = "./imgs/prem.png";
    premium.style.width = "17%";
    premium.style.height = "auto";
    premium.style.position = "sticky";
    premium.style.marginRight = "-73%";
    premium.style.marginTop = "-18px";
    premium.setAttribute('draggable', false);
    newItem.appendChild(premium);
  }

  if (item.tradable === false && color !== "rgb(201, 96, 254)") {
    const untradable = document.createElement("img");
    untradable.classList.add("untradable");
    //if found premium, then make untradable icon on left instead of right
    if (item.premium) {
      untradable.style.left = "5px";
    } else {
      untradable.style.right = "5px";
    }
    newItem.style.order = "1";
    untradable.src = "./imgs/WLjbELh.png";
    untradable.style.width = "17%";
    untradable.style.height = "auto";
    untradable.style.position = "absolute";
    untradable.style.zIndex = "4";
    untradable.style.bottom = "5px";
    untradable.setAttribute('draggable', false);
    newItem.appendChild(untradable);

  }



  // New icon
  if (item.new) {

    const newbanner = document.createElement("img");
    newbanner.src = "./imgs/new.png";
    newbanner.style.width = "50%";
    newbanner.style.height = "auto";
    newbanner.style.position = "absolute";
    newbanner.style.top = "0";
    newbanner.style.zIndex = "9";
    newbanner.style.left = "0";
    newbanner.setAttribute('draggable', false);
    newItem.appendChild(newbanner);
  }

  // Item image (canvas)
  if (item.img) {
    const canvas = document.createElement("canvas");
    newItem.dataset.image = item.img;
    canvas.setAttribute("id", "img");
    Object.assign(canvas.style, {
      maxWidth: "100%",
      maxHeight: "100%",
      display: "block",
      margin: "0 auto",
      userSelect: "none",
      webkitUserSelect: "none",
      pointerEvents: "none"
    });
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = item.img;

    if (item.new) {
      canvas.style.paddingTop = "15px";
    }
    newItem.appendChild(canvas);
    if (color === "rgb(201, 96, 254)") {
      canvas.style.position = "absolute";
    }

  }

  // Name element
  let name = document.createElement("div");
  name.id = "h3";
  name.innerText = item.name;

  if (item.img) {
    if (color === "rgb(201, 96, 254)") {
      name.style.visibility = "hidden";
    }
  }

  if (item.new) {
    name.style.order = "-1";
  }

  // Category-specific styling
  if (color === "rgb(55, 122, 250)") {
    newItem.id = "pets";
  } else if (color === "rgb(255, 177, 53)") {
    newItem.id = "effects";
  } else if (color === "rgb(255, 122, 94)") {
    newItem.id = "deaths";
  } else if (color === "rgb(201, 96, 254)") {
    newItem.id = "titles";
    newItem.style.alignItems = "center";
    newItem.style.justifyContent = "center";
    name.style.font = "600 28px 'Arimo'";
    name.style.color = "rgb(255 255 255)";
    name.style.whiteSpace = "nowrap";
    name.style.bottom = "-10";
    name.style.paddingTop = "0px";
    name.style.margin = "57px 0";
    name.style.position = "relative";
    if (item.style) {
      name.setAttribute("style", item.style);
      name.style.whiteSpace = "nowrap";
      name.style.bottom = "-10";
      name.style.margin = "57px 0";
    }
    if (item.style2) {
      name.setAttribute("style", item.style2);
      name.style.whiteSpace = "nowrap";
      let clone = name.cloneNode(true);
      name.style.bottom = "-10";
      name.style.margin = "57px 0";
      clone.style.position = "absolute";
      clone.style.textShadow = "none";
      clone.style.fontSize = "1em";
      clone.style.whiteSpace = "nowrap";
      name.appendChild(clone);
    }
    if (item.color) {
      name.style.color = item.color;
    }
    if (item.stroke) {
      let stroke = item.stroke.split(" ");
      name.style.textShadow = `-${stroke[0]} -${stroke[0]} 0 ${stroke[1]}, 0 -${stroke[0]} 0 ${stroke[1]}, ${stroke[0]} -${stroke[0]} 0 ${stroke[1]}, ${stroke[0]} 0 0 ${stroke[1]}, ${stroke[0]} ${stroke[0]} 0 ${stroke[1]}, 0 ${stroke[0]} 0 ${stroke[1]}, -${stroke[0]} ${stroke[0]} 0 ${stroke[1]}, -${stroke[0]} 0 0 ${stroke[1]}`;
    }
    if (item.font) {
      name.style.font = item.font;
      if (name.children.length > 0) {
        name.childNodes[1].style.font = item.font;
        name.childNodes[1].style.fontSize = "1em";
      }
    }
    if (item.rotate) {
      name.style.transform = "rotate(" + item.rotate + "deg)";
    }
  } else if (color === "rgb(91, 254, 106)") {
    newItem.id = "gears";
  }

  newItem.appendChild(name);
  if (item.style3) {
    name.outerHTML = item.style3;
  }

  // Untradable icon for titles
  if (item.tradable === false && color === "rgb(201, 96, 254)") {
    newItem.style.order = "1";
    newItem.style.flexDirection = "column";
    name.style.margin = "0";
    const untradable = document.createElement("img");
    untradable.classList.add("untradable");
    untradable.src = "./imgs/WLjbELh.png";
    untradable.style.width = "17%";
    untradable.style.height = "auto";
    untradable.style.position = "absolute";
    untradable.style.right = "5px";
    untradable.style.bottom = "5px";
    untradable.setAttribute('draggable', false);
    newItem.appendChild(untradable);
  }
  const price = document.createElement("p");
  price.innerHTML = `<img src="./imgs/iZGLVYo.png" draggable="false">${item.price || 0}`;
  newItem.appendChild(price);
  // Price element
  if (item.price == 0) {
    price.style.display = "none"; // Hide price if it's 0
  }
  // From element (hidden)
  const from = document.createElement("div");
  from.innerText = item.from;
  from.id = "from";
  from.style.display = "none";
  newItem.appendChild(from);

  // Rarity element (hidden)
  const prcdra = document.createElement("div");
  prcdra.innerText = item["price/code/rarity"];
  prcdra.id = "pricecoderarity";
  prcdra.style.display = "none";
  newItem.appendChild(prcdra);

  // Staff item styling
  if (item.from && item.from.toLowerCase().includes("staff item")) {
    newItem.classList.add('staff');
  }

  newItem.style.border = "1px solid rgba(0, 0, 0, 0.2)";
  newItem.classList.add('item', 'item-refresh-animate');



  if (document.getElementById("itemlist")) {
    fragment.appendChild(newItem);
    document.getElementById("itemlist")?.appendChild(fragment);
    
  }



  return newItem;
}


// Make sure Fuse.js is loaded in your HTML before this script!

function setupSearch(itemList) {
  const searchInput = document.getElementById('search-bar');
  const resultsContainer = document.getElementById('search-results');
  if (!resultsContainer) return;
  // Use Fuse.js for fuzzy search
  const fuse = new Fuse(itemList, {
    keys: ['name'],
    threshold: 0.3,
  });

  let activeIndex = -1;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    resultsContainer.innerHTML = '';
    activeIndex = -1;

    if (!query) return;

    const results = fuse.search(query).slice(0, 12);

    results.forEach((result, index) => {
      const item = result.item;
      const div = document.createElement('div');
      div.className = 'search-item';
      div.textContent = item.name;
      div.style.padding = "8px 14px";
      div.style.cursor = "pointer";
      div.style.borderBottom = "1px solid #333";
      div.style.whiteSpace = "nowrap";

      div.addEventListener('mouseenter', () => div.style.background = "#444");
      div.addEventListener('mouseleave', () => div.style.background = "transparent");
      div.addEventListener('click', () => {
        searchInput.value = item.name;
        resultsContainer.innerHTML = '';
        showSelectedItem(item);
      });

      resultsContainer.appendChild(div);
    });
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = resultsContainer.querySelectorAll('.search-item');

    if (e.key === 'ArrowDown') {
      activeIndex = (activeIndex + 1) % items.length;
    } else if (e.key === 'ArrowUp') {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      items[activeIndex].click();
    } else if (e.key === 'Escape') {
      resultsContainer.innerHTML = '';
      return;
    } else {
      return;
    }

    items.forEach((item, i) =>
      item.classList.toggle('active', i === activeIndex)
    );
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.innerHTML = '';
    }
  });

  function showSelectedItem(item) {
    // Remove all items from ctlg
    document.querySelectorAll('#itemlist .item').forEach(el => el.remove());
    // Create and show only the selected item
    createNewItem(item, item._color || 'pink');
    document.getElementById("zd").innerText = `1 item`;
    // Open modal for the new item
    const newItem = document.querySelector('#itemlist .item:last-child');
    if (newItem) {
      isModalOpen = false;
      //newItem.click();

      newItem.onclick = (event) => Modal(event);
      newItem.click();

    }
  }
}



function filterItems() {
  const searchValue = document.getElementById('search-bar').value.toLowerCase();
  const items = document.querySelectorAll('#ctlg .item');

  items.forEach(item => {
    let display = "flex";
    if (item.id == "titles") {

      display = "flex";
    }
    const itemText = item.querySelector('#h3').textContent.toLowerCase();
    if (itemText.includes(searchValue)) {
      item.style.display = display;
    } else {
      item.style.display = 'none';
    }
  });
}