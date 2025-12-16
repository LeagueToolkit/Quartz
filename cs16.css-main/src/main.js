document.querySelectorAll(".toggle-vision").forEach((button) => {
  button.addEventListener("click", function () {
    const codeBlock = this.closest(".code-block").querySelector(".inner");
    codeBlock.classList.toggle("hidden");
    this.textContent = codeBlock.classList.contains("hidden")
      ? "Show code"
      : "Hide code";
  });
});

document.querySelectorAll(".inner .cs-btn").forEach((button) => {
  let timeout = null;

  button.addEventListener("click", function () {
    const codeElement = this.closest(".inner").querySelector("code");
    const codeToCopy = codeElement.textContent;
    navigator.clipboard
      .writeText(codeToCopy)
      .then(() => {
        this.textContent = "Copied!";

        if (timeout !== null) {
          clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
          this.textContent = "Copy";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy code: ", err);
      });
  });
});
