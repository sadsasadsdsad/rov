(() => {
  const patchXHR = () => {
    ((xhr) => {
      // console.log("we are in main page!!!");
      function mock(xhrInstance) {
        if (window.__stopWatching) return;
        if (!window.__jsons) {
          window.__jsons = [];
        }
        // console.log(xhrInstance.responseText);
        if (xhrInstance.responseType === "" || xhrInstance.responseType === "text") {
          const response = xhrInstance.responseText;

          if (response.length) {
            let resolved;
            for (let i = 0; i < 20; i++) {
              try {
                const s = response.substring(i);
                resolved = (s.startsWith("for (;;);")) ? JSON.parse(s.substring(9)) : JSON.parse(s);
                break;
              } catch (e) {
              }
            }
            if (resolved) {
              window.__jsons.push(resolved);
            }
          }
        }
        if (xhrInstance.responseType === "json" && xhrInstance.responseJSON) {
          window.__jsons.push(xhrInstance.responseJSON);
        }

        if (window.__jsons.length > 1000) {
          window.__jsons = window.__jsons.slice(1);
        }
        // console.log(e);
      }
      const { open } = xhr;
      /* eslint-disable-next-line no-param-reassign, func-names */
      xhr.open = function () {
        /* eslint-disable-next-line prefer-rest-params */
        const openArguments = arguments;
        const { setRequestHeader, send } = this;

        /* eslint-disable-next-line func-names */
        this.setRequestHeader = function (...args) {
          if (args[0].toLowerCase() === "x-ig-app-id") {
            /* eslint-disable-next-line prefer-destructuring */
            window["X-IG-App-ID"] = args[1]; // seems like we don't use it
          }
          setRequestHeader.apply(this, args);
        };

        /* eslint-disable-next-line func-names */
        this.send = function (data, ...args) {
          if (openArguments[0].toLowerCase() === "post" && openArguments[1].includes("/ajax/bulk-route-definitions/")) {
            const resolveParams = {};
            const bodyParams = new URLSearchParams(data);
            /* eslint-disable-next-line no-restricted-syntax */
            for (const key of bodyParams.keys()) {
              resolveParams[key] = bodyParams.get(key);
            }
            window.resolveParams = resolveParams;
          }
          const { onload } = this;
          // Apply monkey-patch
          /* eslint-disable-next-line func-names, consistent-return */
          this.onload = function (...xhrArgs) {
            mock(this);
            if (onload) {
              return onload.apply(this, xhrArgs);
            }
          };
          return send.apply(this, [data, ...args]);
        };
        /* eslint-disable-next-line prefer-rest-params */
        return open.apply(this, arguments);
      };
    })(XMLHttpRequest.prototype);
  };
  patchXHR();
}
)();
