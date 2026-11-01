const dict = {
  en: {
    dir: "ltr",
    nav: { home: "Home", projects: "Projects", bots: "Bots", team: "Team", news: "News", shop: "Shop", support: "Support", contact: "Contact", admin: "Admin", adminLogin: "Admin Login", more: "More" },
    hero: {
      title: "DARKKNIGHT STUDIO",
      slogan: "Independent digital studio building bots, products, and experiences.",
      explore: "Explore Projects",
      contact: "Contact Us",
    },
    sections: {
      about: "About the Studio",
      aboutText: "We design and ship production-grade bots, web products, and digital systems with a focus on reliability, security, and craft.",
      featuredProjects: "Featured Projects",
      featuredBots: "Featured Bots",
      latestNews: "Latest News",
      team: "Team",
      shop: "Shop",
      support: "Support",
      contact: "Contact",
      allProjects: "All Projects",
      allBots: "Bot Directory",
      viewAll: "View all",
      readMore: "Read more",
      purchase: "Purchase Request",
      submit: "Submit",
      sending: "Sending…",
      success: "Submitted successfully.",
      error: "Something went wrong. Please try again.",
      loading: "Loading…",
      empty: "Nothing to show yet.",
      notConfigured: "Connect Supabase in assets/js/config.js to load live data.",
      status: "Status",
      category: "Category",
      search: "Search…",
      name: "Name",
      email: "Email / Contact",
      subject: "Subject",
      message: "Message",
      ticketRef: "Ticket reference",
      checkTicket: "Check ticket",
      enablePush: "Enable notifications",
      pushHint: "Get notified about important studio news.",
      pushEnabled: "Notifications enabled",
      pushDenied: "Notifications blocked in browser settings",
    },
    footer: { rights: "All rights reserved.", studio: "DARKKNIGHT STUDIO" },
    settings: { close: "Close" },
    admin: {
      login: "Admin Login",
      email: "Email",
      password: "Password",
      signIn: "Sign in",
      dashboard: "Dashboard",
      logout: "Sign out",
      overview: "Overview",
      unauthorized: "You do not have admin access.",
    },
  },
  fa: {
    dir: "rtl",
    nav: { home: "خانه", projects: "پروژه‌ها", bots: "بات‌ها", team: "تیم", news: "اخبار", shop: "فروشگاه", support: "پشتیبانی", contact: "تماس", admin: "مدیریت", adminLogin: "ورود مدیران", more: "بیشتر" },
    hero: {
      title: "دارک‌نایت استودیو",
      slogan: "استودیوی مستقل دیجیتال برای ساخت بات، محصول و تجربه‌های واقعی.",
      explore: "مشاهده پروژه‌ها",
      contact: "تماس با ما",
    },
    sections: {
      about: "درباره استودیو",
      aboutText: "ما بات‌ها، محصولات وب و سیستم‌های دیجیتال را با تمرکز بر پایداری، امنیت و کیفیت می‌سازیم و منتشر می‌کنیم.",
      featuredProjects: "پروژه‌های ویژه",
      featuredBots: "بات‌های ویژه",
      latestNews: "آخرین اخبار",
      team: "تیم",
      shop: "فروشگاه",
      support: "پشتیبانی",
      contact: "تماس",
      allProjects: "همه پروژه‌ها",
      allBots: "فهرست بات‌ها",
      viewAll: "مشاهده همه",
      readMore: "ادامه مطلب",
      purchase: "درخواست خرید",
      submit: "ارسال",
      sending: "در حال ارسال…",
      success: "با موفقیت ثبت شد.",
      error: "خطایی رخ داد. دوباره تلاش کنید.",
      loading: "بارگذاری…",
      empty: "موردی برای نمایش نیست.",
      notConfigured: "برای داده زنده، Supabase را در assets/js/config.js تنظیم کنید.",
      status: "وضعیت",
      category: "دسته‌بندی",
      search: "جستجو…",
      name: "نام",
      email: "ایمیل / راه ارتباطی",
      subject: "موضوع",
      message: "پیام",
      ticketRef: "کد پیگیری تیکت",
      checkTicket: "پیگیری تیکت",
      enablePush: "فعال‌سازی اعلان‌ها",
      pushHint: "از اخبار مهم استودیو مطلع شوید.",
      pushEnabled: "اعلان‌ها فعال شد",
      pushDenied: "اعلان در تنظیمات مرورگر مسدود است",
    },
    footer: { rights: "تمامی حقوق محفوظ است.", studio: "دارک‌نایت استودیو" },
    settings: { close: "بستن" },
    admin: {
      login: "ورود مدیریت",
      email: "ایمیل",
      password: "رمز عبور",
      signIn: "ورود",
      dashboard: "داشبورد",
      logout: "خروج",
      overview: "نمای کلی",
      unauthorized: "دسترسی مدیریت ندارید.",
    },
  },
};

let lang = "fa";
try { lang = localStorage.getItem("dks-lang") || "fa"; } catch (_) {}

export function getLang() { return lang; }
export function t(path) {
  const parts = path.split(".");
  let v = dict[lang];
  for (const p of parts) v = v?.[p];
  return v != null ? v : path;
}
export function setLang(next) {
  if (!dict[next]) return;
  lang = next;
  try { localStorage.setItem("dks-lang", next); } catch (_) {}
  document.documentElement.lang = next === "fa" ? "fa" : "en";
  document.documentElement.dir = dict[next].dir;
  applyI18n();
}
export function applyI18n() {
  document.documentElement.lang = lang === "fa" ? "fa" : "en";
  document.documentElement.dir = dict[lang].dir;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      if (el.hasAttribute("data-i18n-placeholder")) el.placeholder = val;
      else el.value = val;
    } else el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
}
export function initI18n() {
  setLang(lang);
}
