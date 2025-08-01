let imgg;

function createProductModal() {
  const modal = document.createElement("div");
  modal.id = "product-modal";
  modal.className = "modal";
  modal.style.display = "none";

  const modalContent = document.createElement("div");
  modalContent.id = "modal-content";
  modalContent.className = "modal-content expand";
  Object.assign(modalContent.dataset, {
    tilt: "",
    tiltMax: "10",
    tiltSpeed: "500",
    tiltPerspective: "1800",
    tiltGlare: "",
    tiltMaxGlare: "0.1",
    tiltScale: "1.03",
    tiltReset: "true"
  });
  modalContent.style.cssText = `
    will-change: transform;
    background-color: rgb(91, 254, 106);
    position: relative;
    top: 0px;
    left: 0px;
    transform: perspective(1800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1);
  `;

  const borderOverlay = document.createElement("div");
  borderOverlay.className = "inner-border-overlay";

  const prc = document.createElement("h3");
  prc.id = "modal-prc";
  prc.className = "modal-prc";
  prc.textContent = "500";

  const dock = document.createElement("div");
  dock.className = "dock";
  dock.style.cssText = `
    display: flex;
    position: absolute;
    bottom: 0px;
    width: -webkit-fill-available;
    justify-content: space-around;
    align-items: flex-start;
    height: 47px;
  `;

  const premIcon = document.createElement("img");
  premIcon.src = "./imgs/prem.png";
  premIcon.id = "modal-premium";
  premIcon.className = "modal-icon";

  const retiredText = document.createElement("h3");
  retiredText.id = "modal-retired";
  retiredText.textContent = "Retired";

  const untradableIcon = document.createElement("img");
  untradableIcon.src = "https://i.imgur.com/WLjbELh.png";
  untradableIcon.id = "modal-untradable";
  untradableIcon.className = "modal-icon";

  dock.append(premIcon, retiredText, untradableIcon);

  borderOverlay.append(dock);

  const title = document.createElement("h3");
  title.id = "modal-title";
  title.className = "modal-title";
  title.setAttribute("data-tilt-transform-element", "");

  const titlepricecontainer = document.createElement("div");
  titlepricecontainer.style.cssText = `
    display: flex;
    gap: 33px;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
  `;

  titlepricecontainer.append(title,prc)

  const contentArea = document.createElement("div");
  contentArea.id = "content-area";
  contentArea.className = "content-area p-4 sm:p-5 lg:p-7";
  contentArea.setAttribute("data-tilt-transform-element", "");
  contentArea.style.cssText = `
    align-items: normal;
    padding: 60px 22px 51px;
  `;

  const overlay = document.createElement("div");
  overlay.className = "gradient-overlay";

  const description = document.createElement("p");
  description.id = "modal-description";
  description.setAttribute("data-tilt-transform-element", "");
  description.style.cssText = `
    white-space: pre-wrap;
    z-index: 34;
    margin:0px;
    margin-bottom: 15px;
    width: 100%;
    align-self: anchor-center;
    font-size: 18px;
    background: -webkit-linear-gradient(#fff, #999999);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  `;

  const priceDiv = document.createElement("div");
  priceDiv.className = "price";
  priceDiv.id = "popo";
  priceDiv.style.cssText = `
    display: flex;
    flex-wrap: nowrap;
    height: 35px;
    flex-direction: row;
    align-content: center;
    justify-content: center;
    align-items: center;
  `;

  const priceImg = document.createElement("img");
  priceImg.id = "modal-price-value";
  priceImg.setAttribute("data-tilt-transform-element", "");
  priceImg.style.cssText = `
    position: relative;
    height: 37px;
    right: 13px;
    z-index: 34;
  `;

  const priceText = document.createElement("p");
  priceText.textContent = "0";
  priceText.style.cssText = `
    right: 6px;
    white-space: pre-wrap;
    z-index: 222;
    margin: 13px 0;
    position: relative;
    font-family: BuilderSans;
    font-size: 32px;
    font-weight: 400;
  `;

  priceDiv.append(priceImg, priceText);

  const tourButton = document.createElement("button");
  tourButton.className = "tour-button";
  tourButton.id = "tour-button"
  tourButton.setAttribute("data-tilt-transform-element", "");
  tourButton.style.display = "none";
  tourButton.innerHTML = `
    Take the tour
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5l7 7-7 7"></path>
      <path d="M5 12h14"></path>
    </svg>
  `;

  contentArea.append(overlay, description, priceDiv, tourButton);

  const closeBtn = document.createElement("span");
  closeBtn.className = "close-btn";
  closeBtn.id = "close-modal";

  const glareWrap1 = document.createElement("div");
  glareWrap1.className = "js-tilt-glare";
  glareWrap1.style.cssText = `
    position: absolute;
    top: 0px;
    left: 0px;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    border-radius: inherit;
  `;
  const glareInner1 = document.createElement("div");
  glareInner1.className = "js-tilt-glare-inner";
  glareInner1.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    pointer-events: none;
    background-image: linear-gradient(0deg, rgba(255, 255, 255, 0) 0%, rgb(255, 255, 255) 100%);
    transform: rotate(180deg) translate(-50%, -50%);
    transform-origin: 0% 0%;
    opacity: 0;
    width: 1388px;
    height: 1388px;
  `;
  glareWrap1.appendChild(glareInner1);

  const glareWrap2 = document.createElement("div");
  glareWrap2.className = "js-tilt-glare";
  const glareInner2 = document.createElement("div");
  glareInner2.className = "js-tilt-glare-inner";
  glareWrap2.appendChild(glareInner2);

  
  modalContent.append(borderOverlay, titlepricecontainer, contentArea, closeBtn, glareWrap1, glareWrap2);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

createProductModal();


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
  untradable: document.getElementById("modal-untradable"),
  button: document.getElementById("tour-button")
};
document.addEventListener('DOMContentLoaded', () => {

  const today = new Date().toISOString().split("T")[0]; // e.g., "2025-07-31"
  const lastShown = localStorage.getItem("lastShownDate");
  const ranimg = localStorage.getItem("ranimg");
  let logo4 = document.querySelector('.logo4');

  if (lastShown == today && logo4) {
    logo4.src = ranimg || "./imgs/XRmpB1c.png"
  }

  if (document.querySelector('.intro')) {

    let intro = document.querySelector('.intro');
    let logo = document.querySelector('.logo-header');
    let logo3 = document.querySelector('.logo3');
    
    let xnite = document.querySelector('.credit');
    let logoSpan = document.querySelectorAll('.logo');
    let header = document.querySelector('.headersheet');
    setTimeout(() => {
        xnite.style.color = "#ffffff00";
    }, 5000)

    if (lastShown == today) {
      window.scrollTo(0, 0);


      logo3.src = ranimg || "./imgs/XRmpB1c.png"

      document.body.classList.add('fonts-loaded');

      intro.style['transition'] = "0.5s"

      logo.style.scale = "1.2"
      intro.style.backdropFilter = 'blur(0px)'
      intro.style.filter = 'opacity(0) blur(9px)'
      document.documentElement.style.overflow = "scroll"
      document.documentElement.style.overflowX = "hidden"
      xnite.style.color = "#ffffffb0";
      if (document.querySelector(".sparkle")) { document.querySelector(".sparkle").style.opacity = "1"; }


      intro.style.top = "-100vh"
      header.style.opacity = "1"
      let main = document.querySelector("main");
      main.style.scale = "1"
      main.style.filter = 'opacity(1)'
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (!isTouch) {
        document.querySelector(".parallax-bg").style.transition = "none";
        document.querySelector(".parallax-bg").style.backgroundSize = "124vw auto"
      } else {
        document.querySelector(".parallax-bg").style.backgroundSize = "auto 104vh"
        document.querySelector(".parallax-bg").style.transition = "transform 0.1s ease-out, opacity 0.2s ease";
      }

      return;
    }

    localStorage.setItem("lastShownDate", today);
    window.scrollTo(0, 0);

    var d = Math.random();

    if (d > 0.97) {
      imgg = "./imgs/burrito.png"
    } else if (d > 0.93) {
      imgg = "./imgs/tran.webp"
    } else if (d > 0.87) {
      imgg = "./imgs/o7IJiwl.png"
    } else {
      imgg = "./imgs/XRmpB1c.png"
    }
    localStorage.setItem("ranimg", imgg);
    logo3.src = imgg

    if (document.querySelector(".sparkle")) { document.querySelector(".sparkle").style.opacity = "0"; }

    logo4.src = imgg

    document.fonts.ready.then(() => {
      xnite.style.color = "#ffffffb0";
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
        }, 3700)
        setTimeout(() => {
          xnite.style.color = "#ffffff00";
        }, 5600)
      })
    });
  } else {
    document.documentElement.style.overflow = "scroll"
    document.documentElement.style.overflowX = "hidden"
    let main = document.querySelector("main");
    if (main.style.scale == '1') {
      main.style.filter = 'opacity(1)'
    }
  }
})

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
  leftArrow.innerHTML = "←";
  modalCache.modal.appendChild(leftArrow);

  const rightArrow = document.createElement("div");
  rightArrow.id = "modal-right-arrow";
  rightArrow.className = "modal-arrow";
  rightArrow.innerHTML = "→";
  modalCache.modal.appendChild(rightArrow);

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
    }, 2000);
  };

  const originalModal = Modal;
  Modal = function () {
    originalModal.apply(this, arguments);
    showModalArrows();
  };

  modalCache.modal.addEventListener("mousemove", showModalArrows);
  modalCache.modal.addEventListener("touchstart", showModalArrows);

  const refreshBtn = document.getElementById('refresh-button');
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      refreshBtn.children[0].style.animation = "";
      refreshBtn.children[0].style.webkitAnimation = "";
      setTimeout(() => {
        refreshBtn.children[0].style.animation = "rotate 0.7s ease-in-out 0s 1 alternate";
        refreshBtn.children[0].style.webkitAnimation = "rotate 0.7s ease-in-out 0s 1 alternate";
      }, 50);
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
    const threshold = 50;

    if (Math.abs(delta) > threshold) {
      if (delta < 0) {
        openSiblingModal("next");
      } else {
        openSiblingModal("prev");
      }
    }
  }
})

let isModalOpen = false;

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

  document.getElementsByTagName('html')[0].style.overflowY = "hidden";

  modalCache.retired.style.visibility = "hidden";
  modalCache.premium.style.visibility = "hidden";
  modalCache.untradable.style.visibility = "hidden";

  if (item.querySelector(".untradable")) {
    modalCache.untradable.style.visibility = "visible";
  }
  if (item.querySelector(".premium")) {
    modalCache.premium.style.visibility = "visible";
  }
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
      textShadow: "",
      display: "block"
    });
  }
  modalCache.button.style.display = "none";
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
        Object.assign(children[1].style, { textShadow: "0 0 10px black", fontFamily: "monospace", fontSize: "23px", color: "#cd1f1f" });
      } else if (text.includes("[ACTIVE]")) {
        Object.assign(children[1].style, { fontFamily: "monospace", fontSize: "23px", color: "rgb(251 255 68)" });
      } else if (text.includes("Unobtainable")) {
        children[0].src = "./imgs/Red_x.png";
        children[1].style.color = "rgb(255 44 44)";
      } else if (text.includes("www.")) {
        children[1].style.display = "none";
        modalCache.button.style.display = "block";
        modalCache.button.innerText = "Visit"
        modalCache.button.onclick = () => {
          window.open(text)
        }
      }

      priceEl.style.display = children[1].textContent ? "flex" : "none";
    }
  });

  modalCache.prc.innerHTML = `<img src="./imgs/rap.png" style="filter: drop-shadow(0px 1px 5px #49444454);height:44px;float:left;">${price || 0}`;


  function resize_modal_prc() {


    const img = modalCache.prc.querySelector('img');

    // Reset font size to max starting point
    modalCache.prc.style.fontSize = "42px";
    let fontsize = parseInt(window.getComputedStyle(modalCache.prc).fontSize, 10);

    while (modalCache.prc.offsetWidth > 150 && fontsize > 18) {
      
      fontsize -= 2;
      modalCache.prc.style.fontSize = `${fontsize}px`;
    }

    // Adjust image height to match font size
    if (img) {
      img.style.height = `${fontsize + 2}px`; // Slightly bigger to match vertically
      img.style.marginTop = `${Math.max(fontsize - 38, 0)}px`; // Adjust top margin if needed
    }
  }
  resize_modal_prc()
  if (price!=0) {
    modalCache.prc.style.display= "flex"
  } else {
    modalCache.prc.style.display= "none"
  }
  const itemRect = item.getBoundingClientRect();
  modalCache.modal.style.display = "flex";
  modalCache.modal.classList.add("show");
  isModalOpen = true;

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

function showSwipeTutorial() {
  if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
  if (document.getElementById('swipe-tutorial')) return;
  if (tut) return;
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
  setTimeout(() => { tutorial.style.opacity = '1'; }, 10);
  setTimeout(() => {
    tutorial.style.opacity = '0';
    setTimeout(() => tutorial.remove(), 600);
  }, 2500);
}

const closeModalHandler = () => {
  modalCache.content.classList.remove("expand");
  modalCache.modal.classList.remove("show");
  modalCache.content.style.pointerEvents = "none";
  document.getElementsByTagName('html')[0].style.overflowY = "scroll";
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




function resize_to_fit() {
  const items = document.querySelectorAll('.item');
  if (items.length > 0) {
    items.forEach(item => {
      if (item.id == "titles") return;
      if (item.querySelector('div')) {
        item.querySelector('div').style.fontSize = "20px";
        let fontsize = parseInt(window.getComputedStyle(item.querySelector('div')).fontSize, 10);
        console.log(`font size: ${fontsize}`);
        while (item.querySelector('div').offsetWidth > 120 && fontsize > 11) {
          fontsize -= 2;
          item.querySelector('div').style.fontSize = `${fontsize}px`;
        }
      }
    });
  }
};


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
        } else if (gridId === "ctlg" && document.getElementById("itemlist")) {
          const itemsWithColor = Array.isArray(items)
            ? items.map(item => ({ ...item, _color: color }))
            : Object.values(items).flat().map(item => ({ ...item, _color: color }));
          populateGrid(gridId, itemsWithColor);

        } else {
          const filteredItems = Array.isArray(items)
            ? items.filter(item => item[gridId] === true).map(item => ({ ...item, _color: color }))
            : Object.entries(window._randomCategoryColors).flatMap(([key, catColor]) =>
              (items[key]?.filter(item => item[gridId] === true) || []).map(item => ({ ...item, _color: catColor }))
            );
          populateGrid(gridId, filteredItems);

        }

        let flatArray = Array.isArray(items)
          ? items.map(item => ({ ...item, _color: color }))
          : Object.entries(window._randomCategoryColors).flatMap(([key, catColor]) =>
            (items[key] || []).map(item => ({ ...item, _color: catColor }))
          );
        if (document.getElementById("zd")) {
          document.getElementById("zd").innerText = `${document.querySelectorAll("#ctlg .item").length} item${document.querySelectorAll("#ctlg .item").length === 1 ? '' : 's'}`;
        }

        setupSearch(flatArray, color);

        if (entry.target.children.length === 0) {
          entry.target.parentElement.style.display = "none";
        }

        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '100px' });

  document.querySelectorAll('.catalog-grid').forEach(grid => observer.observe(grid));
}
function shortenThousands(text) {
  text = String(text); // Force to string
  return text.replace(/\b\d{4,}\b/g, match => {
    const num = parseInt(match, 10);
    if (num >= 1000) {
      return (num / 1000).toString().replace(/\.0$/, '') + 'k';
    }
    return match;
  });
}



let currentItems = [];

function populateGrid(gridId, items, limit = null) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = "";

  const itemsToDisplay = limit ? items.slice(0, limit) : items;
  itemsToDisplay.forEach(item => {
    grid.appendChild(createNewItem(item, item._color));
  });

  grid.querySelectorAll('.item').forEach(item => {
    item.onclick = (event) => Modal(event);
  });
  resize_to_fit()
}

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

    const categoryMap = {
      gears: { data: window._randomArr.gears, color: window._randomCategoryColors.gears },
      deaths: { data: window._randomArr.deaths, color: window._randomCategoryColors.deaths },
      titles: { data: window._randomArr.titles, color: window._randomCategoryColors.titles },
      pets: { data: window._randomArr.pets, color: window._randomCategoryColors.pets },
      effects: { data: window._randomArr.effects, color: window._randomCategoryColors.effects }
    };

    const page = window.location.pathname.split('/').pop() || "index";

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


    setupLazyLoading();


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

async function fetchData() {
  const res = await fetch('https://api.github.com/gists/0d0a3800287f3e7c6e5e944c8337fa91');
  if (!res.ok) throw new Error('Failed to fetch data');
  const data = await res.json();
  return JSON.parse(data.files["auto.json"].content);
}

let num = 0

function createNewItem(item, color) {
  const fragment = document.createDocumentFragment();
  const newItem = document.createElement("div");

  newItem.classList.add("item");
  newItem.style.overflow = "hidden";
  newItem.style.scale = "1";
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

  if (item.retired) {
    const retired = document.createElement("img");
    retired.classList.add("retired");
    retired.style.display = "none";
    retired.style.width = "17%";
    retired.style.height = "auto";
    retired.style.position = "sticky";
    retired.style.marginRight = "-73%";
    retired.style.marginTop = "-18px";
    retired.setAttribute('draggable', false);
    newItem.appendChild(retired);
  }
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
      canvas.style.paddingTop = "9px";

    }
    newItem.appendChild(canvas);
    if (color === "rgb(201, 96, 254)") {
      canvas.style.position = "absolute";
    }
  }

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
    name.style.paddingTop = "0px";
  }

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
  price.innerHTML = `<img src="./imgs/iZGLVYo.png" draggable="false">${shortenThousands(item.price) || 0}`;
  newItem.appendChild(price);

  if (item.price == 0) {
    price.style.display = "none";
  }
  const from = document.createElement("div");
  from.innerText = item.from;
  from.id = "from";
  from.style.display = "none";
  newItem.appendChild(from);

  const prcdra = document.createElement("div");
  prcdra.innerText = item["price/code/rarity"];
  prcdra.id = "pricecoderarity";
  prcdra.style.display = "none";
  newItem.appendChild(prcdra);

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

function setupSearch(itemList, defaultColor) {
  const searchInput = document.getElementById('search-bar');
  const resultsContainer = document.getElementById('search-results');
  if (!resultsContainer) return;
  const fuse = new Fuse(itemList, {
    keys: ['name'],
    threshold: 0.3,
  });

  let activeIndex = -1;

  const maxHistory = 4;
  const historyKey = "searchHistory";

  function searcha() {
    const query = searchInput.value.trim();
    resultsContainer.innerHTML = '';
    activeIndex = -1;

    if (!query) {


      const history = JSON.parse(localStorage.getItem(historyKey) || "[]");


      renderHistory(history)
      return
    };

    const results = fuse.search(query).slice(0, 6);

    results.forEach((result) => {
      const item = result.item;
      const div = document.createElement('div');
      div.className = 'search-item';
      div.textContent = item.name;
      div.style.textShadow = "-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000";
      div.style.padding = "8px 14px";
      div.style.cursor = "pointer";
      div.style.borderBottom = "1px solid #333";
      div.style.whiteSpace = "nowrap";
      div.style.backgroundColor = item._color || defaultColor;

      div.addEventListener('mouseenter', () => div.style.backgroundColor = item._color ? `rgba(${parseInt(item._color.split('(')[1].split(',')[0])}, ${parseInt(item._color.split(',')[1])}, ${parseInt(item._color.split(',')[2].split(')')[0])}, 0.8)` : "#444");
      div.addEventListener('mouseleave', () => div.style.backgroundColor = item._color || defaultColor);
      div.addEventListener('click', () => {
        searchInput.value = item.name;
        resultsContainer.innerHTML = '';
        showSelectedItem(item);
        saveSearchHistory(item.name);
      });

      resultsContainer.appendChild(div);
    });
  };
  searchInput.addEventListener('focus', (searcha))
  searchInput.addEventListener('input', (searcha))

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

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
      resultsContainer.innerHTML = '';
    }
  });

  function showSelectedItem(item) {
    document.querySelectorAll('#itemlist .item').forEach(el => el.remove());
    createNewItem(item, item._color);
    document.getElementById("zd").innerText = `1 item`;
    const newItem = document.querySelector('#itemlist .item:last-child');
    if (newItem) {
      isModalOpen = false;
      newItem.onclick = (event) => Modal(event);
      newItem.click();
    }
  }





  // Store search when user clicks result
  function saveSearchHistory(name) {
    let history = JSON.parse(localStorage.getItem(historyKey) || "[]");
    history = history.filter(item => item !== name); // Remove duplicates
    history.unshift(name); // Add to top
    if (history.length > maxHistory) history = history.slice(0, maxHistory);
    localStorage.setItem(historyKey, JSON.stringify(history));
  }

  function renderHistory(history) {
    resultsContainer.innerHTML = '';
    history.forEach(name => {
      const item = itemList.find(i => i.name === name);
      if (!item) return;

      const div = document.createElement('div');
      div.className = 'search-item';
      div.textContent = `↩ ${item.name}`;
      div.style.textShadow = "-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000";
      div.style.padding = "8px 14px";
      div.style.cursor = "pointer";
      div.style.borderBottom = "1px solid #333";
      div.style.backgroundColor = item._color || defaultColor;

      div.addEventListener('mouseenter', () => div.style.backgroundColor = item._color ? `rgba(${parseInt(item._color.split('(')[1].split(',')[0])}, ${parseInt(item._color.split(',')[1])}, ${parseInt(item._color.split(',')[2].split(')')[0])}, 0.8)` : "#444");
      div.addEventListener('mouseleave', () => div.style.backgroundColor = item._color || defaultColor);


      div.addEventListener('click', () => {
        searchInput.value = item.name;
        resultsContainer.innerHTML = '';
        showSelectedItem(item);
        saveSearchHistory(item.name);
      });

      resultsContainer.appendChild(div);
    });
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

rinse()