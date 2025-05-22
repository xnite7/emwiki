let imgg;
if (document.querySelector('.intro')) {
  let intro = document.querySelector('.intro');
  let logo = document.querySelector('.logo-header');
  let logo3 = document.querySelector('.logo3');

  let logoSpan = document.querySelectorAll('.logo');
  var d = Math.random();
  if (d > 0.9) {
    logo3.src = "https://i.imgur.com/o7IJiwl.png"
    imgg = "https://i.imgur.com/o7IJiwl.png"
  } else {
    logo3.src = "https://i.imgur.com/XRmpB1c.png"
    imgg = "https://i.imgur.com/XRmpB1c.png"
  }

  window.addEventListener('DOMContentLoaded', () => {
    let logo4 = document.querySelector('.logo4')
    logo4.src = imgg
    let header = document.querySelector('.headersheet')

    setTimeout(() => {

      logoSpan.forEach((span, idx) => {
        setTimeout(() => {
          span.classList.add('active')
          logo3.classList.add('active')
        }, (idx + 1) * 400)
      });

      setTimeout(() => {
        logoSpan.forEach((span, idx) => {


          setTimeout(() => {
            span.classList.remove('active')
            span.classList.add('fade')
            logo3.classList.remove('active')
            logo3.classList.add('fade')

          }, (idx + 1) * 20)
        })
      }, 2000)

      setTimeout(() => {
        logo.style.scale = "1.2"
        intro.style.backdropFilter = 'blur(0px)'
        intro.style.filter = 'opacity(0)'
      }, 2000)
      setTimeout(() => {
        intro.style.top = "-100vh"
        header.style.opacity = "1"
        let main = document.querySelector("main");
        main.style.scale = "1"
        main.style.filter = 'opacity(1)'

      }, 2500)
      setTimeout(() => {
        intro.style.display = "none"
      }, 3000)
    })
  })
}

function rinse() {
  fetch('https://api.github.com/gists/0d0a3800287f3e7c6e5e944c8337fa91')
    .then(results => {
      return results.json();
    })
    .then(data => {
      document.querySelectorAll(".item").forEach((el) => el.remove());
      if (document.getElementById('refresh-button')){
        document.getElementById('refresh-button').style.animation = "";
        document.getElementById('refresh-button').style.webkitanimation = "";
        setTimeout(() => {
          document.getElementById('refresh-button').style.animation = "rotate 0.7s ease-in-out 0s 1 alternate";
          document.getElementById('refresh-button').style.webkitanimation = "rotate 0.7s ease-in-out 0s 1 alternate";
        }, 50)
       
      }
      // Determine the current page and select the appropriate data
      const page = window.location.pathname.split('/').pop(); // Get the current file name
      let arr = JSON.parse(data.files["auto.json"].content); // Parse the JSON content
      let color;
      if (page.includes("gears")) {
        document.body.style.backgroundColor = "#24be31";
        color = "rgb(91, 254, 106)";
        arr = arr.gears;
      } else if (page.includes("deaths")) {
        document.body.style.backgroundColor = "#be4324";
        color = "rgb(255, 122, 94)";
        arr = arr.deaths;
      } else if (page.includes("titles")) {
        document.body.style.backgroundColor = "#7724c0";
        color = "rgb(201, 96, 254)";
        arr = arr.titles;
      } else if (page.includes("pets")) {
        document.body.style.backgroundColor = "#2723c1";
        color = "rgb(55, 122, 250)";
        arr = arr.pets;
      } else if (page.includes("effects")) {
        document.body.style.backgroundColor = "#c08223";
        color = "rgb(255, 177, 53)";
        arr = arr.effects;
      } else {
        arr = arr;
        color = "rgb(0, 0, 0)";
      }
      showInfo(arr, color); // Pass the color to the showInfo function
    })
    .catch(error => console.error('Error fetching data:', error));
}
rinse()




