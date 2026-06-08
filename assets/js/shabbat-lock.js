(() => {
  // ====== הגדרות שאתה יכול לשנות ======
  // אם תרצה להפנות לדף שבת שלום במקום מסך כיסוי – הדבק כאן URL מלא של הדף שיצרת.
  // דוגמה: "https://parasha-week.co.il/p/shabbat-shalom.html"
  // אם נשאר null => יופיע מסך כיסוי באתר.
  const REDIRECT_URL = null;

  // בדיקה קבועה לפי ירושלים
  const FALLBACK_GEONAMEID = "281184";

  // כל כמה זמן לבדוק שוב (למקרה שמישהו נשאר באתר בזמן כניסת שבת/יציאה)
  const RECHECK_MS = 5 * 60 * 1000;

  // נוסח ההודעה
  const TITLE = "שבת שלום 🌙";
  const MESSAGE = "האתר סגור כעת (שבת / יום טוב). נשמח לראותך שוב במוצאי שבת או לאחר החג.";

  // ====== עיצוב מסך הכיסוי ======
  function showOverlay() {
    if (document.getElementById("bn-shabbat-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "bn-shabbat-overlay";
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(255,255,255,0.97);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; direction: rtl; text-align: center;
      font-family: Arial, sans-serif;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      max-width: 560px; width: 100%;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 14px;
      padding: 22px 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.10);
      background: #fff;
    `;

    const h = document.createElement("div");
    h.style.cssText = "font-size: 22px; font-weight: 700; margin-bottom: 10px;";
    h.textContent = TITLE;

    const p = document.createElement("div");
    p.style.cssText = "font-size: 16px; line-height: 1.6; margin-bottom: 6px;";
    p.textContent = MESSAGE;

    const small = document.createElement("div");
    small.style.cssText = "font-size: 12px; opacity: 0.7; margin-top: 10px;";
    small.textContent = "הבדיקה מתבצעת אוטומטית לפי זמני שבת/חג.";

    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(small);
    overlay.appendChild(box);

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    const overlay = document.getElementById("bn-shabbat-overlay");
    if (overlay) overlay.remove();
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }

  // ====== קריאה ל-Hebcal ======
  async function callHebcal(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Hebcal HTTP " + res.status);
    return res.json();
  }

  function buildUrlFallbackGeoname(dt) {
    const u = new URL("https://www.hebcal.com/zmanim");
    u.searchParams.set("cfg", "json");
    u.searchParams.set("im", "1");
    u.searchParams.set("geonameid", FALLBACK_GEONAMEID);
    if (dt) u.searchParams.set("dt", dt);
    return u.toString();
  }

  function toLocalIso(d) {
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "-" +
      p(d.getMonth() + 1) + "-" +
      p(d.getDate()) + "T" +
      p(d.getHours()) + ":" +
      p(d.getMinutes()) + ":" +
      p(d.getSeconds())
    );
  }

  async function check() {
    const SHIFT_MIN = 20;
    const now = Date.now();
    const dtPlus = toLocalIso(new Date(now + SHIFT_MIN * 60 * 1000));
    const dtMinus = toLocalIso(new Date(now - SHIFT_MIN * 60 * 1000));

    const dataPlus = await callHebcal(buildUrlFallbackGeoname(dtPlus));
    const dataMinus = await callHebcal(buildUrlFallbackGeoname(dtMinus));

    const isAssur =
      !!(dataPlus?.status?.isAssurBemlacha) ||
      !!(dataMinus?.status?.isAssurBemlacha);

    if (isAssur) {
      if (REDIRECT_URL && location.href !== REDIRECT_URL) {
        location.replace(REDIRECT_URL);
        return;
      }
      showOverlay();
    } else {
      hideOverlay();
    }
  }

  check();
  setInterval(check, RECHECK_MS);
})();
