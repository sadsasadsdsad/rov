(() => {
  const patchFetch = (container) => {
    const x = window.fetch;
    if (!x.patched) {
      window.fetch = (...rest) => {
        const request = x.apply(this, rest);
        try {
          const { pattern } = JSON.parse(container.getAttribute("data-params"));
          const re = new RegExp(pattern);
          if (re.test(rest[0].url)) {
            window.lastResponse = {
              request,
            };
            // eslint-disable-next-line func-names
            const waitForResponse = async function () {
              const response = await window.lastResponse.request;
              window.lastResponse.body = response.clone();
            };
            waitForResponse();
          }
        } catch (e) {
          // TODO https://www.goodday.work/t/Fpw0tY
        }
        return request;
      };
      window.fetch.patched = true;
    }
  };

  const container = document.currentScript;
  try {
    patchFetch(container);
    container.setAttribute("data-response", JSON.stringify("ok"));
    container.setAttribute("data-status", "fulfilled");
  } catch (e) {
    container.setAttribute("data-response", JSON.stringify(e));
    container.setAttribute("data-status", "rejected");
  }
})();