function createNewItem(item, color) {
  const catalog = document.getElementById("ctlg");
  // Create a new item element
  const newItem = document.createElement("div");
  newItem.classList.add("item");
  newItem.style.display = "flex";
  if (item.tradable == false && color != "rgb(201, 96, 254)") {
    const untradable = document.createElement("img");

    untradable.src = "https://i.imgur.com/WLjbELh.png";
    untradable.style.width = "17%";



    untradable.style.height = "auto";
    untradable.style.position = "sticky";
    untradable.style.marginRight = "-73%";
    untradable.style.marginTop = "-13px";

    untradable.setAttribute('draggable', false);
    newItem.appendChild(untradable);
    //price.style.display = "none"; // Hide the price element
  }
  // Create and set the image element
  // Draw image on a canvas instead of using <img>
  if (item.img) {
    const canvas = document.createElement("canvas");
    newItem.dataset.image = item.img;

    canvas.setAttribute("id", "img");
    canvas.style.maxWidth = "100%";
    canvas.style.maxHeight = "100%";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    canvas.style.userSelect = "none";
    canvas.style.webkitUserSelect = "none";
    canvas.style.pointerEvents = "none"; // Optional: block interactions

    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = item.img;

    newItem.appendChild(canvas);
  }


  // Create and set the name element
  let name = document.createElement("div");
  name.id = "h3";
  name.innerText = item.name;

  // Adjust font size based on name length


  if (color == "rgb(55, 122, 250)") {
    newItem.id = "pets";
  } else if (color == "rgb(255, 177, 53)") {
    newItem.id = "effects";
  } else if (color == "rgb(255, 122, 94)") {
    newItem.id = "deaths";
  } else if (color == "rgb(201, 96, 254)") {
    newItem.id = "titles";
    newItem.style.display = "flex";
    newItem.style.alignItems = "center";
    newItem.style.justifyContent = "center";
    name.style.font = "600 234% 'Arimo'";
    name.style.color = "rgb(255 255 255)";
    name.style.whiteSpace = "nowrap";
    name.style.bottom = "-10";
    name.style.margin = "57px 0";
    name.style.position = "relative";

    if (item.style) {

      name.setAttribute("style", item.style);
      name.style.whiteSpace = "nowrap";

      name.style.bottom = "-10";
      name.style.margin = "57px 0";

    }

    if (item.style2) {
      //clone name and parent it to original name

      name.setAttribute("style", item.style2);

      name.style.whiteSpace = "nowrap";

      let clone = name.cloneNode(true);
      name.style.bottom = "-10";
      name.style.margin = "57px 0";
      clone.style.position = "absolute";
      clone.style.textShadow = "none";
      clone.style.fontSize = "1em";
      clone.style.whiteSpace = "nowrap";
      name.appendChild(clone)

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
      //if name has a child, set the child font to item.font
      if (name.children.length > 0) {
        name.childNodes[1].style.font = item.font;
        name.childNodes[1].style.fontSize = "1em";
      }
    }

    if (item.rotate) {
      name.style.transform = "rotate(" + item.rotate + "deg)";
    }

    if (item.tradable == false) {
      name.style.bottom = "-15px";
      newItem.style.flexDirection = "column";
    }




  } else if (color == "rgb(91, 254, 106)") {
    newItem.id = "gears";
  }

  newItem.appendChild(name);
  if (item.style3) {
    name.outerHTML = item.style3;
  }


  if (item.tradable == false && color == "rgb(201, 96, 254)") {

    name.style.bottom = "12px";
    name.style.margin = " 0";
    const untradable = document.createElement("img");

    untradable.src = "https://i.imgur.com/WLjbELh.png";
    untradable.style.width = "17%";
    untradable.style.height = "auto";
    untradable.style.position = "sticky";
    untradable.style.marginRight = "-73%";
    untradable.style.marginBottom = "-44px";

    untradable.setAttribute('draggable', false);
    newItem.appendChild(untradable);
    //price.style.display = "none"; // Hide the price element
  }



  // Create and set the price element
  const price = document.createElement("p");
  price.innerHTML = `<img src=\"https://i.imgur.com/iZGLVYo.png\" draggable="false">${item.price || 0}`;
  newItem.appendChild(price);
  // if item.tradae is false, add the untradable icon and hide price




  // Create and set the from element
  const from = document.createElement("div");
  from.innerText = item.from;
  from.id = "from";
  from.style.display = "none"; // Hide the element
  newItem.appendChild(from);
  // Create and set the rarity element
  const prcdra = document.createElement("div");
  prcdra.innerText = item["price/code/rarity"];
  prcdra.id = "pricecoderarity";
  prcdra.style.display = "none"; // Hide the element
  newItem.appendChild(prcdra);

  // Append the new item to the catalog
  catalog.appendChild(newItem);


}

function showInfo(arr, color) {
  if (color == "rgb(0, 0, 0)") {
    pick = arr.gears;

    for (let step = 0; step < 5; step++) {
      const randomIndex = Math.floor(Math.random() * 5); // Random index between 0 and 4
      if (randomIndex === 0) {
        pick = arr.gears;
        color = "rgb(91, 254, 106)";
      } else if (randomIndex === 1) {
        pick = arr.deaths;
        color = "rgb(255, 122, 94)";
      } else if (randomIndex === 2) {
        pick = arr.titles;
        color = "rgb(201, 96, 254)";
      } else if (randomIndex === 3) {
        pick = arr.pets;
        color = "rgb(55, 122, 250)";
      } else if (randomIndex === 4) {
        pick = arr.effects;
        color = "rgb(255, 177, 53)";
      }

      const item = pick[Math.floor(Math.random() * pick.length)]; // Get random item from the array

      document.getElementById("zd").innerHTML = `${step + 1} items loaded!`;

      createNewItem(item, color);
    }
  } else {
    arr.forEach((item, i) => {
      document.getElementById("zd").innerHTML = `${i + 1} items loaded!`;
      createNewItem(item, color);
    });
  }
}





