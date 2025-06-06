fetch('https://api.github.com/gists/0d0a3800287f3e7c6e5e944c8337fa91')

  .then(results => {

    return results.json();
  })
  .then(data => {

    // Determine the current page and select the appropriate data
    let arr = JSON.parse(data.files["auto.json"].content); // Parse the JSON content
    let color;

    showInfo(arr, color); // Pass the color to the showInfo function

  })
  .catch(error => console.error('Error fetching data:', error));

function createNewItem(item, color, list) {

  // Create a new item element
  const newItem = document.createElement("div");
  newItem.classList.add("item");
  newItem.style.display = "block";
  newItem.style.backgroundColor = color;
  newItem.id = item.listName;





  // Create and set the name element
  const name = document.createElement("div");
  name.id = "h3";
  name.classList.add('itemname')
  name.innerText = item.name;
  name.style.pointerEvents = "none";



  if (newItem.id == "titles") {
    
    name.classList.remove('itemname')
    newItem.id = "titles";
    newItem.style.display = "flex";
    newItem.style.alignItems = "center";
    newItem.style.justifyContent = "center";
    
    //newItem.style.flexDirection = "column";
    name.style.bottom = "0";
    name.style.font = "600 47px 'Arimo'";
    name.style.color = "rgb(255 255 255)";


    if (item.style) {

      name.setAttribute("style", item.style);

    }

    if (item.style2) {
      //clone name and parent it to original name

      name.setAttribute("style", item.style2);

      let clone = name.cloneNode(true);

      clone.style.position = "absolute";
      clone.style.textShadow = "none";
      clone.style.fontSize = "1em";
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

  } else {

    const canvas = document.createElement("canvas");

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


    }
      img.src = item.img;

      newItem.appendChild(canvas);

  }

  // Adjust font size based on name length
  if (item.name.length > 28) {
    name.style.fontSize = "16px";
  } else if (item.name.length > 18) {
    name.style.fontSize = "18px";
  } else {
    name.style.fontSize = "24px";
  }

  newItem.appendChild(name);

  // Create and set the price element
  const price = document.createElement("p");
  price.innerHTML = `<img src=\"https://i.imgur.com/iZGLVYo.png\" draggable="false">${item.price || 0}`;
  newItem.appendChild(price);
  // if item.tradae is false, add the untradable icon and hide price

  if (item.tradable == false) {
    const untradable = document.createElement("img");
    color = color - "rgb(30 30 30)";
    untradable.src = "https://i.imgur.com/WLjbELh.png";
    untradable.style.width = "33px";
    untradable.style.height = "auto";
    untradable.style.position = "absolute";
    untradable.style.bottom = "10px";
    untradable.style.right = "10px";
    untradable.style.zIndex = "1";
    newItem.style.scale = "1";
    untradable.setAttribute('draggable', false);
    newItem.appendChild(untradable);
    price.style.display = "none"; // Hide the price element
  }


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




    if (item.retired) {
      newItem.style.border = "solid 3px darkred"


      const retiredTag = document.createElement("span");
      retiredTag.classList.add('retired-badge')
      retiredTag.innerHTML='RETIRED'
      
      newItem.appendChild(retiredTag)
      newItem.style.order="10"

      if (newItem.id == "titles"){
        retiredTag.style.top = "42%";
      }
    }



    newItem.addEventListener('mouseenter', function (e) {
    const tooltip = document.getElementById('tooltip');

    // Generate a unique random anchor name
    const anchorName = `anchor-${Math.floor(Math.random() * 1_000_000)}`;

    // Set unique anchor-name style
    const oldstyle = newItem.getAttribute('style') || '';
    newItem.setAttribute('style', `${oldstyle}anchor-name: --${anchorName};`);

    // Set tooltip anchor positioning
    tooltip.setAttribute('style', `top:anchor(--${anchorName} bottom); left:anchor(--${anchorName} center); position-anchor: --${anchorName};`);

    // Set tooltip content
    let pricefromrarity = newItem.querySelector("#pricecoderarity");
    if (newItem.parentElement.id === 'gamenightitems') {
      pricefromrarity = newItem.querySelector("#from");
    }
    if (!pricefromrarity || !pricefromrarity.innerText || pricefromrarity.innerText === "Unobtainable") return;

    tooltip.innerHTML = pricefromrarity.innerText;
    tooltip.showPopover();
  });

  newItem.addEventListener('mouseleave', function () {
    const tooltip = document.getElementById('tooltip');
    tooltip.hidePopover();
  });



  // Append the new item to the catalog
  list.appendChild(newItem);
}


  var shelfs = document.querySelectorAll(".shelf-oppener")

  shelfs.forEach((e) => {
    e.innerText = 'V'
    e.addEventListener("click", function () {
      console.log(e.style.rotate)
      if (e.style.rotate == '-180deg'){
       // e.parentElement.querySelector('.psp').style.display="block";
       e.parentElement.querySelector('.psp').style.width="auto"
        e.parentElement.querySelector('.catalog-grid').style.display="grid";
        e.style.rotate = '0deg'
      }else{
      //  e.parentElement.querySelector('.psp').style.display="none";
      e.parentElement.querySelector('.psp').style.width="-webkit-fill-available"
        e.parentElement.querySelector('.catalog-grid').style.display="none";
        e.style.rotate = '-180deg'
      }

    });
  })


