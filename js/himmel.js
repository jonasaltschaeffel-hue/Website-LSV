/* =====================================================================
   Wolkenhimmel (WebGL) – wird auf allen Seiten verwendet.
   Benötigt ein <canvas id="sky"> im Dokument. Die Wolken ziehen beim
   Scrollen von links nach rechts und treiben langsam weiter.
   ===================================================================== */
(() => {
const VS = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FS = `
precision highp float;
uniform vec2  uRes;
uniform float uScroll;   // Scrollposition in Bildschirmhöhen
uniform float uTime;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = M * p; a *= 0.5; }
  return v;
}
// "Billow"-Rauschen für die typischen Blumenkohl-Quellungen
float billow(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * abs(noise(p) * 2.0 - 1.0); p = M * p; a *= 0.5; }
  return v;
}

// Dichte einer Cumulus-Schicht. p.y = Höhe über der Wolkenbasis.
// hq = 1.0 für den sichtbaren Punkt (mit Feindetail), 0.0 für Schattenproben.
float cloud(vec2 p, float seed, float hq){
  // wo stehen Wolken und wie hoch sind sie (günstig, vorab)
  float x  = p.x + (noise(p * 0.9 + seed) - 0.5) * 0.5;
  float n  = noise(vec2(x * 0.55 + seed * 1.7, seed));
  float n2 = noise(vec2(x * 1.30 + seed * 3.1, 2.7 + seed));
  float H  = max(0.0, n - 0.40) * 3.0 + max(0.0, n2 - 0.55) * 1.1;
  H = 1.3 * (1.0 - exp(-H / 1.3));   // Wolkenhöhe weich begrenzen
  // freier Himmel: teure Berechnung überspringen
  if (p.y > H + 0.6) return 0.0;

  vec2 w = vec2(fbm(p * 0.9 + seed), fbm(p * 0.9 + seed + 7.3)) - 0.5;
  vec2 q = p + w * 0.55;
  float d  = (H - q.y) * 2.2;
  d += (billow(q * 2.6 + seed) - 0.35) * 0.9;
  if (hq > 0.5) d += (fbm(q * 7.0 - seed) - 0.5) * 0.25;
  // glatte, flache Wolkenbasis (Kondensationsniveau) – typische Segelflieger-Cumuli
  float baseY = p.y + (noise(vec2(p.x * 1.5, seed)) - 0.5) * 0.025;
  d *= smoothstep(0.0, 0.045, baseY);
  // keine dünnen Ausläufer entlang der Basis: nur wo eine echte Quellung steht
  d *= smoothstep(0.0, 0.14, H);
  return clamp(d, 0.0, 1.0);
}

// Sonne steht hinter den Wolken (Gegenlicht wie auf dem Referenzfoto)
vec2 sunPos(float aspect){ return vec2(aspect * 0.60, 0.80); }

vec3 skyColor(vec2 uv, float aspect){
  // tiefes, leicht entsättigtes Sommerblau, zum Horizont hin dunstig-hell
  vec3 top = vec3(0.15, 0.31, 0.66);
  vec3 mid = vec3(0.26, 0.47, 0.79);
  vec3 hor = vec3(0.68, 0.78, 0.88);
  float y = uv.y;
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.42, y));
  c = mix(c, top, smoothstep(0.42, 1.1, y));
  // zu den Seiten etwas dunkler (Polarisation des Himmelslichts)
  float sx = abs(uv.x / aspect - 0.5) * 2.0;
  c *= 1.0 - 0.12 * sx * sx;

  vec2 s = sunPos(aspect);
  vec2 v = uv - s;
  float sd = length(v);
  // weicher Lichthof um die verdeckte Sonne
  c += vec3(0.80, 0.88, 1.00) * (0.12 * exp(-sd * 2.6) + 0.05 * exp(-sd * 0.8));
  // Sonnenstrahlen (crepuskulare Strahlen) – breit und weich
  vec2 dir = v / max(sd, 1e-4);
  float r = noise(dir * 3.5 + 3.0) * 0.65 + noise(dir * 8.0 + 11.0) * 0.35;
  r = smoothstep(0.30, 0.90, r);
  float fall = exp(-sd * 1.3) * smoothstep(0.05, 0.4, sd);
  c += vec3(0.72, 0.84, 1.00) * r * 0.07 * fall;
  c -= vec3(0.02, 0.03, 0.04) * (1.0 - r) * fall;
  return c;
}

void layer(inout vec3 col, vec2 uv, float aspect, float scale, float base, float speed, float drift, float haze, float seed){
  float off = -(uScroll * speed + uTime * drift) * scale;
  vec2 p = vec2(uv.x * scale + off + seed * 11.0, (uv.y - base) * scale);
  if (p.y < -0.1 || p.y > 3.2) return;
  float d = cloud(p, seed, 1.0);
  if (d <= 0.001) return;

  // Licht: Dichte Richtung Sonne abtasten -> Selbstverschattung.
  // Die Richtung zeigt von jedem Pixel zur Sonne, dadurch leuchten
  // die der Sonne zugewandten dünnen Ränder silbern (Gegenlicht).
  vec2 s = sunPos(aspect);
  vec2 dir = normalize(s - uv + 1e-4);
  float occl = cloud(p + dir * 0.07, seed, 0.0) * 0.55
             + cloud(p + dir * 0.24, seed, 0.0) * 0.45;
  // dünne Randbereiche – nicht an der flachen Unterseite (die bleibt dunkel)
  float thin  = (1.0 - smoothstep(0.0, 0.55, d)) * smoothstep(0.02, 0.18, p.y);
  float nearS = exp(-length(uv - s) * 1.5);            // Nähe zur Sonne
  float light = clamp(1.0 - occl * 1.15, 0.0, 1.0);

  vec3 dark = vec3(0.41, 0.44, 0.52);   // dicker Wolkenkern im Gegenlicht
  vec3 mid  = vec3(0.68, 0.70, 0.77);
  vec3 lit  = vec3(0.98, 0.98, 0.99);
  vec3 c = mix(dark, mid, light);
  c = mix(c, lit, clamp(light * light * 0.9 + thin * 0.5, 0.0, 1.0));
  // Silberrand – je näher an der Sonne, desto heller
  c += vec3(1.0, 0.99, 0.96) * thin * (0.12 + nearS * 0.55);
  // dunklere, leicht bläuliche Wolkenbasis
  c = mix(c, c * vec3(0.76, 0.79, 0.87), (1.0 - smoothstep(0.0, 0.35, p.y)) * 0.7);
  // Dunst mit Entfernung
  c = mix(c, skyColor(uv, aspect), haze);

  float a = smoothstep(0.0, 0.32, d);
  col = mix(col, c, a);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float aspect = uRes.x / uRes.y;
  vec3 col = skyColor(uv, aspect);

  //       scale base  speed drift haze  seed
  layer(col, uv, aspect, 10.0, 0.04, 0.16, 0.004, 0.50, 1.0);
  layer(col, uv, aspect, 6.5,  0.14, 0.28, 0.006, 0.32, 2.0);
  layer(col, uv, aspect, 4.2,  0.28, 0.45, 0.009, 0.16, 3.0);
  layer(col, uv, aspect, 2.6,  0.42, 0.75, 0.012, 0.04, 4.0);

  // leichtes Korn gegen Banding
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('sky');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', {antialias: false, alpha: false, premultipliedAlpha: false});
  if (!gl) return; // Fallback: CSS-Farbverlauf des Canvas bleibt sichtbar
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uScroll = gl.getUniformLocation(prog, 'uScroll');
    const uTime = gl.getUniformLocation(prog, 'uTime');

    // Renderauflösung: Wolken sind weich, daher reicht ca. die halbe Auflösung (max. ~1 Mio. Pixel)
    const QUALITY = 0.5;
    const resize = () => {
      let s = Math.min(devicePixelRatio || 1, 1.5) * QUALITY;
      const px = innerWidth * innerHeight * s * s;
      if (px > 1e6) s *= Math.sqrt(1e6 / px);
      canvas.width = Math.round(innerWidth * s);
      canvas.height = Math.round(innerHeight * s);
      gl.viewport(0, 0, canvas.width, canvas.height);
      lastScroll = -1;
    };
    let lastScroll = -1, lastDraw = 0, lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
    addEventListener('resize', resize);
    resize();
    const drawSky = (t) => {
      if (lost) return; // Fallback: CSS-Farbverlauf des Canvas bleibt sichtbar
      const sc = scrollY;
      // nur neu zeichnen, wenn gescrollt wurde – sonst max. 15x/s für das langsame Treiben
      if (sc === lastScroll && (reduceMotion || t - lastDraw < 66)) return;
      lastScroll = sc; lastDraw = t;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uScroll, sc / innerHeight);
      gl.uniform1f(uTime, reduceMotion ? 0 : t / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // nach dem ersten fertigen Bild weich einblenden (siehe #sky.ready in stil.css)
      if (!canvas.classList.contains('ready')) requestAnimationFrame(() => canvas.classList.add('ready'));
    };

  const loop = (t) => { drawSky(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();