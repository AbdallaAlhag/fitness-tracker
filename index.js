const { ipcRenderer } = require("electron");

document.getElementById("connect").onclick = async () => {
  await ipcRenderer.invoke("start-oauth");
};

ipcRenderer.on("oauth-done", async () => {
  const result = await ipcRenderer.invoke("get-steps");
  document.getElementById("output").innerText = "Steps today: " + result.steps;
});
