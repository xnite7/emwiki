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
  const discordMatch = scammer.Content.match(/discord user:\s*\*\*\s*(.*)/);
  const robloxUserMatch = scammer.Content.match(/roblox user:\s*\*\*\s*(.*)/);
  const robloxProfileMatch = scammer.Content.match(/roblox profile:\s*\*\*\s*(https:\/\/www\.roblox\.com\/users\/\d+\/profile)/);

  const discordid = discordMatch ? discordMatch[1].trim() : "N/A";
  console.log(discordid.split(',')[0])
  let robloxUser = robloxUserMatch ? robloxUserMatch[1].trim() : "N/A";
  const robloxProfile = robloxProfileMatch ? robloxProfileMatch[1].trim() : "#";
  const userIdMatch = robloxProfile.match(/users\/(\d+)\/profile/);
  if (!userIdMatch) return;

  const userId = userIdMatch[1];
  const block = document.createElement('section');
  block.className = 'scammer-block';

  async function loadUserData() {
    block.innerHTML = `
      <div id="loading" style="text-align: center; padding: 40px;">
        <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #ccc; border-top: 4px solid #555; border-radius: 50%; animation: spin 1s linear infinite; margin: auto;"></div>
        <p style="margin-top: 10px;">Loading user data...</p>
      </div>
    `;

    try {
      const response = await fetch(`https://emwikirr.pages.dev/api/roblox-proxy?userId=${userId}&discordId=${discordid.split(',')[0]}`);
      const data = await response.json();

      const imageUrl = data.avatar || 'imgs/plr.jpg';
      robloxUser = data.displayName || robloxUser;
      discordDisplay = data.discordDisplayName;

        
        const baseSize = 9;
        if (robloxUser.textLength >= baseSize) {
          robloxUser.textLength = baseSize - 2
        };
        const fontSize = baseSize - robloxUser.textLength;


      block.innerHTML = `
        <img style="width: 245px; float: left; filter: blur(0px); padding-left: 27px; margin: 50px 0 50px 0;" src="${imageUrl}" alt="Avatar of ${robloxUser}" />
        <div class="gradient" style="position: absolute; background: linear-gradient(0deg, #2c2c2c, transparent, transparent); z-index: 99; width: 241px; height: 231px; top: 75px; padding-left: 35px;"></div>
        <h2 style="font-size:${fontSize}vw">${robloxUser}</h2>
        <p style="margin: 0; font-size: xx-large; font-family: 'BuilderSans'; color: #56697b;"><strong>Discord User:</strong> ${discordDisplay}</p>
        <a href="${robloxProfile}" class="tour-button" style="text-decoration-line: blink;">
          View Roblox Profile
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5l7 7-7 7"></path>
            <path d="M5 12h14"></path>
          </svg>
        </a>
      `;
    } catch (error) {
      console.error("Failed to fetch avatar or user data after retries:", error);
      block.innerHTML = `
        <div style="color: #ff5555; font-weight: bold; margin: 20px; text-align: center;">
          ⚠️ Unable to load user data. Try again later.
        </div>
        <div style="text-align: center;">
          <button onclick="loadUserData()" style="background: #444; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;">
            🔄 Retry
          </button>
        </div>
      `;
    }
  }

  await loadUserData();
  container.appendChild(block);
}


// Fetch scammers JSON
fetch('https://api.github.com/gists/82f0b2c26f32c95ae00cf42cf99323e3')
  .then(results => results.json())
  .then(data => {
    const scammers = JSON.parse(data.files["scammers.json"].content);
    const container = document.getElementById('scammers-container');
    scammers.forEach(scammer => createScammerBlock(scammer, container));
  });
