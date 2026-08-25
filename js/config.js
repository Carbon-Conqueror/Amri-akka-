// This static site (GitHub Pages) and the donation API (a separate Node
// server - see server/ and README.md) are deployed on different origins.
// Point this at wherever the API is actually running before going live.
//
// Local development default: `npm run dev` runs the API on
// http://localhost:3000. If you're serving this static site from the same
// origin as the API (e.g. testing everything through one process), you can
// instead set this to '' so requests are same-origin/relative.
window.SAIJEEVANSEVA_API_BASE = 'http://localhost:3000';
