(() => {
  const container = document.currentScript;
  const getGlobals = () => {
    const isObject = (item) => {
      if (typeof item === "undefined") return false;
      if (item === null) return false;
      if (typeof item === "object") return true;
      return false;
    };

    const resolveName = (name) => {
      const tokens = name.split(".");
      /* eslint-disable-next-line no-confusing-arrow */
      const res = tokens.reduce(((result, token) => isObject(result) ? result[token] : undefined), window);
      return res;
    };

    try {
      const { names, wait } = JSON.parse(container.getAttribute("data-params"));
      const result = names.map(resolveName);
      if (wait && result.some(value => value === undefined)) {
        setTimeout(getGlobals, 500);
        return;
      }
      // console.log(names, " => ", result);
      container.setAttribute("data-response", JSON.stringify(result));
      container.setAttribute("data-status", "fulfilled");
    } catch (e) {
      console.log("ERROR!!!", e);
      container.setAttribute("data-response", JSON.stringify(e));
      container.setAttribute("data-status", "rejected");
    }
  };
  getGlobals();
})();