document.addEventListener("DOMContentLoaded", () => {
  template = document.getElementById("itom");
  const catalog = document.getElementById("ctlg"); // Parent container for items
  const modal = document.getElementById("product-modal");
  const popo = document.getElementById("popo");
  const modalContent = document.getElementById("modal-content");
  const closeModal = document.getElementById("close-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalPrc = document.getElementById("modal-prc");
  const modalDescription = document.getElementById("modal-description");
  const modalPrice = document.getElementById("modal-price-value");
  let main = document.querySelector("main");
  if (main.style.scale == '1') {
    main.style.filter = 'opacity(1)'
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      const currentItem = document.querySelector(".item.showing"); // Find the currently showing item
      if (currentItem) {
        const nextItem = currentItem.nextElementSibling; // Get the next sibling item
        if (nextItem && nextItem.classList.contains("item")) {
          // Simulate a click on the next item to show its modal
          nextItem.click();
        }
      }
    } else if (event.key === "ArrowLeft") {
      const currentItem = document.querySelector(".item.showing"); // Find the currently showing item
      if (currentItem) {
        const prevItem = currentItem.previousElementSibling; // Get the previous sibling item
        if (prevItem && prevItem.classList.contains("item")) {
          // Simulate a click on the previous item to show its modal
          prevItem.click();
        }
      }
    }
  });

  // Simplified modal interaction logic
  let isModalOpen = false;

  catalog.addEventListener("click", (event) => {
    if (isModalOpen) return;

    const item = event.target.closest(".item");
    if (!item) return;

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
    if (item.id !== "titles") {


      const canvas = document.createElement("canvas");
      Object.assign(canvas.style, {
        maxWidth: "100%",
        maxHeight: "100%",
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

    if (item.id === "titles") {
      const clone = item.querySelector("#h3").cloneNode(true);
      Object.assign(clone.style, {
        height: "100%",
        zoom: "1.7",
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
          placeContent: "center"
        });
      }
      clone.classList.add("font");
      modalContent.querySelector("#content-area").insertBefore(clone, modalDescription);
    }

    const splitted = prcdra.split("<br>");
    modalPrice.src = "";
    const modalText = modalPrice.nextSibling;
    modalText.textContent = splitted[0];
    Object.assign(modalText.style, {
      color: "#fff",
      fontSize: "32px",
      fontWeight: 400,
      textStroke: "",
      webkitTextStroke: "",
      textShadow: ""
    });

    popo.parentElement.querySelectorAll(".price").forEach((el, idx) => {
      if (idx > 0) el.remove();
    });

    splitted.slice(1).forEach((line) => {
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
          Object.assign(children[1].style, { fontWeight: 500,textStroke : "1px rgb(255, 83, 219)",webkitTextStroke: "1px rgb(255, 83, 219)" });
          }
          if (text.includes("Robux")) {
          Object.assign(children[1].style, { fontWeight: 700 });
          }

        const iconMap = {
          Robux: "https://i.imgur.com/cf8ZvY7.png",
          Coins: "../imgs/Coin.webp",
          Stars: "https://i.imgur.com/WKeX5AS.png",
          Visors: "https://i.imgur.com/7IoLZCN.png",
          Pumpkins: "https://i.imgur.com/bHRBTrU.png",
          Eggs: "https://i.imgur.com/qMxjgQy.png",
          Baubles: "https://i.imgur.com/wwMMAvr.png",
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

        if (text.includes("%")) {
          children[1].style.color = "rgb(193 68 255)";
          children[1].style.fontWeight = 500;
          children[1].style.textShadow = "0 0 6px rgb(199 0 255)";
        } else if (text.includes("[EXPIRED]")) {
          Object.assign(children[1].style, { fontSize: "23px", color: "rgb(161 17 17)" });
        } else if (text.includes("[ACTIVE]")) {
          Object.assign(children[1].style, { fontSize: "23px", color: "rgb(251 255 68)" });
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

    Object.assign(modalContent.style, {
      position: "absolute",
      top: `${itemRect.top}px`,
      left: `${itemRect.left}px`,
      width: `${itemRect.width}px`,
      height: `${itemRect.height}px`
    });

    setTimeout(() => {
      Object.assign(modalContent.style, {
        position: "relative",
        top: "0",
        left: "0",
        width: "",
        height: "",
        pointerEvents: "all"
      });
      modalContent.classList.add("expand");
    }, 10);
  });

  const closeModalHandler = () => {
    modalContent.classList.remove("expand");
    modal.classList.remove("show");
    modalContent.style.pointerEvents = "none";
    setTimeout(() => {
      isModalOpen = false;
    }, 200)
    
  };

  closeModal.addEventListener("click", closeModalHandler);
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
});


function filterItems() {
  const searchValue = document.getElementById('search-bar').value.toLowerCase();
  const items = document.querySelectorAll('.catalog-grid .item');



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

