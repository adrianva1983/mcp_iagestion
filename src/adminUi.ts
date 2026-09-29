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
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 24px; max-width: 960px; margin-inline: auto; }
  h1 { font-size: 1.3rem; margin-bottom: 4px; }
  .sub { color: #666; font-size: 0.9rem; margin-bottom: 24px; }
  section { margin-bottom: 32px; }
  h2 { font-size: 1.05rem; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { color: #666; font-weight: 600; }
  .warn { color: #b45309; }
  .bad { color: #b91c1c; font-weight: 600; }
  button { cursor: pointer; border: 1px solid #ccc; background: #fafafa; border-radius: 6px; padding: 4px 10px; font-size: 0.85rem; margin-right: 4px; }
  button:hover { background: #f0f0f0; }
  button.danger { border-color: #f3c2c2; color: #b91c1c; }
  form.inline { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; margin-bottom: 12px; }
  form.inline label { display: flex; flex-direction: column; font-size: 0.8rem; color: #555; gap: 2px; }
  input { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; }
  .reveal { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px; margin-bottom: 16px; display: none; }
  .reveal code { display: block; background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 6px; margin: 8px 0; word-break: break-all; font-size: 0.8rem; }
  .msg { font-size: 0.85rem; margin: 8px 0; }
  .msg.error { color: #b91c1c; }
  select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; }
</style>
</head>
<body>
  <h1>Panel de administración — iagestión MCP</h1>
  <div class="sub">Solo accesible por túnel SSH. No compartas lo que veas aquí.</div>

  <div id="reveal" class="reveal">
    <strong id="revealTitle"></strong>
    <div>Token de acceso (se muestra UNA sola vez, no se puede recuperar):</div>
    <code id="revealToken"></code>
    <div>URL para el conector:</div>
    <code id="revealUrl"></code>
    <button id="revealClose">Cerrar</button>
  </div>

  <section>
    <h2>Nuevo usuario</h2>
    <form id="createForm" class="inline">
      <label>Nombre <input id="cNombre" required></label>
      <label>Token M2M de iagestión <input id="cToken" type="password" required></label>
      <label>Días de validez (opcional) <input id="cDias" type="number" min="1" placeholder="180"></label>
      <button type="submit">Crear</button>
    </form>
    <div id="createMsg" class="msg"></div>
  </section>

  <section>
    <h2>Usuarios</h2>
    <table id="usersTable">
      <thead><tr><th>Nombre</th><th>Alta</th><th>Expira</th><th>Último uso</th><th>Acciones</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

  <section>
    <h2>Actividad reciente</h2>
    <div class="inline" style="margin-bottom:8px;">
      <select id="auditFilter"><option value="">Todos los usuarios</option></select>
      <button id="auditRefresh">Actualizar</button>
    </div>
    <table id="auditTable">
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Tool</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

<script>
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    if (!iso) return "-";
    return iso.slice(0, 10);
  }

  function expiraLabel(u) {
    if (!u.expiresAt) return "nunca";
    if (u.expirado) return u.expiresAt.slice(0, 10) + " (caducado)";
    if (u.diasRestantes !== null && u.diasRestantes <= 14) return u.expiresAt.slice(0, 10) + " (" + u.diasRestantes + " días)";
    return u.expiresAt.slice(0, 10);
  }

  function expiraClass(u) {
    if (u.expirado) return "bad";
    if (u.diasRestantes !== null && u.diasRestantes <= 14) return "warn";
    return "";
  }

  function showReveal(title, accessToken, url) {
    el("revealTitle").textContent = title;
    el("revealToken").textContent = accessToken;
    el("revealUrl").textContent = url;
    el("reveal").style.display = "block";
    el("reveal").scrollIntoView({ behavior: "smooth" });
  }

  el("revealClose").addEventListener("click", function () {
    el("reveal").style.display = "none";
    el("revealToken").textContent = "";
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

      users.forEach(function (u) {
        var tr = document.createElement("tr");

        var tdNombre = document.createElement("td");
        tdNombre.textContent = u.nombre;
        tr.appendChild(tdNombre);

        var tdAlta = document.createElement("td");
        tdAlta.textContent = fmtDate(u.createdAt);
        tr.appendChild(tdAlta);

        var tdExpira = document.createElement("td");
        tdExpira.textContent = expiraLabel(u);
        tdExpira.className = expiraClass(u);
        tr.appendChild(tdExpira);

        var tdUltimo = document.createElement("td");
        tdUltimo.textContent = u.lastUsedAt ? fmtDate(u.lastUsedAt) : "nunca";
        tr.appendChild(tdUltimo);

        var tdAcciones = document.createElement("td");

        var bRotate = document.createElement("button");
        bRotate.textContent = "Rotar";
        bRotate.addEventListener("click", function () {
          var dias = window.prompt("Días de validez del nuevo token (vacío = por defecto):", "");
          var body = {};
          if (dias) body.dias = Number(dias);
          apiPost("/admin/api/users/" + u.id + "/rotate", body).then(function (data) {
            showReveal("Usuario: " + u.nombre + " (token regenerado)", data.accessToken, data.url);
            loadUsers();
          }).catch(function (e) { alert(e.message); });
        });
        tdAcciones.appendChild(bRotate);

        var bToken = document.createElement("button");
        bToken.textContent = "Cambiar token iagestión";
        bToken.addEventListener("click", function () {
          var tok = window.prompt("Nuevo token M2M de iagestión para " + u.nombre + ":", "");
          if (!tok) return;
          apiPost("/admin/api/users/" + u.id + "/set-token", { apiToken: tok }).then(function () {
            alert("Token de iagestión actualizado.");
          }).catch(function (e) { alert(e.message); });
        });
        tdAcciones.appendChild(bToken);

        var bRevoke = document.createElement("button");
        bRevoke.textContent = "Revocar";
        bRevoke.className = "danger";
        bRevoke.addEventListener("click", function () {
          if (!window.confirm("¿Revocar a " + u.nombre + "? Dejará de poder conectar de inmediato.")) return;
          apiDelete("/admin/api/users/" + u.id).then(function () {
            loadUsers();
          }).catch(function (e) { alert(e.message); });
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
    var url = "/admin/api/audit?limit=200" + (userId ? "&userId=" + encodeURIComponent(userId) : "");
    fetch(url).then(function (r) { return r.json(); }).then(function (entries) {
      var tbody = el("auditTable").querySelector("tbody");
      tbody.innerHTML = "";
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

  el("createForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nombre = el("cNombre").value.trim();
    var token = el("cToken").value.trim();
    var dias = el("cDias").value ? Number(el("cDias").value) : undefined;
    el("createMsg").textContent = "";
    el("createMsg").className = "msg";
    apiPost("/admin/api/users", { nombre: nombre, apiToken: token, dias: dias }).then(function (data) {
      el("createForm").reset();
      showReveal("Usuario: " + data.nombre + " (nuevo)", data.accessToken, data.url);
      loadUsers();
    }).catch(function (e) {
      el("createMsg").textContent = e.message;
      el("createMsg").className = "msg error";
    });
  });

  el("auditFilter").addEventListener("change", loadAudit);
  el("auditRefresh").addEventListener("click", loadAudit);

  loadUsers();
  loadAudit();
  setInterval(loadAudit, 20000);
})();
</script>
</body>
</html>`;
}
