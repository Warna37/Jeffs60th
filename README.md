# The 60th Round - live scoring

Two 4-man teams, 18 holes, net stroke play (best 2 net per hole),
plus a 2-man blind draw scored on combined net.

## Deploy
1. New private GitHub repo (e.g. Round-60). Upload: index.html -> public/index.html,
   api.mjs -> netlify/functions/api.mjs, netlify.toml, package.json.
2. Netlify: Add new site > Import from Git > pick the repo. Build settings come from netlify.toml.
3. Site settings > Environment variables: SCORE_PIN (scorers) and ADMIN_PIN (setup + blind draw, required),
   Setup and the draw are locked to ADMIN_PIN only. ADMIN_PIN also works for scoring.
   Redeploy after adding.
4. Open the site > gear icon > enter names, teams, handicaps, course par + stroke index > Save.
