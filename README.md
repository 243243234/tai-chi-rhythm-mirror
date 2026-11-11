# 太极律动 · 公开镜像 (Tai Chi Rhythm Mirror)

Public mirror of the 《太极律动》 web rhythm game, served via jsDelivr so it loads
without a VPN in mainland China (the main site on Netlify is unreachable from some
Chinese carriers).

- Source snapshot: `waste-homework` branch `ev/ink-duel-20261031` @ `1a576b16`
  (v10 + RAR3 art + Ma Shan Zheng font pass).
- Play it: https://cdn.jsdelivr.net/gh/243243234/tai-chi-rhythm-mirror@main/tai-chi-rhythm/index.html
- The game is a static site: `tai-chi-rhythm/index.html` + `src/` + `assets/`,
  loaded by relative paths.

Notes:
- There is no server on this mirror: the phone-to-PC auto-sync relay (Netlify
  Function) does not run here. Unlock Xihu with the manual sync code instead.
- This is a snapshot. After the ds v12 stage fusion lands, this mirror needs
  re-syncing. The repo can be deleted or made private at any time.
