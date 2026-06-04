(function () {
  const PUBLIC_PAGES = new Set(["/", "/index.html", "/register.html"]);
  const ROLE_HOME = {
    admin: "/admin.html",
    dispatcher: "/dispatcher.html",
    driver: "/driver.html",
    broker: "/broker.html"
  };
  const PAGE_ROLES = {
    "/admin.html": ["admin"],
    "/admin-users.html": ["admin"],
    "/admin-loads.html": ["admin"],
    "/settings-center.html": ["admin"],
    "/onboarding.html": ["admin"],
    "/command-center.html": ["admin", "dispatcher"],
    "/dispatcher.html": ["admin", "dispatcher"],
    "/driver.html": ["admin", "driver"],
    "/broker.html": ["admin", "broker"],
    "/gps.html": ["admin", "dispatcher", "broker"],
    "/live-map.html": ["admin", "dispatcher", "broker"],
    "/load-details.html": ["admin", "dispatcher", "driver", "broker"],
    "/chat.html": ["admin", "dispatcher", "driver", "broker"],
    "/notifications.html": ["admin", "dispatcher", "driver", "broker"]
  };

  function normalizePath(pathname) {
    if (!pathname || pathname === "/") return "/";
    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  }

  function parseJwt(token) {
    try {
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
      try {
        return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      } catch {
        return null;
      }
    }
  }

  function getToken() {
    return localStorage.getItem("token") || "";
  }

  function currentUser() {
    const t = getToken();
    if (!t) return null;
    const u = parseJwt(t);
    if (!u || !u.role) { localStorage.removeItem("token"); localStorage.removeItem("user"); return null; }
    if (u.exp && Date.now() >= u.exp * 1000) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      return null;
    }
    return u;
  }

  function roleHome(role) {
    return ROLE_HOME[role] || "/home.html";
  }

  function isProtectedPath(pathname) {
    const p = normalizePath(pathname);
    return !PUBLIC_PAGES.has(p) && (p.endsWith(".html") || p === "/");
  }

  function allowedForPath(pathname, role) {
    const p = normalizePath(pathname);
    const allowed = PAGE_ROLES[p];
    if (!allowed) return true;
    return allowed.includes(role);
  }

  function requireAuthForCurrentPage() {
    const path = normalizePath(location.pathname);
    if (PUBLIC_PAGES.has(path)) return;
    if (!path.endsWith(".html")) return;

    const user = currentUser();
    if (!user) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace(`/index.html?next=${next}`);
      return;
    }

    if (!allowedForPath(path, user.role)) {
      location.replace(roleHome(user.role));
    }
  }

  function protectNavigationClicks() {
    document.addEventListener("click", function (event) {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url;
      try { url = new URL(href, location.origin); } catch { return; }
      if (url.origin !== location.origin) return;

      const path = normalizePath(url.pathname);
      if (!isProtectedPath(path)) return;

      const user = currentUser();
      if (!user) {
        event.preventDefault();
        const next = encodeURIComponent(url.pathname + url.search);
        location.href = `/index.html?next=${next}`;
        return;
      }

      if (!allowedForPath(path, user.role)) {
        event.preventDefault();
        location.href = roleHome(user.role);
      }
    }, true);
  }

  function applyRoleUI() {
    const user = currentUser();
    document.documentElement.dataset.role = user ? user.role : "guest";
    document.body && (document.body.dataset.role = user ? user.role : "guest");

    document.querySelectorAll("[data-roles]").forEach(el => {
      if (!user) { el.remove(); return; }
      const roles = el.dataset.roles.split(",").map(x => x.trim());
      if (!roles.includes(user.role)) el.remove();
    });

    document.querySelectorAll("[data-role-home]").forEach(el => {
      el.setAttribute("href", user ? roleHome(user.role) : "/index.html");
    });

    document.querySelectorAll("a[href]").forEach(link => {
      let url;
      try { url = new URL(link.getAttribute("href"), location.origin); } catch { return; }
      if (url.origin !== location.origin) return;
      const path = normalizePath(url.pathname);
      if (!isProtectedPath(path)) return;
      if (!user) link.setAttribute("data-auth-required", "true");
      else if (!allowedForPath(path, user.role)) link.remove();
    });
  }

  requireAuthForCurrentPage();
  protectNavigationClicks();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRoleUI, { once: true });
  } else {
    applyRoleUI();
  }

  window.JTSAuth = {
    currentUser,
    roleHome,
    isProtectedPath,
    allowedForPath
  };
})();
