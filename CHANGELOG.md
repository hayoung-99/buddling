# Changelog

## [0.4.0](https://github.com/hayoung-99/tap-tap/compare/v0.3.0...v0.4.0) (2026-08-15)


### 새로운 것

* **renderer:** rebuild the windows on Vite, React and TypeScript ([#32](https://github.com/hayoung-99/tap-tap/issues/32)) ([72f8cee](https://github.com/hayoung-99/tap-tap/commit/72f8ceed879046a260113cf079f54cca6317fb81))
* **renderer:** style the windows with Tailwind ([#33](https://github.com/hayoung-99/tap-tap/issues/33)) ([3318932](https://github.com/hayoung-99/tap-tap/commit/33189324f44b6fd51b176b3210a3df9a376c5527))
* **site:** let the peeking characters face front and keep both eyes on screen ([#30](https://github.com/hayoung-99/tap-tap/issues/30)) ([0e68bc4](https://github.com/hayoung-99/tap-tap/commit/0e68bc4ca07ef31f78515e79f16298f815a52b4e))
* **tray:** open the team list on left click, the menu on right click ([#31](https://github.com/hayoung-99/tap-tap/issues/31)) ([1380a3d](https://github.com/hayoung-99/tap-tap/commit/1380a3daa74e5c7f6a542e3284eaa216c3822af3))


### 고친 것

* **capture:** let TAPTAP_CAPTURE exit once a character is on screen ([#34](https://github.com/hayoung-99/tap-tap/issues/34)) ([c572174](https://github.com/hayoung-99/tap-tap/commit/c572174af020b915fa4d4b71a293e64f6daf7af0))
* **main:** let the app actually quit while a character is on screen ([#27](https://github.com/hayoung-99/tap-tap/issues/27)) ([1d59c7e](https://github.com/hayoung-99/tap-tap/commit/1d59c7e701ecd1418c59a15a1a3192ccff7e832f))

## [0.3.0](https://github.com/hayoung-99/tap-tap/compare/v0.2.2...v0.3.0) (2026-08-14)


### 새로운 것

* **auth:** identify members by anonymous sign-in, lock the channel ([#25](https://github.com/hayoung-99/tap-tap/issues/25)) ([bbb8ef3](https://github.com/hayoung-99/tap-tap/commit/bbb8ef3ac5cd72d2e330452c33852260a7db4ba0))


### 고친 것

* **invite:** make invite codes unguessable ([#24](https://github.com/hayoung-99/tap-tap/issues/24)) ([8f27981](https://github.com/hayoung-99/tap-tap/commit/8f279814ecb99d18b5d0b071a85170872a4cc59e))

## [0.2.2](https://github.com/hayoung-99/tap-tap/compare/v0.2.1...v0.2.2) (2026-08-14)


### 고친 것

* **main:** stop the second instance instead of only scheduling a quit ([#22](https://github.com/hayoung-99/tap-tap/issues/22)) ([e4242cb](https://github.com/hayoung-99/tap-tap/commit/e4242cb7bdabd824f2b27876b86c6ef9175f8df5))

## [0.2.1](https://github.com/hayoung-99/tap-tap/compare/v0.2.0...v0.2.1) (2026-08-14)


### 고친 것

* **main:** don't open a window before the app is ready ([#17](https://github.com/hayoung-99/tap-tap/issues/17)) ([70b3445](https://github.com/hayoung-99/tap-tap/commit/70b344511c999c11ff069393a0dc30d482c01153))

## [0.2.0](https://github.com/hayoung-99/tap-tap/compare/v0.1.1...v0.2.0) (2026-08-14)


### 새로운 것

* **settings:** split the settings window into a list and a detail ([#13](https://github.com/hayoung-99/tap-tap/issues/13)) ([6a60134](https://github.com/hayoung-99/tap-tap/commit/6a601344461e9f3bad0bf6b6fb00d096dd1d6aee))
* **site:** rebuild the landing page as a window on a wallpaper ([#9](https://github.com/hayoung-99/tap-tap/issues/9)) ([730e91f](https://github.com/hayoung-99/tap-tap/commit/730e91f8973ddb10e9d182bcc50f0c7fd98ff3c0))


### 고친 것

* **build:** ad-hoc sign the macOS app so it can be opened at all ([#15](https://github.com/hayoung-99/tap-tap/issues/15)) ([2bd8dd9](https://github.com/hayoung-99/tap-tap/commit/2bd8dd99db684c44969387321f177f92fa2d7706))

## [0.1.1](https://github.com/hayoung-99/tap-tap/compare/v0.1.0...v0.1.1) (2026-08-14)


### 새로운 것

* add release pipeline, app icon and landing page ([919bdda](https://github.com/hayoung-99/tap-tap/commit/919bddad2a5fc6289a7813e29a4a25078dfa0e49))
* **power:** let people choose how idle the character goes ([4b946a3](https://github.com/hayoung-99/tap-tap/commit/4b946a337b0b709652a046a1219a3c5b3f90ddce))
* **site:** make the page legible to answer engines ([6fb2cee](https://github.com/hayoung-99/tap-tap/commit/6fb2cee8e68623f04aceede23d8d3af12d5c7d27))
* **updates:** auto-update on Windows via electron-updater ([30795a5](https://github.com/hayoung-99/tap-tap/commit/30795a59aa29f0286b7836f8631eebbea3fc985e))
* **updates:** look for a new version once, in the morning ([f7a0d3f](https://github.com/hayoung-99/tap-tap/commit/f7a0d3f0f91f0b465a5fd025fe524fade06c081a))


### 고친 것

* **ci:** keep releases in the 0.x range until 1.0 is earned ([b054649](https://github.com/hayoung-99/tap-tap/commit/b054649fb4513272e84d364a395d9d1f102e180d))
* **ci:** start the first release at 0.1.0 ([4a323db](https://github.com/hayoung-99/tap-tap/commit/4a323dbb35cd7ee7a7da68c55e3242a129cee8ca))
* **ci:** tag releases as v{version} so the builder finds them ([#11](https://github.com/hayoung-99/tap-tap/issues/11)) ([bb57861](https://github.com/hayoung-99/tap-tap/commit/bb57861a2d7e521e940a0bbef6b97d654b91dd50))
* **site:** point the canonical URL at the real address ([b8e407c](https://github.com/hayoung-99/tap-tap/commit/b8e407c86cc3c5114a0fdbf1e45a33bbeacb9430))
* **site:** use English screenshots on the English page ([ba36c81](https://github.com/hayoung-99/tap-tap/commit/ba36c811b26d0e10b59470c61a6fb33c30a8d044))
* **store:** never let a failed save take the app down ([e057a8a](https://github.com/hayoung-99/tap-tap/commit/e057a8adf51b7622dcf20c30f131a2d55c8eddfa))
* **test:** measure the cheek strokes instead of reading a parameter name ([5d7dc43](https://github.com/hayoung-99/tap-tap/commit/5d7dc4307a25c5018500b87649b09e7fcf2cb10b))
