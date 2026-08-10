(() => {
  const shellClasses = ["language-bash", "language-shell", "language-sh", "language-zsh"];
  const tokenPattern = /(\s+|#[^\n]*|"(?:\\.|[^"\\])*"|'[^']*'|&&|\|\||[|;]|\$\{?[-A-Za-z_][A-Za-z0-9_]*\}?|--?[A-Za-z0-9][A-Za-z0-9_-]*|[^\s|;]+)/g;

  function highlightShell(code) {
    if (code.dataset.piKitHighlighted === "true") return;
    const source = code.textContent ?? "";
    code.replaceChildren();
    let expectCommand = true;
    for (const token of source.match(tokenPattern) ?? []) {
      const span = document.createElement("span");
      span.textContent = token;
      if (/^\s+$/.test(token)) {
        if (token.includes("\n")) expectCommand = true;
      } else if (token.startsWith("#")) {
        span.className = "pi-kit-shell-comment";
      } else if (/^(?:&&|\|\||[|;])$/.test(token)) {
        span.className = "pi-kit-shell-operator";
        expectCommand = true;
      } else if (expectCommand) {
        span.className = "pi-kit-shell-command";
        expectCommand = false;
      } else if (token.startsWith("-")) {
        span.className = "pi-kit-shell-option";
      } else if (token.startsWith("$")) {
        span.className = "pi-kit-shell-variable";
      } else {
        span.className = "pi-kit-shell-argument";
      }
      code.append(span);
    }
    code.dataset.piKitHighlighted = "true";
  }

  function highlight() {
    for (const code of document.querySelectorAll("pre > code")) {
      if (shellClasses.some((name) => code.classList.contains(name))) highlightShell(code);
    }
  }

  highlight();
  new MutationObserver(highlight).observe(document.documentElement, { childList: true, subtree: true });
})();
