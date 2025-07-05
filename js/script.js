let imgg;
const modal = document.getElementById("product-modal");
const popo = document.getElementById("popo");
const modalContent = document.getElementById("modal-content");
const modalTitle = document.getElementById("modal-title");
const modalPrc = document.getElementById("modal-prc");
const modalDescription = document.getElementById("modal-description");
const modalPrice = document.getElementById("modal-price-value");
const modalRetired = document.getElementById("modal-retired");
const modalPremium = document.getElementById("modal-premium");
const modaluntradable = document.getElementById("modal-untradable");

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
  }else if (d > 0.98) {
    imgg = "./imgs/tran.webp"
  }else if (d > 0.9) {
    imgg = "https://i.imgur.com/o7IJiwl.png"
  } else {
    imgg = "https://i.imgur.com/XRmpB1c.png"
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
  document.addEventListener("DOMContentLoaded", insertNavButtons);




  const leftArrow = document.createElement("div");
  leftArrow.id = "modal-left-arrow";
  leftArrow.className = "modal-arrow";
  leftArrow.innerHTML = "&#8592;";
  modal.appendChild(leftArrow);

  const rightArrow = document.createElement("div");
  rightArrow.id = "modal-right-arrow";
  rightArrow.className = "modal-arrow";
  rightArrow.innerHTML = "&#8594;";
  modal.appendChild(rightArrow);

  // Mobile swipe support for modal navigation
  let touchStartX = 0;
  let touchEndX = 0;

  modalContent.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, false);

  modalContent.addEventListener("touchend", (e) => {
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
  }

  // Show arrows when modal opens
  const originalModal = Modal;
  Modal = function () {
    originalModal.apply(this, arguments); // preserve original logic
    showModalArrows();
  };

  // Show arrows on mouse move/hover over modal
  modal.addEventListener("mousemove", showModalArrows);
  modal.addEventListener("touchstart", showModalArrows); // for quick re-show on touch




  const refreshBtn = document.getElementById('refresh-button');
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      refreshBtn.childNodes[0].style.animation = "";
      refreshBtn.childNodes[0].style.webkitAnimation = "";
      setTimeout(() => {
        refreshBtn.childNodes[0].style.animation = "rotate 0.7s ease-in-out 0s 1 alternate";
        refreshBtn.childNodes[0].style.webkitAnimation = "rotate 0.7s ease-in-out 0s 1 alternate";
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


  modalRetired.style.visibility = "hidden";
  modalPremium.style.visibility = "hidden";
  modaluntradable.style.visibility = "hidden";

 //if found untradable icon, then show untradable modal
  if (item.querySelector(".untradable")) {
    modaluntradable.style.visibility = "visible";
  }
  //if found premium icon, then show premium modal
  if (item.querySelector(".premium")) {
    modalPremium.style.visibility = "visible";
  }
  //if found retired icon, then show retired modal
  if (item.querySelector(".retired")) {
    modalRetired.style.visibility = "visible";
  }


  document.querySelectorAll(".item").forEach((el) => el.classList.remove("showing"));
  item.classList.add("showing");

  const title = item.querySelector("#h3").textContent;
  const imageSrc = item.dataset.image;
  const from = item.querySelector("#from").textContent.replace(/<br>/g, "\n");
  const prcdra = item.querySelector("#pricecoderarity").textContent;
  const price = item.querySelector("p img").nextSibling.textContent.trim();

  modalContent.style.pointerEvents = "none";
  modalContent.style.backgroundColor = item.style.backgroundColor;
  modalTitle.textContent = title;
  const existingCanvas = modalContent.querySelector("#content-area canvas");
  if (existingCanvas) existingCanvas.remove();
  console.log("Image source:", imageSrc);
  if (imageSrc) {

   
    const canvas = document.createElement("canvas");
    canvas.style.zIndex= "99";
    Object.assign(canvas.style, {
      width: "100%",
      height: "auto",
      placeSelf: "center",
      display: "block",
      userSelect: "none",
      webkitUserSelect: "none",
      pointerEvents: "none"
    });

    modalContent.querySelector("#content-area").insertBefore(canvas, modalDescription);

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageSrc;
  }

  modalDescription.textContent = from;
  modalPrice.setAttribute("draggable", false);
  modalTitle.style.display = item.id === "titles" ? "none" : "block";

  modalContent.querySelectorAll(".font").forEach((el) => el.remove());

  const bgColors = {
    pets: "rgb(39, 102, 221)",
    effects: "rgb(243, 164, 37)",
    deaths: "rgb(221, 89, 62)",
    titles: "rgb(154, 45, 209)",
    gears: "rgb(55, 205, 68)"
  };

  if (bgColors[item.id]) {
    modalContent.style.backgroundColor = bgColors[item.id];
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
    modalContent.querySelector("#content-area").insertBefore(clone, modalDescription);
  }

  const splitted = prcdra.split("<br>");


  // Remove duplicates but keep the first occurrence
  const seen = new Set();
  const uniqueLines = splitted.filter(line => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  modalPrice.src = "./imgs/rarity.webp";
  const modalText = modalPrice.nextSibling;
  modalText.textContent = uniqueLines[0];
  Object.assign(modalText.style, {
    color: "#e1e1e1",
    fontSize: "30px",
    fontWeight: 400,
    textStroke: "",
    webkitTextStroke: "",
    textShadow: ""
  });

  popo.parentElement.querySelectorAll(".price").forEach((el, idx) => {
    if (idx > 0) el.remove();
  });

  uniqueLines.slice(1).forEach((line) => {
    const newPrice = popo.cloneNode(true);
    newPrice.childNodes[1].textContent = line;
    popo.parentElement.appendChild(newPrice);
  });

  popo.parentElement.querySelectorAll(".price").forEach((priceEl) => {
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
        Robux: "https://i.imgur.com/cf8ZvY7.png",
        Coins: "./imgs/Coin.webp",
        Stars: "https://i.imgur.com/WKeX5AS.png",
        Visors: "https://i.imgur.com/7IoLZCN.png",
        Pumpkins: "https://i.imgur.com/bHRBTrU.png",
        Eggs: "https://i.imgur.com/qMxjgQy.png",
        Opals: "https://i.imgur.com/wwMMAvr.png",
        Opal: "https://i.imgur.com/wwMMAvr.png",
        Baubles: "./imgs/bauble.png",
        Bauble: "./imgs/bauble.png",
        Tokens: "https://i.imgur.com/Cy9r140.png",
        Token: "https://i.imgur.com/Cy9r140.png"
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
        children[0].src = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Red_x.svg/600px-Red_x.svg.png";
        children[1].style.color = "rgb(255 44 44)";
      }

      priceEl.style.display = children[1].textContent ? "flex" : "none";
    }
  });

  modalPrc.innerHTML = `<img src="https://i.imgur.com/iZGLVYo.png" style="height: 37px;">${price || 0}`;

  // Show the modal with animation
  const itemRect = item.getBoundingClientRect();
  modal.style.display = "flex";
  modal.classList.add("show");
  isModalOpen = true;

  // Start with cloned size/position
  Object.assign(modalContent.style, {
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
    modalContent.classList.add("expand");
    modalContent.style.pointerEvents = "auto";
    Object.assign(modalContent.style, {
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
  modalContent.classList.remove("expand");
  modal.classList.remove("show");
  modalContent.style.pointerEvents = "none";
  setTimeout(() => {
    isModalOpen = false;
  }, 150)
};


window.addEventListener("click", (event) => {
  if (event.target === modal) closeModalHandler();
});
window.addEventListener("touchend", (event) => {
  if (event.target === modal) closeModalHandler();
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






let currentItems = []; // Top of your script

function rinse() {
  fetch('https://api.github.com/gists/0d0a3800287f3e7c6e5e944c8337fa91')
    .then(results => {
      return results.json();
    })
    .then(data => {
      document.querySelectorAll(".item").forEach((el) => el.remove());

      // Determine the current page and select the appropriate data
      const page = window.location.pathname.split('/').pop(); // Get the current file name
      let arr = JSON.parse(data.files["auto.json"].content); // Parse the JSON content
      let color;
      if (page.includes("gears")) {
        //document.body.style.backgroundColor = "#24be31";
        color = "rgb(91, 254, 106)";
        arr = arr.gears;
      } else if (page.includes("deaths")) {
        //document.body.style.backgroundColor = "#be4324";
        color = "rgb(255, 122, 94)";
        arr = arr.deaths;
      } else if (page.includes("titles")) {
        // document.body.style.backgroundColor = "#7724c0";
        color = "rgb(201, 96, 254)";
        arr = arr.titles;
      } else if (page.includes("pets")) {
        // document.body.style.backgroundColor = "#2723c1";
        color = "rgb(55, 122, 250)";
        arr = arr.pets;
      } else if (page.includes("effects")) {
        // document.body.style.backgroundColor = "#c08223";
        color = "rgb(255, 177, 53)";
        arr = arr.effects;
      } else {
        arr = arr;
        color = "rgb(0, 0, 0)";

      }
      // Add this after you fetch and parse your data in rinse(), before calling showInfo(arr, color):

      // Combined logic for #new, #weekly, #weeklystar grids
      const gridConfigs = [
        "new",
        "weekly",
        "weeklystar",
        "random"
      ];

      const categoryColors = {
        gears: "rgb(91, 254, 106)",
        deaths: "rgb(255, 122, 94)",
        titles: "rgb(201, 96, 254)",
        pets: "rgb(55, 122, 250)",
        effects: "rgb(255, 177, 53)"
      };

      // ...inside rinse(), after you define arr and categoryColors...
      // Save arr and categoryColors globally for refresh use
      window._randomArr = arr;
      window._randomCategoryColors = categoryColors;
      if (!document.getElementById("itemlist")) return;

      if (Array.isArray(arr)) {
        arr.forEach(item => {


          createNewItem(item, color);
          const lastItem = document.querySelector("#itemlist .item:last-child");
          if (lastItem) document.getElementById("ctlg").appendChild(lastItem);

        });
      }
      document.getElementById("ctlg").addEventListener("click", (event) => {
        Modal(event);
      });

      gridConfigs.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;

        grid.innerHTML = "";

        if (gridId === "random") {
          randomGridPopulate(window._randomArr, window._randomCategoryColors);
          return;
        }

        grid.addEventListener("click", (event) => {
          Modal(event);
        });

        // If arr is an array (e.g., on gears.html), just use it directly

        // If arr is an object (main page), use categoryColors
        Object.entries(categoryColors).forEach(([key, color]) => {
          if (Array.isArray(arr[key])) {
            arr[key].forEach(item => {
              if (item[gridId] === true) {
                createNewItem(item, color);
                const lastItem = document.querySelector("#itemlist .item:last-child");
                if (lastItem) grid.appendChild(lastItem);
              }
            });
          }
        });

      });

      currentItems = arr; // ✅ Store current items for search use
      // After fetching and parsing arr:
      let flatArray = [];
      if (Array.isArray(arr)) {
        // Category page: arr is already an array
        flatArray = arr.map(item => ({ ...item, _color: color }));
      } else {
        // Main page: arr is an object of arrays
        Object.entries(categoryColors).forEach(([key, color]) => {
          if (Array.isArray(arr[key])) {
            arr[key].forEach(item => {
              flatArray.push({ ...item, _category: key, _color: color });
            });
          }
        });
      }
      showInfo(flatArray, color);
      setupSearch(flatArray, color);
    })
    .catch(error => console.error('Error fetching data:', error));
}


function randomGridPopulate(arr, categoryColors) {
  let color = "rgb(0, 0, 0)";
  let pick;
  const randomGrid = document.getElementById("random");
  if (!randomGrid) return;
  randomGrid.innerHTML = ""; // Clear previous

  for (let step = 0; step < 4; step++) {
    const randomIndex = Math.floor(Math.random() * 5);
    if (randomIndex === 0) {
      pick = arr.gears;
      color = categoryColors.gears;
    } else if (randomIndex === 1) {
      pick = arr.deaths;
      color = categoryColors.deaths;
    } else if (randomIndex === 2) {
      pick = arr.titles;
      color = categoryColors.titles;
    } else if (randomIndex === 3) {
      pick = arr.pets;
      color = categoryColors.pets;
    } else if (randomIndex === 4) {
      pick = arr.effects;
      color = categoryColors.effects;
    }
    const item = pick[Math.floor(Math.random() * pick.length)];
    createNewItem(item, color);
    // Move the created .item from ctlg to #random
    const lastItem = document.querySelector("#itemlist .item:last-child");
    if (lastItem && randomGrid) randomGrid.appendChild(lastItem);
  }

  // Attach modal click handler to random items
  randomGrid.querySelectorAll('.item').forEach(item => {
    item.onclick = (event) => Modal(event);
  });
}




rinse()




function createNewItem(item, color) {
  const catalog = document.getElementById("ctlg");
  const newItem = document.createElement("div");
  newItem.classList.add("item");
  newItem.style.overflow = "hidden";
  newItem.style.scale = "1";
  // Untradable icon for non-titles
  if (item.weeklystar) {
    if (item["price/code/rarity"].toLowerCase().includes("60") ) {
      newItem.style.outlineColor = "#b31aff";
    }
    if (item["price/code/rarity"].toLowerCase().includes("30") ) {
      newItem.style.outlineColor = "#ff2a00";
    }
    if (item["price/code/rarity"].toLowerCase().includes("15") ) {
      newItem.style.outlineColor = "#fae351";
    }
    if (item["price/code/rarity"].toLowerCase().includes("5") ) {
      newItem.style.outlineColor = "#e0e6df";
    }
  }

  // Retired tag
  if (item.retired) {
    const retired = document.createElement("img");
    retired.classList.add("retired");
    retired.style.display = "none";
    retired.src = "./imgs/retired.png";
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
      untradable.src = "https://i.imgur.com/WLjbELh.png";
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
    untradable.src = "https://i.imgur.com/WLjbELh.png";
    untradable.style.width = "17%";
    untradable.style.height = "auto";
    untradable.style.position = "absolute";
    untradable.style.right = "5px";
    untradable.style.bottom = "5px";
    untradable.setAttribute('draggable', false);
    newItem.appendChild(untradable);
  }

  // Price element
  const price = document.createElement("p");
  price.innerHTML = `<img src="https://i.imgur.com/iZGLVYo.png" draggable="false">${item.price || 0}`;
  newItem.appendChild(price);

  // From element (hidden)
  const from = document.createElement("div");
  from.innerHTML = item.from;
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
    document.getElementById("itemlist").appendChild(newItem);
  }
}


function showInfo(arr, color) {

  arr.forEach((item, i) => {
    document.getElementById("zd").innerHTML = `${i + 1} items`;
    createNewItem(item, color);
  });

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