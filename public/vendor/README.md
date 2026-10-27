# Bundled QR libraries

These libraries are served from the same origin; camera images are decoded locally.

- QR Code generator by Project Nayuki, MIT license. Source: https://github.com/nayuki/QR-Code-generator/blob/master/typescript-javascript/qrcodegen.ts, Git blob c4191ac0b5f8a24d87fd9340ceaa2d3b07d0231a.
  Transformed with Node 24's stripTypeScriptTypes(source, {mode:'transform'}), preserving the source license header and adding an ES-module export.
- jsQR, Apache-2.0 license in jsQR-LICENSE. Source: https://github.com/cozmo/jsQR/blob/master/dist/jsQR.js, Git blob 99ea9df26907009e5553233ffe03c529c1521739.
  A local CommonJS wrapper and default export allow the unchanged distribution to run as an ES module.

The application imports QR encoding only when showing a code, and jsQR only when opening the camera.
