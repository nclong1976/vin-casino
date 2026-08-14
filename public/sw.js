// Minimal service worker — required by Chrome/Android's install criteria so
// "Add to Home Screen" actually launches in fullscreen/standalone mode
// instead of falling back to a plain browser bookmark shortcut. Does not
// cache anything; every request just passes straight through to the network.
self.addEventListener("fetch", () => {});
