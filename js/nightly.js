fetch('https://emwiki.site/api/gist-version')
  .then(results => results.json())
  .then(data => {
    let arr = JSON.parse(data?.files["auto.json"]?.content);
    let color;
    showInfo(arr, color);
  })
  .catch(error => console.error('Error fetching data:', error));





function createNewItem(item, color, list, date) {
  const newItem = document.createElement("div");
  newItem.classList.add("item");

  newItem.style.scale = "1";
  newItem.style.backgroundColor = color;
  newItem.id = item.listName;
  // Untradable icon for non-titles

  // Retired tag
  if (item.retired) {
    newItem.style.border = "solid 3px red"
    console.log(item.name + " is retired");


    const retiredTag = document.createElement("span");
    retiredTag.classList.add('retired-badge')
    retiredTag.innerHTML = 'RETIRED'

    newItem.appendChild(retiredTag)
    newItem.style.order = "10"


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

  if (item.tradable === false && newItem.id === "titles") {
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
    if (newItem.id === "titles") {
      canvas.style.position = "absolute";
    }

  }

  // Name element
  let name = document.createElement("div");
  name.id = "h3";
  name.innerText = item.name;

  if (item.img) {
    if (newItem.id === "titles") {
      name.style.visibility = "hidden";
    }
  }

  if (item.new) {
    name.style.order = "-1";
  }


  if (newItem.id === "titles") {
    newItem.style.alignItems = "center";
    newItem.style.justifyContent = "center";
    name.style.font = "600 28px 'Arimo'";
    name.style.color = "rgb(255 255 255)";
    name.style.whiteSpace = "nowrap";
    name.style.bottom = "-10";
    name.style.paddingTop = "0px";
    name.style.margin = "45px 0";
    name.style.position = "relative";
    if (item.style) {
      name.setAttribute("style", item.style);
      name.style.whiteSpace = "nowrap";
      name.style.bottom = "-10";
      name.style.margin = "45px 0";
    }
    if (item.style2) {
      name.setAttribute("style", item.style2);
      name.style.whiteSpace = "nowrap";
      let clone = name.cloneNode(true);
      name.style.bottom = "-10";
      name.style.margin = "45px 0";
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
  }

  newItem.appendChild(name);
  if (item.style3) {
    name.outerHTML = item.style3;
  }

  // Untradable icon for titles
  if (item.tradable === false && newItem.id === "titles") {
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


  newItem.classList.add('item', 'item-refresh-animate');



  list.appendChild(newItem);
}


function normalizeMonth(monthStr) {
  const monthAbbrs = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const clean = monthStr.replace(/\.$/, '');
  return monthAbbrs.includes(clean) ? `${clean}.` : monthStr;
}


function monthToIndex(month) {
  const normalized = month.replace('.', ''); // remove trailing dot if any
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(normalized);
}


function showInfo(arr, color) {
  const gamenightItems = {};

  for (const [listName, list] of Object.entries(arr)) {
    list.forEach(item => {
      item.listName = listName;

      if (item.from && item.from.toLowerCase().includes("gamenight")) {


        if (item.from) {
          const matches = [...item.from.matchAll(/\(([^)]+)\)/g)];

          if (matches) {
            matches.forEach(match => {
              const raw = match[1].trim();
              if (!/^[A-Za-z]{3,9}\.? ?\d{4}$/.test(raw)) return;
              const yearMatch = raw.match(/\b\d{4}\b/);
              if (yearMatch) {
                const year = yearMatch[0];
                const parts = raw.split(',').map(p => p.trim());

                parts.forEach(part => {
                  if (part === year) return;

                  const partYearMatch = part.match(/\b\d{4}\b/);
                  if (partYearMatch) {
                    let normalizedPart = part;
                    const monthMatch = part.match(/[A-Za-z]{3,4}\.?/);
                    if (monthMatch) {
                      const normalizedMonth = normalizeMonth(monthMatch[0]);
                      normalizedPart = `${partYearMatch[0]} ${normalizedMonth}`;
                    }
                    gamenightItems[normalizedPart] = gamenightItems[normalizedPart] || [];
                    gamenightItems[normalizedPart].push(item);
                  } else {
                    const normalizedMonth = normalizeMonth(part);
                    const dateKey = `${year} ${normalizedMonth}`;
                    gamenightItems[dateKey] = gamenightItems[dateKey] || [];
                    gamenightItems[dateKey].push(item);
                  }
                });
              } else {
                const parts = raw.split(',').map(p => p.trim());
                parts.forEach(part => {
                  gamenightItems["Unknown"] = gamenightItems["Unknown"] || [];
                  gamenightItems["Unknown"].push(item);
                });
              }
            });
          }
        }
      }
    });
  }

  const itemSetMap = new Map();

  for (const [date, items] of Object.entries(gamenightItems)) {
    const key = JSON.stringify(items.map(i => i.name).sort());

    if (!itemSetMap.has(key)) {
      itemSetMap.set(key, {
        dates: [date],
        items,
      });
    } else {
      itemSetMap.get(key).dates.push(date);
    }
  }

  const sortedSections = Array.from(itemSetMap.values()).sort((a, b) => {
    const parseDate = (str) => {
      const [year, month] = str.split(' ');
      return [parseInt(year), monthToIndex(month || '')];
    };

    const aDate = parseDate(a.dates[0]);
    const bDate = parseDate(b.dates[0]);

    return bDate[0] - aDate[0] || bDate[1] - aDate[1];
  });

  for (const { dates, items } of sortedSections) {
    const section = document.createElement("section");
    section.classList.add("catalog");
    section.style.marginBottom = "53px";
    //section.style.background = "linear-gradient(0deg, #313131, #313131, #1e1e1e, #2b2b2b)";
    section.innerHTML = `<h2>${dates.sort((a, b) => {
      const [ay, am] = a.split(' ');
      const [by, bm] = b.split(' ');
      return parseInt(by) - parseInt(ay) || monthToIndex(bm) - monthToIndex(am);
    }).join(', ')}</h2>`;

    const gridContainer = document.createElement("div");
    gridContainer.classList.add("papi");
    gridContainer.style.display = "flex";
    gridContainer.style.flexDirection = "row";
    gridContainer.style.width = "auto";
    gridContainer.style.margin = "0px 34px";
    gridContainer.style.justifyItems = "center";
    gridContainer.style.gap = "32px";
    gridContainer.style.alignItems = "baseline";
    gridContainer.style.alignContent = "space-around";
    gridContainer.style.justifyContent = "start";
    gridContainer.style.flexWrap = "wrap";
    gridContainer.style.alignItems = "center";
    gridContainer.style.justifyContent = "center";


    items.forEach(item => {
      createNewItem(item, color, gridContainer, dates.join(', '));
    });

    section.appendChild(gridContainer);
    document.querySelector(".papi").appendChild(section);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.overflow = "scroll"
  document.documentElement.style.overflowX = "hidden"
  let main = document.querySelector("main");
  main.style.filter = 'opacity(1)'
  main.style.scale = '1'
});


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
  console.log(nav);
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