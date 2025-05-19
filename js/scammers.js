

function filterItems() {
  const searchValue = document.getElementById('search-bar').value.toLowerCase();
  const items = document.querySelectorAll('.grid .scammer-block');

  items.forEach(item => {
    console.log(item);
      const itemText = item.querySelector('h2').textContent.toLowerCase();
      const itemText2 = item.querySelector('p').textContent.toLowerCase();
      if (itemText.includes(searchValue) || itemText2.includes(searchValue)) {
          item.style.display = 'block';
      } else {
          item.style.display = 'none';
      }
  });
}
    

fetch('https://api.github.com/gists/82f0b2c26f32c95ae00cf42cf99323e3')

  .then(results => {

      return results.json();
  })
  .then(data => {

    let scammers = JSON.parse(data.files["scammers.json"].content); // Parse the JSON content

    // Get the container where the blocks will be added
    const container = document.getElementById('scammers-container');

    // Loop through each scammer and create a block for their message
    scammers.forEach(async (scammer) => {


      // Extract the "display", "roblox user", and "roblox profile" using regex
      const discordMatch = scammer.Content.match(/\*\*<:pinkdot:.*?> discord user: \*\*(.*)/);
      const displayMatch = scammer.Content.match(/\*\*<:pinkdot:.*?> display: \*\*(.*)/);
      const robloxUserMatch = scammer.Content.match(/\*\*<:pinkdot:.*?> roblox user: \*\*(.*)/);
      const robloxProfileMatch = scammer.Content.match(/\*\*roblox profile:\*\* (https:\/\/www\.roblox\.com\/users\/\d+\/profile)/);

      var id = discordMatch ? discordMatch[1].trim() : "N/A";
      console.log(id)


      // You might want to store this in an environment variable or something
      if (id != "N/A") {
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl+`https://discord.com/api/v9/users/${id}`, {
})
        const data = await response.json();
        console.log(data)
        }
      
      



      const display = displayMatch ? displayMatch[1].trim() : "N/A";
      const robloxUser = robloxUserMatch ? robloxUserMatch[1].trim() : "N/A";
      const robloxProfile = robloxProfileMatch ? robloxProfileMatch[1].trim() : "#";

      // Extract the user ID from the Roblox profile URL
      const userIdMatch = robloxProfile.match(/users\/(\d+)\/profile/);
      if (!userIdMatch) {
        console.error("Invalid Roblox profile URL:", robloxProfile);
        return;
      }
      const block = document.createElement('section');
      block.className = 'scammer-block';

      const userId = userIdMatch ? userIdMatch[1] : null;

      // Fetch the avatar image using a proxy
      if (userId) {
        const proxyUrl = 'https://corsproxy.io/?';
        const avatarUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=100x100&format=Png&isCircular=false`;

        try {
          const response = await fetch(proxyUrl+avatarUrl);
          const data = await response.json();
          const imageUrl = data.data[0]?.imageUrl || './imgs/plr.jpg';

          if (imageUrl) {
            block.innerHTML += `<img style="width: 245px;
        float: left;
        filter: blur(0px);
        padding-left: 27px;
        margin: 50px 0 50px 0;" src="${imageUrl}" alt="Avatar of ${robloxUser}" /><div class="gradient" style="position: absolute;
              background: linear-gradient(0deg, #2c2c2c, transparent, transparent);
              z-index: 99;
              width: 241px;
              height: 231px;
              top: 75px;
              padding-left: 35px;"></div>`;
          }
        } catch (error) {
          //console.error("Failed to fetch avatar image:", error);
          if (imageUrl) {
            block.innerHTML += `<img style="width: 245px;
            float: left;
            filter: blur(0px);
            padding-left: 27px;
            margin: 50px 0 50px 0;" src="${'../imgs/plr.jpg'}" alt="Could not Load avatar" /><div class="gradient" style="position: absolute;
              background: linear-gradient(0deg, #2c2c2c, transparent, transparent);
              z-index: 99;
              width: 241px;
              height: 231px;
              top: 75px;
              padding-left: 35px;"></div>`;
          }
        }
      }

      // Create the HTML structure
      block.innerHTML += `
        <h2>${robloxUser}</h2>
        <p style="margin: 0;font-size: xx-large;
        font-family: 'BuilderSans';
        color: #56697b;"><strong>Discord User:</strong> ${display}</p>

            <a href="${robloxProfile}" class="tour-button" data-tilt-transform-element="" style="text-decoration-line: blink;">
                View Roblox Profile
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5l7 7-7 7"></path>
                    <path d="M5 12h14"></path>
                </svg>
            </a>
      `;
      container.appendChild(block);
    });
  })