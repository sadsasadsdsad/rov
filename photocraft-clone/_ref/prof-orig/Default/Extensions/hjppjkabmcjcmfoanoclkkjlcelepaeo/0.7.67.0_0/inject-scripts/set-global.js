(() => {
  const isObject = (item) => {
    if (typeof item === "undefined") return false;
    if (item === null) return false;
    if (typeof item === "object") return true;
    return false;
  };

  const container = document.currentScript;

  try {
    const { name, value } = JSON.parse(container.getAttribute("data-params"));
    const tokens = name.split(".");
    const pointer = tokens.pop();
    /* eslint-disable-next-line no-confusing-arrow */
    const holder = tokens.reduce(((result, token) => isObject(result) ? result[token] : undefined), window);
    if (holder) {
      holder[pointer] = value;
      container.setAttribute("data-response", JSON.stringify(true));
      container.setAttribute("data-status", "fulfilled");
    } else {
      container.setAttribute("data-response", new Error(`${name} not found`));
      container.setAttribute("data-status", "rejected");
    }
  } catch (e) {
    container.setAttribute("data-response", JSON.stringify(e));
    container.setAttribute("data-status", "rejected");
  }
})();
