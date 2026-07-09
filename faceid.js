// =============================================
// FACE ID / TOUCH ID — Puerta biométrica local
// =============================================
// La app no tiene backend, así que el credential de WebAuthn se usa
// únicamente como candado biométrico del dispositivo (no se verifica
// firma en servidor). Sirve para evitar volver a pasar por el flujo
// de Google cada vez que se abre la app desde la pantalla de inicio.

const FaceAuth = {
  // v2: credenciales NO discoverable (residentKey: "discouraged"), para que
  // iOS pida el rostro directo en vez de mostrar la tarjeta "Iniciar sesión
  // con llave de acceso guardada en Contraseñas" propia de las passkeys.
  CRED_KEY: "faceid_cred_id_v2",

  soportado() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  },

  async disponiblePlataforma() {
    if (!this.soportado()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) { return false; }
  },

  tieneCredencial() {
    return !!localStorage.getItem(this.CRED_KEY);
  },

  borrarCredencial() {
    localStorage.removeItem(this.CRED_KEY);
  },

  _bufToB64url(buf) {
    let bin = "";
    new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },

  _b64urlToBuf(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const bin = atob(str);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  },

  // Registra Face ID / Touch ID como candado de entrada rápida.
  // Se llama una sola vez, justo después del primer login con Google.
  async registrar(userLabel) {
    if (this.tieneCredencial()) return true;
    if (!(await this.disponiblePlataforma())) return false;
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "Finanzas Hogar" },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: userLabel || "usuario",
            displayName: userLabel || "Usuario"
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "discouraged",
            requireResidentKey: false
          },
          timeout: 60000,
          attestation: "none"
        }
      });
      if (!cred) return false;
      localStorage.setItem(this.CRED_KEY, this._bufToB64url(cred.rawId));
      return true;
    } catch (e) { return false; }
  },

  // Pide Face ID / Touch ID. Resuelve true solo si el sistema operativo
  // confirmó la verificación biométrica del usuario.
  async verificar() {
    const credIdB64 = localStorage.getItem(this.CRED_KEY);
    if (!credIdB64) return false;
    try {
      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: this._b64urlToBuf(credIdB64), type: "public-key" }],
          userVerification: "required",
          timeout: 30000
        }
      });
      return !!cred;
    } catch (e) { return false; }
  }
};

// Limpieza de la credencial vieja (v1, discoverable) que mostraba la
// tarjeta de "Iniciar sesión con llave de acceso" en vez de ir directo a Face ID.
localStorage.removeItem("faceid_cred_id");
