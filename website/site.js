// Copy buttons for commands. Everything else on the site works without JavaScript.
document.querySelectorAll("pre").forEach((pre) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Copy";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector("code").textContent);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1600);
    } catch {
      /* clipboard blocked: the text can still be selected */
    }
  });
  pre.appendChild(button);
});

// On a phone the documentation menu starts closed, so the page itself comes first.
if (window.matchMedia("(max-width: 860px)").matches) document.querySelectorAll(".side details").forEach((d) => d.removeAttribute("open"));
