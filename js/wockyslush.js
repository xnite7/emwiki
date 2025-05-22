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
  name.innerText = item.name;
  name.style.pointerEvents = "none";



  if (newItem.id == "titles") {

    newItem.id = "titles";
    newItem.style.display = "flex";
    newItem.style.alignItems = "center";
    newItem.style.justifyContent = "center";
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
      console.log(newItem)
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
    untradable.style.position = "relative";
    untradable.style.top = "-21px";
    untradable.style.right = "-72px";
    untradable.style.zIndex = "1";
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

  // Append the new item to the catalog
  list.appendChild(newItem);
}





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
    });
  };
  const chests = [steelChestItems, elusiveBagItems, legendaryChestItems, itemcrateItems, luckyChestItems, epicChestItems, mysterybagItems, typicalChestItems, premiumChestItems, hrplaytimeItems, gamenightItems];
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
      }

      // Check if the item's parent is "pets" and set the color to orange
      if (item.parent && item.parent.toLowerCase() === "pets") {
        color = "rgb(255, 165, 0)"; // Orange color
      }

      createNewItem(item, color, listElement);
    });
  });



  function showTooltip(e) {

    if (e.target.classList.contains("item")) {
      var element = e.target;
    }else{
      return;
    }

    let rect = element.getBoundingClientRect();

    if (document.querySelector(".tooltip")) {





      
      var tooltip = document.querySelector(".tooltip")

        ? document.querySelector(".tooltip")
        : document.querySelector(":scope .tooltip");
      


      //get child with id pricefromrarity
      var pricefromrarity = element.querySelector("#pricecoderarity");
      

      if (pricefromrarity.innerText=="") {
        return;
      }
      tooltip.innerHTML = `
            <div id="tooltipname">${pricefromrarity.innerText}</div>
            `;

      tooltip.style.opacity = "1";

      tooltip.style.left =
        (rect.x + tooltip.clientWidth + 10 < document.body.clientWidth)
          ? (rect.x + 140 + window.scrollX + "px")
          : (document.body.clientWidth + 5 - tooltip.clientWidth + window.scrollX + "px");
      tooltip.style.top =
        (rect.y + tooltip.clientHeight + 10 < document.body.clientHeight)
          ? (rect.y + 10 + window.scrollY + "px")
          : (document.body.clientHeight + 5 - tooltip.clientHeight + window.scrollY + "px");

    }
  }

  var tooltips = document.querySelectorAll('.item');
  tooltips.forEach((item, i) => {
    item.addEventListener('mouseover', showTooltip);


    item.addEventListener('mouseout', function () {
      var tooltip = document.querySelector(".tooltip")
      tooltip.style.opacity = "0";




    });
  })
};

