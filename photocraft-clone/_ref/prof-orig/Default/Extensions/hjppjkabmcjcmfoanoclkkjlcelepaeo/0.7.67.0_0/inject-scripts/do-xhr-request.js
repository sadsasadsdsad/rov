/* it's for instagramm only yet! */
(() => {
  const container = document.currentScript;
  try {
    const {
      url,
      method,
      headers,
      body,
    } = JSON.parse(container.getAttribute("data-params"));
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    Object.keys(headers).forEach(headerName => xhr.setRequestHeader(headerName, headers[headerName]));

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 206) {
        container.setAttribute("data-response", JSON.stringify(xhr.response));
        container.setAttribute("data-status", "fulfilled");
      } else {
        container.setAttribute("data-response", "no content");
        container.setAttribute("data-status", "rejected");
      }
    };
    xhr.onerror = (e) => {
      container.setAttribute("data-response", JSON.stringify(e));
      container.setAttribute("data-status", "rejected");
    };
    xhr.ontimeout = () => {
      container.setAttribute("data-response", "timeout");
      container.setAttribute("data-status", "rejected");
    };

    if (body) {
      xhr.send(body);
    } else {
      xhr.send();
    }
  } catch (e) {
    console.log("ERROR!!!", e);
    container.setAttribute("data-response", JSON.stringify(e));
    container.setAttribute("data-status", "rejected");
  }
})();