function showInfo(arr, color) {
  const steelChestItems = [];
  const elusiveBagItems = [];
  const legendaryChestItems = [];
  const itemcrateItems = [];
  const luckyChestItems = [];
  const epicChestItems = [];
  const mysterybagItems = [];
  const typicalChestItems = [];
  const premiumChestItems = [];
  const hrplaytimeItems = [];
  const gamenightItems = [];
  const drsecretItems = [];
  const staffitems = [];
  for (const [listName, list] of Object.entries(arr)) {


    list.forEach(item => {
      item.listName = listName;
      if (item.from && item.from.toLowerCase().includes("steel chest")) {
        steelChestItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("elusive bag")) {
        elusiveBagItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("legendary chest")) {
        legendaryChestItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("lucky chest")) {
        luckyChestItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("epic chest")) {
        epicChestItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("item crate")) {
        itemcrateItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("mystery bag")) {
        mysterybagItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("typical chest")) {
        typicalChestItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("premium chest")) {
        premiumChestItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("1hr playtime rewards")) {
        hrplaytimeItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("gamenight")) {
        gamenightItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("secret item (daily rewards)")) {
        drsecretItems.push(item);
      }
      if (item.from && item.from.toLowerCase().includes("staff item")) {
        staffitems.push(item);
      }
    });
  };
  const chests = [steelChestItems, elusiveBagItems, legendaryChestItems, itemcrateItems, luckyChestItems, epicChestItems, mysterybagItems, typicalChestItems, premiumChestItems, hrplaytimeItems, gamenightItems, drsecretItems, staffitems];
  chests.forEach((chestItems) => {
    chestItems.forEach((item) => {
      let listElement;
      if (item.from.toLowerCase().includes("steel chest")) {
        listElement = document.getElementById("steelchest");
      } else if (item.from.toLowerCase().includes("elusive bag")) {
        listElement = document.getElementById("elusivebag");
      } else if (item.from.toLowerCase().includes("legendary chest")) {
        listElement = document.getElementById("legendarychest");
      } else if (item.from.toLowerCase().includes("lucky chest")) {
        listElement = document.getElementById("luckychest");
      } else if (item.from.toLowerCase().includes("epic chest")) {
        listElement = document.getElementById("epicchest");
      } else if (item.from.toLowerCase().includes("item crate")) {
        listElement = document.getElementById("itemcrate");
      } else if (item.from.toLowerCase().includes("mystery bag")) {
        listElement = document.getElementById("mysterybag");
      } else if (item.from.toLowerCase().includes("typical chest")) {
        listElement = document.getElementById("typicalchest");
      } else if (item.from.toLowerCase().includes("premium chest")) {
        listElement = document.getElementById("premiumchest");
      } else if (item.from.toLowerCase().includes("1hr playtime rewards")) {
        listElement = document.getElementById("1hrplaytimerewards");
      } else if (item.from.toLowerCase().includes("gamenight")) {
        listElement = document.getElementById("gamenightitems");
      } else if (item.from.toLowerCase().includes("secret item (daily rewards)")) {
        listElement = document.getElementById("drsecretitems");
      } else if (item.from.toLowerCase().includes("staff item")) {
        listElement = document.getElementById("staffitems");
      }

      // Check if the item's parent is "pets" and set the color to orange
      if (item.parent && item.parent.toLowerCase() === "pets") {
        color = "rgb(255, 165, 0)"; // Orange color
      }

      createNewItem(item, color, listElement);
    });
  });
};
function reorderChestsIfMobile() {
  const containers = document.querySelectorAll('.grid'); // all grid wrappers

  console.log(containers); 
  console.log(window.innerWidth); 

  if (window.innerWidth < 600 && containers.length) {
    // Collect all .catalog elements from all .grid containers
    const chests = [];
    containers.forEach(container => {
      chests.push(...container.querySelectorAll('.catalog'));
    });

    // Sort by data-order attribute
    chests.sort((a, b) => {
      return parseInt(a.getAttribute('data-order')) - parseInt(b.getAttribute('data-order'));
    });

    // Append in sorted order to the first .grid container
    chests.forEach(chest => containers[0].appendChild(chest));
  }else {
    // If not mobile, ensure the original order is restored
    containers.forEach(container => {
      const chests = container.querySelectorAll('.catalog');
      chests.forEach(chest => {
        // Reset the order by appending them back to their original container
        container.appendChild(chest);
      });
    });
  }
}


window.addEventListener('load', reorderChestsIfMobile);
window.addEventListener('resize', reorderChestsIfMobile);