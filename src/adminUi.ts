/**
 * HTML del panel de administración (servido por src/adminServer.ts). Página
 * autocontenida, sin dependencias ni paso de build: JS plano que llama a
 * /admin/api/*. Nada de esto se sirve nunca a través de Caddy/internet — solo
 * es alcanzable por túnel SSH (ver docs/panel-administracion.md).
 */

export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel de administración — iagestión MCP</title>
<script>
  // Aplica el tema guardado ANTES de pintar la página, para no dar un parpadeo del tema equivocado.
  (function () {
    try {
      var t = localStorage.getItem("mcp-admin-theme");
      if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    } catch (e) { /* almacenamiento no disponible (privado/bloqueado): se queda en el tema del sistema */ }
  })();
</script>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9;
    --surface: #ffffff;
    --border: #e5e7eb;
    --text: #111827;
    --text-muted: #6b7280;
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --accent-soft: #eef2ff;
    --danger: #dc2626;
    --danger-soft: #fef2f2;
    --warn: #b45309;
    --warn-soft: #fffbeb;
    --ok: #15803d;
    --ok-soft: #f0fdf4;
    --neutral-soft: #f3f4f6;
    --radius: 12px;
    --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 8px rgba(15, 23, 42, 0.03);
  }
  /* Oscuro por preferencia del sistema, salvo que se haya elegido "light" a mano (botón, abajo). */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0f1115;
      --surface: #171a21;
      --border: #2a2e37;
      --text: #e5e7eb;
      --text-muted: #9199a8;
      --accent: #818cf8;
      --accent-hover: #a5b0fb;
      --accent-soft: #1e2333;
      --danger: #f87171;
      --danger-soft: #2a1618;
      --warn: #fbbf59;
      --warn-soft: #2a2013;
      --ok: #4ade80;
      --ok-soft: #142218;
      --neutral-soft: #1f232c;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }
  }
  /* Oscuro elegido a mano, sea cual sea la preferencia del sistema. */
  :root[data-theme="dark"] {
    --bg: #0f1115;
    --surface: #171a21;
    --border: #2a2e37;
    --text: #e5e7eb;
    --text-muted: #9199a8;
    --accent: #818cf8;
    --accent-hover: #a5b0fb;
    --accent-soft: #1e2333;
    --danger: #f87171;
    --danger-soft: #2a1618;
    --warn: #fbbf59;
    --warn-soft: #2a2013;
    --ok: #4ade80;
    --ok-soft: #142218;
    --neutral-soft: #1f232c;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    margin: 0; padding: 32px 20px 80px; background: var(--bg); color: var(--text);
  }
  .wrap { max-width: 1080px; margin-inline: auto; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
  .topbar-left { display: flex; align-items: center; gap: 12px; }
  .mark {
    width: 36px; height: 36px; border-radius: 9px; background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;
    letter-spacing: -0.02em; flex-shrink: 0;
  }
  h1 { font-size: 1.15rem; margin: 0; font-weight: 600; }
  .sub { color: var(--text-muted); font-size: 0.85rem; margin: 2px 0 0; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 22px 24px; margin-bottom: 20px;
  }
  .card h2 { font-size: 0.95rem; margin: 0 0 16px; font-weight: 600; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
  th, td { text-align: left; padding: 10px 8px; vertical-align: middle; }
  thead th {
    color: var(--text-muted); font-weight: 600; font-size: 0.72rem; text-transform: uppercase;
    letter-spacing: 0.04em; border-bottom: 1px solid var(--border); padding-bottom: 10px; white-space: nowrap;
  }
  tbody tr { border-bottom: 1px solid var(--border); }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: var(--neutral-soft); }
  .empty { color: var(--text-muted); font-size: 0.85rem; padding: 18px 8px; text-align: center; }
  .badge {
    display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px;
    font-size: 0.75rem; font-weight: 600; white-space: nowrap;
  }
  .badge-ok { background: var(--ok-soft); color: var(--ok); }
  .badge-warn { background: var(--warn-soft); color: var(--warn); }
  .badge-bad { background: var(--danger-soft); color: var(--danger); }
  .badge-neutral { background: var(--neutral-soft); color: var(--text-muted); }
  button {
    cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text);
    border-radius: 7px; padding: 6px 12px; font-size: 0.82rem; font-weight: 500;
    transition: background-color 0.12s, border-color 0.12s;
  }
  button:hover { background: var(--neutral-soft); }
  button:disabled { opacity: 0.55; cursor: default; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
  button.danger { border-color: var(--danger-soft); color: var(--danger); background: var(--danger-soft); }
  button.danger:hover { background: var(--danger); border-color: var(--danger); color: #fff; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; min-width: 320px; }
  form.inline { display: flex; gap: 14px; flex-wrap: wrap; align-items: end; }
  form.inline label { display: flex; flex-direction: column; font-size: 0.78rem; color: var(--text-muted); gap: 5px; font-weight: 500; }
  input, select {
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; font-size: 0.87rem;
    background: var(--surface); color: var(--text); min-width: 160px;
  }
  input:focus, select:focus, button:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px;
  }
  .reveal {
    background: var(--accent-soft); border: 1px solid var(--accent); border-radius: var(--radius);
    padding: 16px 20px; margin-bottom: 20px; display: none;
  }
  .reveal .reveal-label { font-size: 0.78rem; color: var(--text-muted); margin: 10px 0 4px; font-weight: 500; }
  .reveal code {
    display: block; background: #14161b; color: #d4d4d4; padding: 10px 12px; border-radius: 7px;
    word-break: break-all; font-size: 0.8rem; line-height: 1.5;
  }
  .msg { font-size: 0.83rem; margin-top: 10px; }
  .msg.error { color: var(--danger); }
  .audit-toolbar { display: flex; gap: 10px; margin-bottom: 14px; align-items: center; flex-wrap: wrap; }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(10, 12, 18, 0.5);
    display: none; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
  }
  .modal-box {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 22px 24px; width: 100%; max-width: 400px;
  }
  .modal-box h3 { margin: 0 0 6px; font-size: 1rem; font-weight: 600; }
  #modalMessage { white-space: pre-line; margin: 0 0 4px; }
  #modalInputWrap { display: flex; gap: 6px; margin-top: 10px; }
  #modalInputWrap input { flex: 1; min-width: 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="topbar-left">
      <div class="mark">MCP</div>
      <div>
        <h1>Panel de administración — iagestión MCP</h1>
        <p class="sub">Solo accesible por túnel SSH. No compartas lo que veas aquí.</p>
      </div>
    </div>
    <button id="themeToggle" type="button">Modo oscuro</button>
  </div>

  <div id="reveal" class="reveal">
    <strong id="revealTitle"></strong>
    <div id="revealTokenWrap">
      <div class="reveal-label">Token de acceso (se muestra UNA sola vez, no se puede recuperar):</div>
      <code id="revealToken"></code>
      <div class="reveal-label">URL para el conector:</div>
      <code id="revealUrl"></code>
    </div>
    <div id="revealCodeWrap" style="display:none;">
      <div class="reveal-label">Código de confirmación (se muestra UNA sola vez, no se puede recuperar):</div>
      <code id="revealCode"></code>
    </div>
    <button id="revealClose" style="margin-top: 10px;">Cerrar</button>
  </div>

  <div class="card">
    <h2>Nuevo usuario</h2>
    <form id="createForm" class="inline">
      <label>Nombre <input id="cNombre" required></label>
      <label>Token M2M de iagestión <input id="cToken" type="password" required></label>
      <label>Código de confirmación (opcional)
        <span style="display:flex; gap:6px;">
          <input id="cConfirmCode" type="text" placeholder="p. ej. 4821" style="flex:1;">
          <button type="button" id="cGenerateCode">Generar</button>
        </span>
      </label>
      <label>Días de validez (opcional) <input id="cDias" type="number" min="1" placeholder="180"></label>
      <button type="submit" class="primary">Crear</button>
    </form>
    <p class="sub" style="margin: 8px 0 0;">El código de confirmación es lo que este usuario debe indicar cuando encadene varias acciones destructivas seguidas. Sin uno propio, usa el código compartido del servidor.</p>
    <div id="createMsg" class="msg"></div>
  </div>

  <div class="card">
    <h2>Usuarios</h2>
    <div class="table-wrap">
      <table id="usersTable">
        <thead><tr><th>Nombre</th><th>Alta</th><th>Expira</th><th>Último uso</th><th>Confirmación</th><th>Acciones</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>Actividad reciente</h2>
    <div class="audit-toolbar">
      <select id="auditFilter"><option value="">Todos los usuarios</option></select>
      <select id="auditRange">
        <option value="1h">Última hora</option>
        <option value="24h">Últimas 24 horas</option>
        <option value="7d">Últimos 7 días</option>
        <option value="all">Todo</option>
      </select>
      <button id="auditRefresh">Actualizar</button>
    </div>
    <div class="table-wrap">
      <table id="auditTable">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Tool</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>

