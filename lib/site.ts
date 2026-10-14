// GitHub Pages serves the production site from a sub-path; `npm run dev` serves it from the root.
export const BASE_PATH = process.env.NODE_ENV === "production" ? "/place-libre" : "";
export const SITE_URL = "https://corbiiy.github.io/place-libre";
