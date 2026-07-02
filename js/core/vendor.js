/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
// ==================== SHARED SCRIPTS ====================
var _sharedScriptsReady = new Promise(function (resolve) {
  (function loadSharedScripts(done) {
    // document.currentScript is null in modules — resolve /js/ from this file's URL (/js/core/).
    var base = new URL('../', import.meta.url).href;
    var scripts = [
      base + 'popover-loader.js',
      'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2',
      'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.js',
      'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/MTLLoader.js'
    ];
    function loadNext(i) {
      if (i >= scripts.length) { done(); return; }
      var s = document.createElement('script');
      s.src = scripts[i];
      s.onload = function () { loadNext(i + 1); };
      s.onerror = function () { loadNext(i + 1); };
      document.head.appendChild(s);
    }
    loadNext(0);
  })(resolve);
});

// Legacy global: Auth (and others) await this before using Fuse/Chart/Three.
window._sharedScriptsReady = _sharedScriptsReady;
export const sharedScriptsReady = _sharedScriptsReady;
