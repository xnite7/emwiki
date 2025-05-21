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
    })
  })
}




fetch('https://api.github.com/gists/0d0a3800287f3e7c6e5e944c8337fa91')

  .then(results => {

    return results.json();
  })
  .then(data => {

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
  const img = document.createElement("img");
  img.src = item.img;

  img.setAttribute('draggable', false);

  newItem.appendChild(img);

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
    img.style.display = "none";
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

    for (let step = 0; step < 6; step++) {
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
  const modalImage = document.getElementById("modal-image");
  const modalDescription = document.getElementById("modal-description");
  const modalPrice = document.getElementById("modal-price-value");





  let main = document.querySelector("main");

  main.style.filter = 'opacity(1)'





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

  // Ensure the modal is marked as "showing" when opened
  catalog.addEventListener("click", (event) => {
    const item = event.target.closest(".item");
    if (item) {
      document.querySelectorAll(".item").forEach((el) => el.classList.remove("showing")); // Remove "showing" from all items
      item.classList.add("showing"); // Mark the clicked item as "showing"
    }
  });
  // Use event delegation to handle clicks on dynamically created items
  catalog.addEventListener("click", (event) => {

    
    const item = event.target.closest(".item"); // Check if the clicked element is an item
    if (item) {
      // Populate modal with item details
      const title = item.querySelector("#h3").textContent;
      modalContent.style.pointerEvents = "none";
      const imageSrc = item.querySelector("img").src;
      let from = item.querySelector("#from").textContent;
      let prcdra = item.querySelector("#pricecoderarity").textContent;
      const price = item.querySelector("p img").nextSibling.textContent.trim();
      let Omega = '\u{000A}';


      modalContent.style.backgroundColor = item.style.backgroundColor;
      modalTitle.textContent = title;
      modalImage.src = imageSrc;
      modalImage.setAttribute('draggable', false);
      modalPrice.setAttribute('draggable', false);
      modalTitle.style.display = "block";
      modalImage.style.display = "block";

      modalDescription.textContent = from.replace(/<br>/g, Omega);


      // Remove all elements with id "h3" inside the item
      const elementsToRemove = modalImage.parentElement.querySelectorAll(".font");
      elementsToRemove.forEach((element) => element.remove());

      if (item.id == "pets") {
        modalContent.style.backgroundColor = "rgb(39, 102, 221)";
      } else if (item.id == "effects") {
        modalContent.style.backgroundColor = "rgb(243, 164, 37)";
      } else if (item.id == "deaths") {
        modalContent.style.backgroundColor = "rgb(221, 89, 62)";
      } else if (item.id == "titles") {
        modalContent.style.backgroundColor = "rgb(154, 45, 209)";


        modalTitle.style.display = "none";
        modalImage.style.display = "none";
        let clone = item.querySelector("#h3").cloneNode(true);
        clone.style.height = "100%";
        clone.style.zoom = "1.7";
        clone.style.zIndex = "22";
        clone.style['margin'] = "31px  0px 46px 0px";
        clone.style['align-self'] = "center";
        clone.style.position = "relative";

        if (clone.children.length > 0) {
            clone.childNodes[1].style.height = "97%";
            clone.childNodes[1].style.position = "absolute";
            clone.childNodes[1].style['place-content'] = "center";
        }

        clone.classList.add('font');
        clone.style['align-content'] = "center";
        modalImage.parentElement.insertBefore(clone, modalImage);

      } else if (item.id == "gears") {
        modalContent.style.backgroundColor = "rgb(55, 205, 68)";
      }

      //if prcdra has multiple lines, split them and duplicate the modalPrice

      let splitted = prcdra.split("<br>");


      modalPrice.src = "../imgs/trs.png";
      modalPrice.nextSibling.textContent = splitted[0]
      modalPrice.nextSibling.style.color = "rgb(255 255 255)";
      modalPrice.nextSibling.style.fontSize = "32px"
      modalPrice.nextSibling.style.fontWeight = 400;
      modalPrice.nextSibling.style['-webkit-text-stroke'] = "";
      modalPrice.nextSibling.style['text-stroke'] = "";
      modalPrice.nextSibling.style['text-shadow'] = ""
      let elements = popo.parentElement.querySelectorAll(".price")
      elements.forEach((element, index) => {
        if (index > 0) {
          //remove lines
          element.remove();
        }
      });

      if (splitted.length > 0) {
        splitted.forEach((line, index) => {
          if (index > 0) {
            let newPrice = popo.cloneNode(true);




            popo.parentElement.appendChild(newPrice);

            popo.childNodes[1].textContent = line; // Set the text content to the current line

          }
        });
      }

      const prices = popo.parentElement.querySelectorAll(".price");

      prices.forEach((price) => {
        const children = price.children; // Use a separate variable for clarity
        if (children.length > 1) { // Ensure there are at least two children
          if (children[1].textContent.includes("Robux")) {
            children[1].textContent = children[1].textContent.replace(" Robux", "");
            children[0].src = "https://i.imgur.com/cf8ZvY7.png";
            children[1].style.fontWeight = 700;

          } else if (children[1].textContent.includes("Coins")) {
            children[1].textContent = children[1].textContent.replace(" Coins", "");
            children[0].src = "../imgs/Coin.webp";

          } else if (children[1].textContent.includes("Stars")) {
            children[1].textContent = children[1].textContent.replace(" Stars", "");
            children[0].src = "https://i.imgur.com/WKeX5AS.png";
          } else if (children[1].textContent.includes("Visors")) {
            children[1].textContent = children[1].textContent.replace(" Visors", "");
            children[0].src = "https://i.imgur.com/7IoLZCN.png";
          } else if (children[1].textContent.includes("Pumpkins")) {
            children[1].textContent = children[1].textContent.replace(" Pumpkins", "");
            children[0].src = "https://i.imgur.com/bHRBTrU.png";
          } else if (children[1].textContent.includes("Eggs")) {
            children[1].textContent = children[1].textContent.replace(" Eggs", "");
            children[0].src = "https://i.imgur.com/qMxjgQy.png";
          } else if (children[1].textContent.includes("Baubles")) {
            children[1].textContent = children[1].textContent.replace(" Baubles", "");
            children[0].src = "https://i.imgur.com/wwMMAvr.png";

          } else if (children[1].textContent.includes("Tokens") || children[1].textContent.includes("Token")) {
            children[1].textContent = children[1].textContent.replace(" Tokens", "");
            children[1].textContent = children[1].textContent.replace(" Token", "");
            children[0].src = "https://i.imgur.com/Cy9r140.png";
            children[1].style.color = "rgb(255 255 255)";
            children[1].style['-webkit-text-stroke'] = "1px rgb(255, 83, 219)";
            children[1].style['text-stroke'] = "1px rgb(255, 83, 219)";
            children[1].style.fontWeight = 500;
          } else if (children[1].textContent.includes("%")) {
            children[1].style.color = "rgb(193 68 255)";
            children[1].style.fontWeight = 500;
            children[1].style['text-shadow'] = "0 0 6px rgb(199 0 255)";
          } else if (children[1].textContent.includes("[EXPIRED]")) {
            children[1].style.fontSize = "23px"
            children[1].style.color = "rgb(161 17 17)";
          } else if (children[1].textContent.includes("[ACTIVE]")) {
            children[1].style.fontSize = "23px"
            children[1].style.color = "rgb(251 255 68)";
          } else if (children[1].textContent.includes("Unobtainable")) {
            children[0].src = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Red_x.svg/600px-Red_x.svg.png";
            children[1].style.color = "rgb(255 44 44)";
          }
          if (children[1].textContent == "") {
            price.style.display = "none";
          } else {
            price.style.display = "flex";
          }
        }
      });

      if (prices.length > 1) { // Ensure there are at least two children
        prices.forEach((price) => {

          for (let i = 0; i < prices.length; i++) {
            if (prices[i].childNodes[1].textContent == price.childNodes[1].textContent) {
              if (prices[i].style.display == "none" || price.style.display == "none") {
                return;
              }
              if (prices[i] == price) {
                return;
              }
              price.style.display = "none";
            } else {

              price.style.display = "flex";
            }
          }
        });
      }

      modalPrc.innerHTML = `<img src="https://i.imgur.com/iZGLVYo.png" style="height: 37px;">${price || 0}`; // Set the price

      // Show the modal
      modal.style.display = "flex";
      modal.classList.add("show");

      // Get the item's position and size
      const itemRect = item.getBoundingClientRect();

      // Set the modal content's initial position and size
      modalContent.style.position = "absolute";
      modalContent.style.top = `${itemRect.top}px`;
      modalContent.style.left = `${itemRect.left}px`;
      modalContent.style.width = `${itemRect.width}px`;
      modalContent.style.height = `${itemRect.height}px`;

      // Show the modal
      modal.classList.add("show");

      // Trigger the animation to expand the modal
      setTimeout(() => {
        modalContent.style.position = "relative";
        modalContent.style.top = "0";
        modalContent.style.left = "0";
        modalContent.style.width = "";
        modalContent.style.height = "";
        modalContent.classList.add("expand");
        modalContent.style.pointerEvents = "all";
      }, 10); // Small delay to ensure the transition starts
      
    }
  });

  closeModal.addEventListener("click", () => {
    // Reverse the animation
    modalContent.classList.remove("expand");
    modal.classList.remove("show");
     modalContent.style.pointerEvents = "none";
  });

  // Close modal when clicking outside the modal content
  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modalContent.classList.remove("expand");
      modal.classList.remove("show");
       modalContent.style.pointerEvents = "none";
    }
  });

  window.addEventListener("touchend", (event) => {
    if (event.target === modal) {
      modalContent.classList.remove("expand");
      modal.classList.remove("show");
       modalContent.style.pointerEvents = "none";
    }
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

