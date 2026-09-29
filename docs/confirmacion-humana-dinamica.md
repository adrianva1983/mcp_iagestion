# Confirmación humana por código propio de cada usuario

**Estado**: implementado. Cada usuario puede tener su propio código de
confirmación (`admin add --confirm-code` / `admin set-confirm-code` / el
panel web); sin uno, usa el secreto compartido `IAGESTION_CONFIRM_TOKEN`.

## Cómo funciona

1. `guardDestructiveCall` (en `src/httpServer.ts`) detecta que un usuario ha
   superado el umbral de acciones destructivas (hoy: 5 en 10 minutos —
   ajustable).
2. Comprueba lo que traiga `confirmacion_humana` contra:
   - El código propio de ese usuario (`confirmCodeHash`), si lo tiene, o
   - si no, el secreto compartido `IAGESTION_CONFIRM_TOKEN`.
   Solo se guarda el hash (SHA-256) del código propio, nunca en claro —
   igual que el token de acceso; no se puede recuperar, solo cambiar.
3. Si coincide: el usuario queda aprobado para el **resto de la ventana de
   10 minutos** — no hace falta repetir el código en cada llamada siguiente,
   solo la primera vez que se supera el umbral.
4. Si no coincide (o no viene): se bloquea con un mensaje corto pidiendo el
   código — deliberadamente breve, sin explicar de nuevo todo el mecanismo
   cada vez.

El código lo define y cambia quien administra el servidor (CLI o panel), y
se lo comunica a esa persona por el canal que prefiera (nada de esto lo
automatiza el sistema). Es un secreto **estable**: no caduca por sí solo ni
se genera uno nuevo en cada uso — para eso está `admin set-confirm-code`,
cuando haga falta cambiarlo (por ejemplo, si se ha visto expuesto).

## Alternativas consideradas y descartadas

**Código de un solo uso enviado por email** (Resend, con caducidad de
minutos): se llegó a implementar, pero se revirtió a petición del usuario —
añadía una dependencia externa (proveedor de email) y una vuelta más
(esperar el correo) para un caso de uso donde un código estable, fijo por
usuario y cambiable a mano, ya bastaba.

**Guardar el estado en la base de datos del CRM**, con dos servicios PHP
nuevos en el backend de iagestión (`grabar_confirmacion_pendiente` /
`validar_confirmacion_pendiente`), para compartir el estado entre varias
instancias del servidor MCP. No hace falta hoy porque solo hay una instancia
— el estado de confirmación (`confirmCodeHash` en `/data/users.json`, y el
contador de la ventana en memoria del proceso) es más que suficiente. Si
algún día hay que escalar a varias instancias del servidor MCP a la vez,
esta sigue siendo la vía: base de datos compartida en vez de estado local.
