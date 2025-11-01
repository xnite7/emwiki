
					const messagesDiv = document.getElementById("messages");
					const indicatorDiv = document.getElementById("indicator");
					const input = document.getElementById("chatInput");

					const socket = new WebSocket("wss://cf-chat-backend.xnite7.workers.dev/chat");
					socket.addEventListener("open", () => {
						indicatorDiv.innerHTML = `🟢`;
					});
					socket.addEventListener("message", (event) => {
						let data;
						try {
							data = JSON.parse(event.data);
							if (data.user && data.text) {
								messagesDiv.innerHTML += `<div><b>${data.user}:</b> ${data.text}</div>`;
							} else if (data.type === "user" && data.name) {
								// Optionally handle user assignment message
							}
						} catch {
							// Fallback for plain text messages
							messagesDiv.innerHTML += `<div>${event.data}</div>`;
						}
						messagesDiv.scrollTop = messagesDiv.scrollHeight;
					});
					input.addEventListener("keypress", (e) => {
						if (e.key === "Enter") {
							const message = input.value.trim();
							if (message) {
								socket.send(message);
								input.value = "";
							}
						}
					});
					socket.addEventListener("close", () => {
						indicatorDiv.innerHTML = `🔴`;
					});
                    socket.addEventListener("error", (e) => {
  indicatorDiv.innerHTML = `🔴`;
});
				