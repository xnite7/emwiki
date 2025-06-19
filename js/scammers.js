// Filter function
function filterItems() {
  const searchValue = document.getElementById('search-bar').value.toLowerCase();
  const items = document.querySelectorAll('.grid .scammer-block');

  items.forEach(item => {
    const itemText = item.querySelector('h2')?.textContent.toLowerCase() || "";
    const itemText2 = item.querySelector('p')?.textContent.toLowerCase() || "";
    item.style.display = (itemText.includes(searchValue) || itemText2.includes(searchValue)) ? 'block' : 'none';
  });
}

// Create scammer block
async function createScammerBlock(scammer, container) {
  const {
    robloxUser = "Unknown",
    robloxProfile = "#",
    avatar = "imgs/plr.jpg",
    discordDisplay = null,
    victims = null,
    itemsScammed = null,
    robloxAlts = null
  } = scammer;
  
  console.log(scammer);

  const block = document.createElement('section');
  block.className = 'scammer-block';

  block.innerHTML = `
    <div class="scammer-content">
      <img class="scammer-img" src="${avatar}" alt="Avatar of ${robloxUser}" />
      <div class="scammer-info">
        <a href="${robloxProfile}"><h2>${robloxUser}<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5l7 7-7 7"></path>
            <path d="M5 12h14"></path>
          </svg></h2></a>
        ${discordDisplay && discordDisplay.trim() !== "NA"
      ? `<p style="color: #ffffff;align-self: center;width: fit-content;border-radius: 21px;padding: 7px 14px;background: cornflowerblue;filter: brightness(0.7);"><img src="../imgs/discord.png" style="width: 28px;"> ${discordDisplay}</p>`
      : ""}
        ${victims && victims.trim() !== "NA"
      ? `<p><strong>Victims:</strong> ${victims}</p>`
      : ""}
        ${itemsScammed && itemsScammed.trim() !== "NA"
      ? `<p><strong>Items Scammed:</strong> ${itemsScammed}</p>`
      : ""}
        ${robloxAlts ? `<p><strong>Alts:</strong> <a href="${robloxAlts}" target="_blank">${robloxAlts}</a></p>` : ""}
        
      </div>
    </div>
  `;

  container.appendChild(block);
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById('scammers-container');
  if (!container) return console.error('Missing #scammers-container in HTML');

  container.innerHTML = '<p class="loading">Loading scammers...</p>';

  fetch('https://emwiki.site/api/roblox-proxy?mode=discord-scammers')
    .then(res => res.json())

    .then(data => {
      container.innerHTML = '';
      console.log("Fetched data:", data);

      // scammers is now an array directly on data
      if (data && Array.isArray(data.scammers)) {
        data.scammers.forEach(scammer => createScammerBlock(scammer, container));
      } else {
        console.error("Scammers data is not an array", data && data.scammers, data);
        container.innerHTML = `<p class="error">Failed to load scammers list. Please try again later.</p>`;
      }
    })

    .catch(err => {
      container.innerHTML = `<p class="error">Failed to load scammers. Please try again later.</p>`;
      console.error("Failed to fetch scammers:", err);
    });
});
//<a href="${robloxProfile}" class="tour-button">
//         View Roblox Profile
//        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
//       <path d="M12 5l7 7-7 7"></path>
//         <path d="M5 12h14"></path>
//      </svg>
//   </a>