<div id="modalOverlay" class="modal-overlay">
  <div class="modal-box">
    <h3 id="modalTitle"></h3>
    <p id="modalMessage"></p>
    <div id="modalInputWrap">
      <input id="modalInput">
      <button type="button" id="modalExtra" style="display:none;"></button>
    </div>
    <div class="modal-actions">
      <button type="button" id="modalCancel">Cancelar</button>
      <button type="button" id="modalConfirm" class="primary">Aceptar</button>
    </div>
  </div>
</div>

<script>
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------------
  // Modal genérico (sustituye a prompt/confirm/alert nativos). Devuelve una
  // promesa: el valor del input (o true) al aceptar, null (o false) al
  // cancelar. opts.extra permite un botón adicional dentro del diálogo (lo
  // usa "Código de confirmación" para su botón "Generar").
  // ---------------------------------------------------------------------
  function openModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      el("modalTitle").textContent = opts.title || "";

      var msgEl = el("modalMessage");
      if (opts.message) {
        msgEl.textContent = opts.message;
        msgEl.style.display = "block";
      } else {
        msgEl.style.display = "none";
      }

      var inputWrap = el("modalInputWrap");
      var input = el("modalInput");
      if (opts.withInput) {
        inputWrap.style.display = "flex";
        input.type = opts.inputType || "text";
        input.value = opts.inputValue || "";
        input.placeholder = opts.inputPlaceholder || "";
      } else {
        inputWrap.style.display = "none";
      }

      var extraBtn = el("modalExtra");
      var onExtra = null;
      if (opts.extra) {
        extraBtn.style.display = "inline-block";
        extraBtn.textContent = opts.extra.label;
        onExtra = function () { opts.extra.onClick(input); };
        extraBtn.addEventListener("click", onExtra);
      } else {
        extraBtn.style.display = "none";
      }

      el("modalConfirm").textContent = opts.confirmText || "Aceptar";
      el("modalConfirm").className = opts.danger ? "danger" : "primary";
      el("modalCancel").style.display = opts.hideCancel ? "none" : "inline-block";
      el("modalCancel").textContent = opts.cancelText || "Cancelar";

      function cleanup(result) {
        el("modalOverlay").style.display = "none";
        el("modalConfirm").removeEventListener("click", onConfirm);
        el("modalCancel").removeEventListener("click", onCancel);
        el("modalOverlay").removeEventListener("mousedown", onOverlayClick);
        document.removeEventListener("keydown", onKeydown);
        if (onExtra) extraBtn.removeEventListener("click", onExtra);
        resolve(result);
      }
      function onConfirm() { cleanup(opts.withInput ? input.value : true); }
      function onCancel() { cleanup(opts.withInput ? null : false); }
      function onOverlayClick(e) { if (e.target === el("modalOverlay")) onCancel(); }
      function onKeydown(e) {
        if (e.key === "Escape") onCancel();
        else if (e.key === "Enter" && opts.withInput && document.activeElement === input) onConfirm();
      }

      el("modalConfirm").addEventListener("click", onConfirm);
      el("modalCancel").addEventListener("click", onCancel);
      el("modalOverlay").addEventListener("mousedown", onOverlayClick);
      document.addEventListener("keydown", onKeydown);

      el("modalOverlay").style.display = "flex";
      if (opts.withInput) { input.focus(); if (input.select) input.select(); }
      else if (!opts.hideCancel) el("modalConfirm").focus();
    });
  }

  function showAlert(title, message) {
    return openModal({ title: title, message: message, hideCancel: true, confirmText: "Vale" });
  }
  function showConfirm(title, message, danger) {
    return openModal({ title: title, message: message, confirmText: danger ? "Sí, continuar" : "Confirmar", danger: !!danger });
  }
  function showPrompt(title, message, options) {
    var merged = { title: title, message: message, withInput: true, confirmText: "Guardar" };
    for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) merged[k] = options[k];
    return openModal(merged);
  }

  // ---------------------------------------------------------------------

  function isDarkNow() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return Boolean(window.matchMedia) && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function updateThemeButton() {
    el("themeToggle").textContent = isDarkNow() ? "Modo claro" : "Modo oscuro";
  }

  function setTheme(theme) {
    // theme: "light" | "dark" | null (vuelve a seguir la preferencia del sistema)
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    try {
      if (theme) localStorage.setItem("mcp-admin-theme", theme);
      else localStorage.removeItem("mcp-admin-theme");
    } catch (e) { /* sin almacenamiento persistente: el tema elegido dura solo esta carga */ }
    updateThemeButton();
  }

  el("themeToggle").addEventListener("click", function () {
    setTheme(isDarkNow() ? "light" : "dark");
  });
  updateThemeButton();

  function fmtDate(iso) {
    if (!iso) return "-";
    return iso.slice(0, 10);
  }

  function expiraBadge(u) {
    if (!u.expiresAt) return { text: "nunca", cls: "badge-neutral" };
    var fecha = u.expiresAt.slice(0, 10);
    if (u.expirado) return { text: fecha + " · caducado", cls: "badge-bad" };
    if (u.diasRestantes !== null && u.diasRestantes <= 14) return { text: fecha + " · " + u.diasRestantes + " días", cls: "badge-warn" };
    return { text: fecha, cls: "badge-ok" };
  }

  function showReveal(title, accessToken, url, confirmCode) {
    el("revealTitle").textContent = title;
    if (accessToken) {
      el("revealToken").textContent = accessToken;
      el("revealUrl").textContent = url;
      el("revealTokenWrap").style.display = "block";
    } else {
      el("revealTokenWrap").style.display = "none";
    }
    if (confirmCode) {
      el("revealCode").textContent = confirmCode;
      el("revealCodeWrap").style.display = "block";
    } else {
      el("revealCodeWrap").style.display = "none";
    }
    el("reveal").style.display = "block";
    el("reveal").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  el("revealClose").addEventListener("click", function () {
    el("reveal").style.display = "none";
    el("revealToken").textContent = "";
    el("revealCode").textContent = "";
  });

  function apiPost(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
        return data;
      });
    });
  }

  function apiDelete(path) {
    return fetch(path, { method: "DELETE" }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (data) { throw new Error(data.error || ("HTTP " + r.status)); });
    });
  }

  function loadUsers() {
    fetch("/admin/api/users").then(function (r) { return r.json(); }).then(function (users) {
      var tbody = el("usersTable").querySelector("tbody");
      tbody.innerHTML = "";

      var select = el("auditFilter");
      var currentFilter = select.value;
      select.innerHTML = '<option value="">Todos los usuarios</option>';

      if (users.length === 0) {
        var trEmpty = document.createElement("tr");
        var tdEmpty = document.createElement("td");
        tdEmpty.colSpan = 6;
        tdEmpty.className = "empty";
        tdEmpty.textContent = "No hay usuarios dados de alta todavía.";
        trEmpty.appendChild(tdEmpty);
        tbody.appendChild(trEmpty);
      }

      users.forEach(function (u) {
        var tr = document.createElement("tr");

        var tdNombre = document.createElement("td");
        tdNombre.textContent = u.nombre;
        tr.appendChild(tdNombre);

        var tdAlta = document.createElement("td");
        tdAlta.textContent = fmtDate(u.createdAt);
        tr.appendChild(tdAlta);

        var tdExpira = document.createElement("td");
        var badge = expiraBadge(u);
        var span = document.createElement("span");
        span.className = "badge " + badge.cls;
        span.textContent = badge.text;
        tdExpira.appendChild(span);
        tr.appendChild(tdExpira);

        var tdUltimo = document.createElement("td");
        tdUltimo.textContent = u.lastUsedAt ? fmtDate(u.lastUsedAt) : "nunca";
        tr.appendChild(tdUltimo);

        var tdConfirm = document.createElement("td");
        var confirmBadge = document.createElement("span");
        if (u.confirmacionPropia) {
          confirmBadge.className = "badge badge-ok";
          confirmBadge.textContent = "código propio";
        } else {
          confirmBadge.className = "badge badge-neutral";
          confirmBadge.textContent = "compartida";
        }
        tdConfirm.appendChild(confirmBadge);
        tr.appendChild(tdConfirm);

        var tdAcciones = document.createElement("td");
        tdAcciones.className = "actions";

        var bRotate = document.createElement("button");
        bRotate.textContent = "Rotar";
        bRotate.addEventListener("click", function () {
          showPrompt(
            "Rotar token de acceso",
            "Días de validez del nuevo token para " + u.nombre + " (vacío = por defecto).",
            { inputType: "number", inputPlaceholder: "180" }
          ).then(function (dias) {
            if (dias === null) return;
            var body = {};
            if (dias) body.dias = Number(dias);
            return apiPost("/admin/api/users/" + u.id + "/rotate", body).then(function (data) {
              showReveal("Usuario: " + u.nombre + " (token regenerado)", data.accessToken, data.url);
              loadUsers();
            });
          }).catch(function (e) { showAlert("Error", e.message); });
        });
        tdAcciones.appendChild(bRotate);

        var bToken = document.createElement("button");
        bToken.textContent = "Cambiar token iagestión";
        bToken.addEventListener("click", function () {
          showPrompt(
            "Cambiar token de iagestión",
            "Nuevo token M2M de iagestión para " + u.nombre + ".",
            { inputType: "password" }
          ).then(function (tok) {
            if (!tok) return;
            return apiPost("/admin/api/users/" + u.id + "/set-token", { apiToken: tok }).then(function () {
              return showAlert("Listo", "Token de iagestión actualizado para " + u.nombre + ".");
            });
          }).catch(function (e) { showAlert("Error", e.message); });
        });
        tdAcciones.appendChild(bToken);

        var bConfirmCode = document.createElement("button");
        bConfirmCode.textContent = "Código de confirmación";
        bConfirmCode.addEventListener("click", function () {
          showPrompt(
            "Código de confirmación",
            "Para " + u.nombre + ". Escríbelo, pulsa \\"Generar\\" para uno al azar, o déjalo vacío para volver al compartido.",
            {
              inputPlaceholder: "vacío = compartido",
              extra: {
                label: "Generar",
                onClick: function (input) {
                  fetch("/admin/api/generate-confirm-code").then(function (r) { return r.json(); }).then(function (data) {
                    input.value = data.code;
                    input.focus();
                  });
                },
              },
            }
          ).then(function (code) {
            if (code === null) return;
            var trimmed = code.trim();
            return apiPost("/admin/api/users/" + u.id + "/set-confirm-code", { confirmCode: trimmed }).then(function () {
              loadUsers();
              if (trimmed) showReveal("Usuario: " + u.nombre + " (código de confirmación actualizado)", null, null, trimmed);
            });
          }).catch(function (e) { showAlert("Error", e.message); });
        });
        tdAcciones.appendChild(bConfirmCode);

        var bRevoke = document.createElement("button");
        bRevoke.textContent = "Revocar";
        bRevoke.className = "danger";
        bRevoke.addEventListener("click", function () {
          showConfirm("Revocar usuario", "¿Revocar a " + u.nombre + "? Dejará de poder conectar de inmediato.", true).then(function (ok) {
            if (!ok) return;
            return apiDelete("/admin/api/users/" + u.id).then(function () { loadUsers(); });
          }).catch(function (e) { showAlert("Error", e.message); });
        });
        tdAcciones.appendChild(bRevoke);

        tr.appendChild(tdAcciones);
        tbody.appendChild(tr);

        var opt = document.createElement("option");
        opt.value = u.id;
        opt.textContent = u.nombre;
        select.appendChild(opt);
      });

      select.value = currentFilter;
    });
  }

  function loadAudit() {
    var userId = el("auditFilter").value;
    var range = el("auditRange").value;
    var url = "/admin/api/audit?limit=200&range=" + encodeURIComponent(range) + (userId ? "&userId=" + encodeURIComponent(userId) : "");
    fetch(url).then(function (r) { return r.json(); }).then(function (entries) {
      var tbody = el("auditTable").querySelector("tbody");
      tbody.innerHTML = "";

      if (entries.length === 0) {
        var trEmpty = document.createElement("tr");
        var tdEmpty = document.createElement("td");
        tdEmpty.colSpan = 3;
        tdEmpty.className = "empty";
        tdEmpty.textContent = "Sin actividad en este periodo.";
        trEmpty.appendChild(tdEmpty);
        tbody.appendChild(trEmpty);
        return;
      }

      entries.forEach(function (e) {
        var tr = document.createElement("tr");
        var tdTs = document.createElement("td");
        tdTs.textContent = e.ts.replace("T", " ").slice(0, 19);
        tr.appendChild(tdTs);
        var tdUser = document.createElement("td");
        tdUser.textContent = e.nombre;
        tr.appendChild(tdUser);
        var tdTool = document.createElement("td");
        tdTool.textContent = e.tool;
        tr.appendChild(tdTool);
        tbody.appendChild(tr);
      });
    });
  }

  el("cGenerateCode").addEventListener("click", function () {
    fetch("/admin/api/generate-confirm-code").then(function (r) { return r.json(); }).then(function (data) {
      el("cConfirmCode").value = data.code;
    });
  });

  el("createForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nombre = el("cNombre").value.trim();
    var token = el("cToken").value.trim();
    var confirmCode = el("cConfirmCode").value.trim();
    var dias = el("cDias").value ? Number(el("cDias").value) : undefined;
    var submitBtn = el("createForm").querySelector("button[type=submit]");
    el("createMsg").textContent = "";
    el("createMsg").className = "msg";
    submitBtn.disabled = true;
    apiPost("/admin/api/users", { nombre: nombre, apiToken: token, confirmCode: confirmCode, dias: dias }).then(function (data) {
      el("createForm").reset();
      showReveal("Usuario: " + data.nombre + " (nuevo)", data.accessToken, data.url, confirmCode);
      loadUsers();
    }).catch(function (e) {
      el("createMsg").textContent = e.message;
      el("createMsg").className = "msg error";
    }).finally(function () {
      submitBtn.disabled = false;
    });
  });

  el("auditFilter").addEventListener("change", loadAudit);
  el("auditRange").addEventListener("change", loadAudit);
  el("auditRefresh").addEventListener("click", loadAudit);

  loadUsers();
  loadAudit();
  setInterval(loadAudit, 20000);
})();
</script>
</body>
</html>`;
}
