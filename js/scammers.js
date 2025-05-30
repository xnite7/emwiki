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
    robloxUser = "N/A",
    robloxProfile = "#",
    avatar = "imgs/plr.jpg",
    discordDisplay = "N/A",
    victims = "Unknown",
    itemsScammed = "Unknown",
    robloxAlts = null
  } = scammer;

  const block = document.createElement('section');
  block.className = 'scammer-block';

  block.innerHTML = `
    <div class="scammer-content">
      <img class="scammer-img" src="${avatar}" alt="Avatar of ${robloxUser}" />
      <div class="scammer-info">
        <h2>${robloxUser}</h2>
        <p><strong>Discord User:</strong> ${discordDisplay}</p>
        <p><strong>Victims:</strong> ${victims}</p>
        <p><strong>Items Scammed:</strong> ${itemsScammed}</p>
        ${robloxAlts ? `<p><strong>Alts:</strong> <a href="${robloxAlts}" target="_blank">${robloxAlts}</a></p>` : ""}
        <a href="${robloxProfile}" class="tour-button">
          View Roblox Profile
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5l7 7-7 7"></path>
            <path d="M5 12h14"></path>
          </svg>
        </a>
      </div>
    </div>
  `;

  container.appendChild(block);
}

// Show loading indicator
const container = document.getElementById('scammers-container');
container.innerHTML = '<p class="loading">Loading scammers...</p>';

// Load scammers
fetch('https://emwiki.site/api/roblox-proxy?mode=discord-scammers')
  .then(res => res.json())
  .then(data => {
    container.innerHTML = ''; // Clear loading text
    data.forEach(scammer => createScammerBlock(scammer, container));
  })
  .catch(err => {
    container.innerHTML = `<p class="error">Failed to load scammers. Please try again later.</p>`;
    console.error("Failed to fetch scammers:", err);
  });
