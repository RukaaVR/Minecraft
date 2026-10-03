// Halcyon renderer: WebGL2 port of the Halcyon Iris shader pack's pipeline.
//
//   sky LUT → sky + clouds (half res) → shadow map → lit terrain (forward version of
//   deferred.fsh) → copy → water (composite.fsh) → hand → god rays/underwater
//   (composite1) → bloom (composite2) → tonemap/grade (final)
'use strict';

// ---------------------------------------------------------------- CPU atmosphere
// Per-frame light colors, ported from lib/atmosphere.glsl (getSunlightColor,
// getMoonlightColor, getSkyAmbient). Evaluated once per frame on the CPU.
const HalcyonAtmos = (() => {
  const PLANET_R = 6360e3, ATMOS_R = 6420e3, H_RAY = 8000, H_MIE = 1200;
  const BETA_RAY = [5.802e-6, 15.0e-6, 29.5e-6], BETA_MIE_S = 3.996e-6, BETA_MIE_E = 4.440e-6;
  const BETA_OZO = [0.650e-6, 1.881e-6, 0.085e-6], MIE_G = 0.8;
  const SUN_ILL = 16, MOON_ILL = 0.06;
  const v3 = (x, y, z) => [x, y, z];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const exitR = (ro, rd, r) => { const b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c; return d < 0 ? 0 : -b + Math.sqrt(d); };
  const dens = (h) => { h = Math.max(h, 0); return [Math.exp(-h / H_RAY), Math.exp(-h / H_MIE), Math.max(0, 1 - Math.abs(h - 25000) / 15000)]; };
  const ext = (od) => [0, 1, 2].map((i) => BETA_RAY[i] * od[0] + BETA_MIE_E * od[1] + BETA_OZO[i] * od[2] * 1.5);
  const lightOD = (p, l, steps) => {
    const L = exitR(p, l, ATMOS_R), ds = L / steps, od = [0, 0, 0];
    for (let i = 0; i < steps; i++) {
      const s = [p[0] + l[0] * ds * (i + 0.5), p[1] + l[1] * ds * (i + 0.5), p[2] + l[2] * ds * (i + 0.5)];
      const d = dens(len(s) - PLANET_R); od[0] += d[0]; od[1] += d[1]; od[2] += d[2];
    }
    return [od[0] * ds, od[1] * ds, od[2] * ds];
  };
  const phaseR = (c) => 3 / (16 * Math.PI) * (1 + c * c);
  const phaseCS = (c, g) => { const g2 = g * g; return 3 / (8 * Math.PI) * ((1 - g2) * (1 + c * c)) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * c, 1.5)); };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const RO = [0, PLANET_R + 350, 0];

  function sunTransmittance(l) {
    l = norm([l[0], l[1] * 0.98 + 0.02, l[2]]);
    const e = ext(lightOD(RO, l, 8));
    return e.map((x) => Math.exp(-x));
  }
  function scatterSky(v, l, ill) {
    v = norm([v[0], Math.max(v[1], 0) + 0.012, v[2]]);
    const L = exitR(RO, v, ATMOS_R), c = dot(v, l), pr = phaseR(c), pm = phaseCS(c, MIE_G);
    const sumR = [0, 0, 0], sumM = [0, 0, 0], odV = [0, 0, 0];
    const N = 10;
    for (let i = 0; i < N; i++) {
      const f = (i + 0.5) / N, t = f * f * L;
      const dt = (((i + 1) / N) ** 2 - (i / N) ** 2) * L;
      const p = [RO[0] + v[0] * t, RO[1] + v[1] * t, RO[2] + v[2] * t];
      const d = dens(len(p) - PLANET_R).map((x) => x * dt);
      odV[0] += d[0]; odV[1] += d[1]; odV[2] += d[2];
      const odL = lightOD(p, l, 3);
      const e = ext([odV[0] + odL[0], odV[1] + odL[1], odV[2] + odL[2]]);
      for (let k = 0; k < 3; k++) { const T = Math.exp(-e[k]); sumR[k] += T * d[0]; sumM[k] += T * d[1]; }
    }
    return [0, 1, 2].map((k) => (sumR[k] * BETA_RAY[k] * pr + sumM[k] * BETA_MIE_S * pm + sumR[k] * BETA_RAY[k] * (0.25 / Math.PI) * 0.35) * ill);
  }
  function getSky(v, sun, moon) {
    let s = scatterSky(v, sun, SUN_ILL);
    const m = scatterSky(v, moon, MOON_ILL * 4);
    s = [s[0] + m[0] * 0.55, s[1] + m[1] * 0.7, s[2] + m[2]];
    const up = Math.max(v[1], 0), hz = Math.pow(1 - up, 4) * 0.6;
    s = [s[0] * (1 + (0.86 - 1) * hz), s[1] * (1 + (1.04 - 1) * hz), s[2] * (1 + (1.10 - 1) * hz)];
    const l = luma(s);
    s = s.map((x) => Math.max(0, l + (x - l) * 1.3));
    const night = 1 - smooth(-0.22, 0.02, sun[1]);
    if (night > 0) {
      const z = [0.0024, 0.0034, 0.0100], h = [0.0060, 0.0050, 0.0140], t = smooth(0, 0.6, up);
      s = s.map((x, i) => x + (h[i] + (z[i] - h[i]) * t) * night);
    }
    return s.map((x) => x * 1.15);
  }
  return {
    // Returns colors for the frame. dim 1 = nether (fog-colored, no sun).
    frame(sunDir, moonDir, moonPhase, dim, fogLin) {
      if (dim === 2) return { sunColor: [0, 0, 0], lightColor: [0, 0, 0], skyAmbient: [0.46, 0.40, 0.62] };
      if (dim >= 1) {
        return {
          sunColor: [0, 0, 0], lightColor: [0, 0, 0],
          skyAmbient: [fogLin[0] * 6 + 0.30, fogLin[1] * 6 + 0.20, fogLin[2] * 6 + 0.15],
        };
      }
      const sunUp = smooth(-0.06, 0.04, sunDir[1]);
      const T = sunTransmittance(sunDir);
      const sunColor = T.map((x) => x * SUN_ILL * sunUp);
      const moonUp = smooth(-0.06, 0.06, moonDir[1]);
      const full = 0.5 + 0.5 * Math.cos(moonPhase / 8 * Math.PI * 2);
      const moonColor = [0.58, 0.72, 1.0].map((x) => x * MOON_ILL * moonUp * (0.25 + 0.75 * full));
      const lightIsSun = sunDir[1] > -0.02;
      const e = 0.45;
      const dirs = [[0, 1, 0, 0.30], [1, e, 0, 0.175], [-1, e, 0, 0.175], [0, e, 1, 0.175], [0, e, -1, 0.175]];
      const amb = [0, 0, 0];
      for (const [x, y, z, w] of dirs) {
        const c = getSky(norm([x, y, z]), sunDir, moonDir);
        amb[0] += c[0] * w; amb[1] += c[1] * w; amb[2] += c[2] * w;
      }
      return { sunColor, lightColor: lightIsSun ? sunColor : moonColor, skyAmbient: amb.map((x) => x * Math.PI), lightIsSun };
    },
    luma,
  };
})();

// ---------------------------------------------------------------- renderer
class HalcyonRenderer {
  constructor(renderer, game, presetName) {
    this.renderer = renderer;
    this.game = game;
    this.gl2 = renderer.capabilities.isWebGL2;
    this.supported = this.gl2 && !!renderer.extensions.get('EXT_color_buffer_float');
    this.preset = HALCYON_PRESETS[presetName] || HALCYON_PRESETS.MEDIUM;
    this.presetName = presetName;
    this.eyeSkySmooth = 1;
    const U = (v) => ({ value: v });
    this.u = {
      frameTimeCounter: U(0), sunDir: U(new THREE.Vector3(0, 1, 0)), moonDir: U(new THREE.Vector3(0, -1, 0)),
      lightDir: U(new THREE.Vector3(0, 1, 0)), sunColor: U(new THREE.Vector3()), lightColor: U(new THREE.Vector3()),
      skyAmbient: U(new THREE.Vector3()), moonPhase: U(0), rainStrength: U(0), far: U(96), isEyeInWater: U(0),
      eyeSky: U(1), dimension: U(0), fogColorLin: U(new THREE.Vector3(0.05, 0.005, 0.004)),
      skyLUT: U(null), shadowtex: U(null), shadowMatrix: U(new THREE.Matrix4()),
    };
    if (!this.supported) return;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    this.shadowCam.layers.set(1);
    this.build();
  }

  setPreset(name) {
    this.presetName = name;
    this.preset = HALCYON_PRESETS[name] || HALCYON_PRESETS.MEDIUM;
    if (!this.supported) return;
    this.dispose();
    this.build();
  }

  dispose() {
    for (const k of ['lutRT', 'skyRT', 'shadowRT', 'hdrRT', 'copyRT', 'postRT', 'bloomRT']) if (this[k]) this[k].dispose();
    for (const k of Object.keys(this.mats || {})) this.mats[k].dispose();
  }

  build() {
    const p = this.preset;
    const head = halcyonSettings(p) + HG_COMMON;
    const libs = head + HG_ATMOSPHERE + HG_CLOUDS + HG_NIGHTSKY + HG_SHADOWS + HG_LIGHTING + HG_WIND + HG_WATER + HG_FACE;
    const HF = THREE.HalfFloatType;
    const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(w, h, Object.assign({ type: HF, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }, o));
    this.lutRT = rt(256, 128, { wrapS: THREE.RepeatWrapping });
    this.lutRT.texture.wrapS = THREE.RepeatWrapping;
    this.u.skyLUT.value = this.lutRT.texture;
    this.shadowRT = new THREE.WebGLRenderTarget(p.shadowRes, p.shadowRes, { depthBuffer: true });
    this.shadowRT.depthTexture = new THREE.DepthTexture(p.shadowRes, p.shadowRes);
    this.shadowRT.depthTexture.type = THREE.UnsignedIntType;
    this.shadowRT.depthTexture.minFilter = this.shadowRT.depthTexture.magFilter = THREE.NearestFilter;
    this.u.shadowtex.value = this.shadowRT.depthTexture;
    this.skyRT = rt(4, 4);
    this.hdrRT = rt(4, 4, { depthBuffer: true });
    this.hdrRT.depthTexture = new THREE.DepthTexture(4, 4);
    this.hdrRT.depthTexture.type = THREE.UnsignedIntType;
    this.copyRT = rt(4, 4, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.postRT = rt(4, 4, { minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true });
    this.bloomRT = rt(4, 4);
    this.size = [0, 0];

    const shared = this.u;
    const atlas = this.game.atlas;
    const mk = (vert, frag, extra = {}, opts = {}) => new THREE.ShaderMaterial(Object.assign({
      uniforms: Object.assign({}, shared, extra), vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
    }, opts));
    const FS_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const U = (v) => ({ value: v });

    this.mats = {};
    this.mats.lut = mk(FS_VERT, head + HG_ATMOSPHERE + `
varying vec2 vUv;
void main() {
  float phi = (vUv.x - 0.5) * TAU, th = (vUv.y - 0.5) * PI;
  vec3 dir = vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi));
  gl_FragColor = vec4(getSkyFull(dir), 1.0);
}`);
    this.mats.sky = mk(FS_VERT, libs + `
uniform mat4 invProj; uniform mat4 camWorld; uniform vec3 camPosW; uniform float pixelAngle; uniform vec2 viewSize;
varying vec2 vUv;
void main() {
  vec4 vp = invProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize((camWorld * vec4(normalize(vp.xyz / vp.w), 0.0)).xyz);
  vec3 sky = getSky(dir);
  if (dimension == 1) { gl_FragColor = vec4(sky, 1.0); return; }
  float night = 1.0 - smoothstep(-0.20, 0.0, sunDir.y);
  float dither = ign(gl_FragCoord.xy);
  sky += sunDisk(dir, sunDir, sunColor / SUN_ILLUMINANCE);
  sky += nightSkyDetail(dir, pixelAngle, frameTimeCounter, night);
#ifdef VOLUMETRIC_CLOUDS
  vec4 clouds = renderClouds(camPosW, dir, 1e9, lightDir, lightColor, skyAmbient / PI, frameTimeCounter, dither);
#else
  vec4 clouds = renderClouds2D(camPosW, dir, lightDir, lightColor, skyAmbient / PI, frameTimeCounter);
#endif
  float horizonFade = smoothstep(-0.02, 0.08, dir.y);
  clouds.rgb *= horizonFade;
  clouds.a = mix(1.0, clouds.a, horizonFade);
  clouds.rgb = mix(clouds.rgb, sky * (1.0 - clouds.a), 0.25 * (1.0 - horizonFade));
  gl_FragColor = vec4(sky * clouds.a + clouds.rgb, clouds.a);
}`, { invProj: U(new THREE.Matrix4()), camWorld: U(new THREE.Matrix4()), camPosW: U(new THREE.Vector3()), pixelAngle: U(0.002), viewSize: U(new THREE.Vector2()) });

    // Background: the half-res sky drawn behind everything (depth = far)
    this.mats.background = mk(FS_VERT, `uniform sampler2D skyTex; varying vec2 vUv; void main() { gl_FragColor = texture(skyTex, vUv); }`,
      { skyTex: U(null) });

    const CHUNK_VERT = head + HG_WIND + `
attribute vec4 light;
varying vec2 vUv; varying vec4 vLight; varying vec3 vWorld;
void main() {
  vUv = uv; vLight = light;
  vec3 wp = position;
  float face = floor(light.w / 16.0 + 0.001);
  float mat = light.w - face * 16.0;
  float amount = mat > 7.5 && mat < 8.5 ? 1.0 : (mat > 1.5 && mat < 2.5 ? 0.35 : 0.0);
  if (amount > 0.0) wp += windOffset(wp, frameTimeCounter) * amount;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
    this.mats.solid = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, shared, { map: U(atlas) }),
      vertexShader: CHUNK_VERT,
      fragmentShader: libs + `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vLight; varying vec3 vWorld;
void main() {
  vec4 tex = texture(map, vUv);
  if (tex.a < 0.5) discard;
  float face = floor(vLight.w / 16.0 + 0.001);
  int mat = int(vLight.w - face * 16.0 + 0.5);
  if (mat == 8) mat = MAT_FOLIAGE;
  vec3 albedo = toLinear(tex.rgb);
  vec3 normalW = faceNormal(face);
  vec3 playerPos = vWorld - cameraPosition;
  vec3 dir = normalize(playerPos);
  float dither = ign(gl_FragCoord.xy);
  float skylight = vLight.x, blocklight = vLight.y;
  if ((mat == MAT_GRASS && normalW.y > 0.5) || mat == MAT_FOLIAGE) {
    float n = noise2D(vWorld.xz / 22.0) * 0.65 + noise2D(vWorld.xz / 7.0) * 0.35;
    float v = (n - 0.5) * 0.35 * GRASS_VARIATION;
    albedo *= 1.0 + v;
    albedo = mix(albedo, albedo * vec3(1.12, 1.04, 0.80), saturate(v * 2.0));
  }
  float ao = mix(1.0, vLight.z, VANILLA_AO_STRENGTH);
  vec3 shadow = vec3(0.0);
  bool plant = mat == MAT_FOLIAGE || mat == MAT_LEAVES;
  float NdotL = dot(normalW, lightDir);
  if (dimension == 0 && (NdotL > 0.0 || plant)) {
    vec3 n = plant ? lightDir : normalW;
    shadow = getShadow(playerPos, n, lightDir, dither, plant ? 1.4 : 1.0);
    float fade = smoothstep(shadowDistance * 0.8, shadowDistance * 0.97, length(playerPos));
    shadow = mix(shadow, vec3(smoothstep(0.75, 0.95, skylight)), fade);
    shadow *= cloudShadow(vWorld, lightDir, frameTimeCounter);
  }
  vec3 sssShadow = shadow;
  if (plant && dimension == 0) sssShadow = getShadow(playerPos + lightDir * 1.6, lightDir, lightDir, dither, 2.0) * cloudShadow(vWorld, lightDir, frameTimeCounter);
  vec3 col = shadeSurface(albedo, normalW, dir, skylight, blocklight, ao, mat, shadow, sssShadow, lightDir, lightColor, skyAmbient);
  vec3 skyInDir = getSky(dir);
  vec4 ap = getAerialPerspective(playerPos, cameraPosition.y, skyInDir, sunDir, sunColor, far, rainStrength);
  float skyVis = mix(0.25, 1.0, smoothstep(0.0, 0.6, skylight));
  if (dimension == 1) skyVis = 1.0;
  col = col * ap.a + ap.rgb * mix(skyVis, 1.0, 1.0 - ap.a);
  gl_FragColor = vec4(col, 1.0);
}`,
    });

    this.mats.water = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, shared, { map: U(atlas), copyTex: U(null), viewSize: U(new THREE.Vector2()) }),
      side: THREE.DoubleSide,
      vertexShader: CHUNK_VERT,
      fragmentShader: libs + `
uniform sampler2D map; uniform sampler2D copyTex; uniform vec2 viewSize; uniform mat4 projectionMatrix;
varying vec2 vUv; varying vec4 vLight; varying vec3 vWorld;
vec3 viewToScreen(vec3 v) { vec4 h = projectionMatrix * vec4(v, 1.0); return h.xyz / h.w * 0.5 + 0.5; }
vec3 traceSSR(vec3 viewPos, vec3 rayDir, float dither) {
#ifdef SSR
  float stepSize = 0.25 + 0.03 * -viewPos.z;
  vec3 p = viewPos + rayDir * stepSize * (0.5 + dither);
  for (int i = 0; i < SSR_STEPS; i++) {
    vec3 ss = viewToScreen(p);
    if (ss.x < 0.0 || ss.x > 1.0 || ss.y < 0.0 || ss.y > 1.0 || p.z > -0.05) break;
    float sceneZ = -texture(copyTex, ss.xy).a;
    float diff = sceneZ - p.z;
    if (diff > 0.0 && sceneZ > -9e4 && diff < stepSize * 2.5 + 0.5) {
      vec2 edge = smoothstep(0.0, 0.08, ss.xy) * (1.0 - smoothstep(0.92, 1.0, ss.xy));
      return vec3(ss.xy, edge.x * edge.y * (1.0 - float(i) / float(SSR_STEPS) * 0.5));
    }
    stepSize *= 1.22;
    p += rayDir * stepSize;
  }
#endif
  return vec3(0.0);
}
void main() {
  vec2 suv = gl_FragCoord.xy / viewSize;
  float face = floor(vLight.w / 16.0 + 0.001);
  int mat = int(vLight.w - face * 16.0 + 0.5);
  vec3 playerPos = vWorld - cameraPosition;
  vec3 V = normalize(playerPos);
  vec3 view0 = (viewMatrix * vec4(vWorld, 1.0)).xyz;
  float dither = ign(gl_FragCoord.xy);
  vec4 behind0 = texture(copyTex, suv);
  if (mat == 12) {
    // Nether portal: glowing translucent swirl over the scene
    vec4 tex = texture(map, vUv + vec2(sin(frameTimeCounter * 0.7 + vWorld.y) * 0.002, 0.0));
    vec3 glow = toLinear(tex.rgb) * 2.5;
    gl_FragColor = vec4(mix(behind0.rgb, glow, 0.7), 1.0);
    return;
  }
  float skyLM = vLight.x;
  vec3 N = faceNormal(face);
  if (N.y > 0.5) N = waterNormal(vWorld.xz, frameTimeCounter, length(playerPos));
  if (!gl_FrontFacing) N = -N;
  vec3 lightInWater = (lightColor * saturate(lightDir.y) * 0.6 + skyAmbient / PI * 1.2) * max(skyLM * skyLM, 0.02);
  vec3 NV = (viewMatrix * vec4(N, 0.0)).xyz;
  float frontZ = -view0.z;
  float rawThickness = max(behind0.a - frontZ, 0.0);
  vec2 refrUV = suv + NV.xy * 0.05 * WATER_REFRACTION * saturate(rawThickness / 3.0) / (1.0 + length(view0) / 24.0);
  vec4 behind = texture(copyTex, refrUV);
  if (behind.a < frontZ || refrUV != clamp(refrUV, 0.0, 1.0)) behind = behind0;
  float thickness = behind.a > 9e4 ? 96.0 : max(behind.a - frontZ, 0.0);
  if (isEyeInWater == 1) { gl_FragColor = vec4(behind.rgb, 1.0); return; }
  vec3 transmit = exp(-WATER_ABSORPTION * thickness);
  vec3 under = behind.rgb * transmit + waterInscatter(thickness, lightInWater);
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float NdotV = saturate(dot(N, -V));
  float fresnel = 0.02 + 0.98 * pow5(1.0 - NdotV);
  vec3 skyR = getSky(R);
  if (dimension == 0) {
    vec4 cl = renderClouds2D(cameraPosition + playerPos, R, lightDir, lightColor, skyAmbient / PI, frameTimeCounter);
    skyR = skyR * cl.a + cl.rgb;
  }
  vec3 refl = skyR * smoothstep(0.2, 0.9, skyLM);
  vec3 RV = (viewMatrix * vec4(reflect(V, N), 0.0)).xyz;
  vec3 hit = traceSSR(view0, normalize(RV), dither);
  if (hit.z > 0.0) refl = mix(refl, texture(copyTex, hit.xy).rgb, hit.z);
  vec3 shadow = vec3(1.0);
  if (dimension == 0 && lightDir.y > 0.0) shadow = getShadow(playerPos, vec3(0.0, 1.0, 0.0), lightDir, dither, 1.0);
  shadow *= cloudShadow(vWorld, lightDir, frameTimeCounter);
  float spec = ggxSpecular(N, -V, lightDir, 0.11);
  vec3 specular = lightColor * shadow * spec * (fresnel + 0.02) * 0.9;
  float shore = smoothstep(0.0, 0.6, thickness);
  vec3 col = mix(under, refl, fresnel * WATER_REFLECTION_STRENGTH * shore) + specular * shore;
  vec3 skyInDir = getSky(V);
  vec4 ap = getAerialPerspective(playerPos, cameraPosition.y, skyInDir, sunDir, sunColor, far, rainStrength);
  col = col * ap.a + ap.rgb;
  gl_FragColor = vec4(col, 1.0);
}`,
    });

    this.mats.shadow = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, shared, { map: U(atlas) }),
      vertexShader: head + HG_WIND + `
attribute vec4 light;
uniform mat4 shadowMatrix;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 wp = position;
  float face = floor(light.w / 16.0 + 0.001);
  float mat = light.w - face * 16.0;
  float amount = mat > 7.5 && mat < 8.5 ? 1.0 : (mat > 1.5 && mat < 2.5 ? 0.35 : 0.0);
  if (amount > 0.0) wp += windOffset(wp, frameTimeCounter) * amount;
  vec4 sp = shadowMatrix * vec4(wp, 1.0);
  float f = length(sp.xy) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT);
  gl_Position = vec4(sp.xy / f, sp.z, 1.0);
}`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main() { if (texture(map, vUv).a < 0.5) discard; gl_FragColor = vec4(1.0); }`,
      side: THREE.DoubleSide,
    });

    this.mats.copy = mk(FS_VERT, `
uniform sampler2D colorTex; uniform sampler2D depthTex; uniform float cNear; uniform float cFar;
varying vec2 vUv;
void main() {
  float d = texture(depthTex, vUv).r;
  float z = d * 2.0 - 1.0;
  float viewZ = d >= 1.0 ? 1e5 : (2.0 * cNear * cFar) / (cFar + cNear - z * (cFar - cNear));
  gl_FragColor = vec4(texture(colorTex, vUv).rgb, viewZ);
}`, { colorTex: U(null), depthTex: U(null), cNear: U(0.05), cFar: U(1000) });

    this.mats.comp1 = mk(FS_VERT, head + HG_ATMOSPHERE + HG_WATER + `
uniform sampler2D colorTex; uniform sampler2D copyTex; uniform vec2 lightUV; uniform float lightVisible; uniform float VdotLmax;
uniform mat4 invProj; uniform mat4 camWorld;
varying vec2 vUv;
void main() {
  vec4 scene = texture(colorTex, vUv);
  vec3 col = scene.rgb;
  float viewZ = texture(copyTex, vUv).a;
#ifdef GODRAYS
  if (isEyeInWater == 0 && dimension == 0 && lightVisible > 0.0) {
    vec4 vp = invProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 vdir = normalize((camWorld * vec4(normalize(vp.xyz / vp.w), 0.0)).xyz);
    float VdotL = dot(vdir, lightDir);
    float dither = ign(gl_FragCoord.xy);
    vec2 delta = (lightUV - vUv) / float(GODRAY_STEPS);
    vec2 uv = vUv + delta * dither;
    float vis = 0.0;
    for (int i = 0; i < GODRAY_STEPS; i++) {
      vec2 s = clamp(uv, 0.0, 1.0);
      float z = texture(copyTex, s).a;
      vis += z > 9e4 ? texture(colorTex, s).a : 0.0;
      uv += delta;
    }
    vis /= float(GODRAY_STEPS);
    float onScreen = smoothstep(0.0, 0.3, 1.2 - max(abs(lightUV.x - 0.5), abs(lightUV.y - 0.5)));
    float phase = phaseHG(VdotL, 0.78) + phaseHG(VdotL, 0.3) * 0.3;
    col += lightColor * vis * phase * 0.014 * GODRAY_STRENGTH * onScreen;
  }
#endif
  if (isEyeInWater == 1) {
    float dist = viewZ > 9e4 ? 128.0 : viewZ;
    vec3 lightUW = (lightColor * saturate(lightDir.y) * 0.6 + skyAmbient / PI * 1.2) * max(pow2(eyeSky), 0.03);
    col = col * exp(-WATER_ABSORPTION * dist * 1.2) + waterInscatter(dist * 1.2, lightUW);
  } else if (isEyeInWater == 2) {
    col = mix(col, vec3(2.0, 0.6, 0.1), 1.0 - exp(-min(viewZ, 200.0) * 0.9));
  }
  gl_FragColor = vec4(min(col, vec3(64.0)), 1.0);
}`, { colorTex: U(null), copyTex: U(null), lightUV: U(new THREE.Vector2()), lightVisible: U(0), VdotLmax: U(0), invProj: U(new THREE.Matrix4()), camWorld: U(new THREE.Matrix4()) });

    this.mats.bloom = mk(FS_VERT, head + `
uniform sampler2D srcTex; uniform vec2 srcSize;
varying vec2 vUv;
vec3 tentLod(vec2 uv, float lod) {
  vec2 texel = exp2(lod) / srcSize;
  vec3 s = textureLod(srcTex, uv, lod).rgb * 4.0;
  s += textureLod(srcTex, uv + vec2(texel.x, 0.0), lod).rgb * 2.0;
  s += textureLod(srcTex, uv + vec2(-texel.x, 0.0), lod).rgb * 2.0;
  s += textureLod(srcTex, uv + vec2(0.0, texel.y), lod).rgb * 2.0;
  s += textureLod(srcTex, uv + vec2(0.0, -texel.y), lod).rgb * 2.0;
  s += textureLod(srcTex, uv + texel, lod).rgb;
  s += textureLod(srcTex, uv - texel, lod).rgb;
  s += textureLod(srcTex, uv + vec2(texel.x, -texel.y), lod).rgb;
  s += textureLod(srcTex, uv + vec2(-texel.x, texel.y), lod).rgb;
  return s / 16.0;
}
void main() {
  vec3 bloom = vec3(0.0); float wsum = 0.0;
  for (int i = 2; i <= 7; i++) { float w = 1.0 / (1.0 + float(i - 2) * 0.35); bloom += tentLod(vUv, float(i)) * w; wsum += w; }
  gl_FragColor = vec4(bloom / wsum, 1.0);
}`, { srcTex: U(null), srcSize: U(new THREE.Vector2()) });

    this.mats.final = mk(FS_VERT, head + `
uniform sampler2D colorTex; uniform sampler2D bloomTex;
varying vec2 vUv;
vec3 acesFitted(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = inM * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return saturate(outM * (a / b));
}
void main() {
  vec3 col = texture(colorTex, vUv).rgb;
  col = mix(col, texture(bloomTex, vUv).rgb, 0.07 * BLOOM_STRENGTH);
  float exposure = EXPOSURE * 0.85;
  float day = smoothstep(-0.10, 0.25, sunDir.y);
  float outdoorEV = mix(5.0, 1.0, day);
  if (dimension == 1) outdoorEV = 1.6;
  exposure *= mix(3.0, outdoorEV, eyeSky);
  col *= exposure;
  col *= vec3(1.0 + WHITE_BALANCE * 0.5, 1.0, 1.0 - WHITE_BALANCE * 0.5);
  float l = luma(col);
  col *= pow(max(l, 1e-5) / 0.18, CONTRAST * 1.04 - 1.0);
  col = max(mix(vec3(luma(col)), col, SATURATION * 1.12), 0.0);
  col = acesFitted(col * 1.1);
  col = toSRGB(col);
  float lum = luma(col);
  col += vec3(-0.004, 0.002, 0.014) * SHADOW_TINT * (1.0 - smoothstep(0.0, 0.5, lum));
  col = col * 0.985 + 0.012;
  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * VIGNETTE * 1.1;
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(saturate(col), 1.0);
}`, { colorTex: U(null), bloomTex: U(null) });
  }

  resize(w, h) {
    const p = this.preset;
    const W = Math.max(4, Math.floor(w * p.renderScale)), Hh = Math.max(4, Math.floor(h * p.renderScale));
    if (this.size[0] === W && this.size[1] === Hh) return;
    this.size = [W, Hh];
    this.hdrRT.setSize(W, Hh);
    this.copyRT.setSize(W, Hh);
    this.postRT.setSize(W, Hh);
    this.bloomRT.setSize(Math.max(4, W >> 1), Math.max(4, Hh >> 1));
    this.skyRT.setSize(Math.max(4, Math.floor(w * p.skyScale)), Math.max(4, Math.floor(h * p.skyScale)));
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // Shared per-frame uniforms
  updateFrame(game, dt) {
    const u = this.u;
    u.frameTimeCounter.value = (u.frameTimeCounter.value + dt) % 3600;
    const angle = (game.timeOfDay - 0.25) * Math.PI * 2;
    // sunPathRotation = -30 degrees tilts the sun's path
    const tilt = -30 * Math.PI / 180;
    const sd = new THREE.Vector3(Math.cos(angle), Math.sin(angle) * Math.cos(tilt), Math.sin(angle) * Math.sin(tilt)).normalize();
    const md = sd.clone().multiplyScalar(-1);
    u.sunDir.value.copy(sd);
    u.moonDir.value.copy(md);
    const dim = game.world ? game.world.dim : 0;
    u.dimension.value = dim;
    const fog = (dim === 2 ? [0.07, 0.05, 0.11] : [0.20, 0.03, 0.03]).map((c) => Math.pow(c, 2.2));
    u.fogColorLin.value.set(fog[0], fog[1], fog[2]);
    u.moonPhase.value = Math.floor(game.dayCount || 0) % 8;
    const c = HalcyonAtmos.frame([sd.x, sd.y, sd.z], [md.x, md.y, md.z], u.moonPhase.value, dim, fog);
    u.sunColor.value.set(...c.sunColor);
    u.lightColor.value.set(...c.lightColor);
    u.skyAmbient.value.set(...c.skyAmbient);
    u.lightDir.value.copy(dim >= 1 ? new THREE.Vector3(0, 1, 0) : (c.lightIsSun ? sd : md));
    u.far.value = game.settings.renderDistance * CHUNK_SIZE;
    const p = game.player;
    u.isEyeInWater.value = p && p.eyeInWater ? 1 : p && p.eyeInLava ? 2 : 0;
    let eye = 1;
    if (p && game.world) {
      const l = game.world.getLight(Math.floor(p.pos.x), Math.floor(p.pos.y + p.eyeHeight), Math.floor(p.pos.z));
      eye = dim >= 1 ? 1 : l.sky / 15;
    }
    this.eyeSkySmooth += (eye - this.eyeSkySmooth) * Math.min(1, dt * 1.5);
    u.eyeSky.value = this.eyeSkySmooth;
    if (game.weather) u.rainStrength.value = game.weather.rain;
    this.colors = c;
  }

  // Brightness multiplier for entities (they use simple materials).
  entityLight(sky, block) {
    const u = this.u, s = sky / 15, b = block / 15;
    const lc = u.lightColor.value, amb = u.skyAmbient.value;
    const dim = u.dimension.value;
    const skyLM = dim >= 1 ? 1 : s * s;
    const direct = HalcyonAtmos.luma([lc.x, lc.y, lc.z]) * 0.55 * (dim >= 1 ? 0 : (s > 0.9 ? 1 : s * 0.5));
    const ambient = HalcyonAtmos.luma([amb.x, amb.y, amb.z]) * 1.5 * skyLM;
    const blk = (b * b * b * 1.1 + b * 0.06) * 2.2 * 0.68;
    return (direct + ambient + blk + 0.006) / Math.PI;
  }

  render(game) {
    const r = this.renderer, cam = game.camera, scene = game.scene, u = this.u;
    const size = new THREE.Vector2();
    r.getDrawingBufferSize(size);
    this.resize(size.x, size.y);
    const [W, Hh] = this.size;
    cam.updateMatrixWorld();

    // 1. sky LUT and sky/clouds
    this.pass(this.mats.lut, this.lutRT);
    const sm = this.mats.sky.uniforms;
    sm.invProj.value.copy(cam.projectionMatrixInverse);
    sm.camWorld.value.copy(cam.matrixWorld);
    sm.camPosW.value.copy(cam.position);
    sm.pixelAngle.value = 2 / (cam.projectionMatrix.elements[5] * size.y * this.preset.skyScale);
    this.pass(this.mats.sky, this.skyRT);

    // 2. shadow map (overworld only)
    if (game.world.dim === 0 && u.lightDir.value.y > 0.02) {
      const D = this.preset.shadowDistance;
      const snap = 2;
      const c = new THREE.Vector3(Math.round(cam.position.x / snap) * snap, Math.round(cam.position.y / snap) * snap, Math.round(cam.position.z / snap) * snap);
      const sc = this.shadowCam;
      sc.left = -D; sc.right = D; sc.top = D; sc.bottom = -D; sc.near = 1; sc.far = D * 4;
      sc.position.copy(c).addScaledVector(u.lightDir.value, D * 2);
      sc.up.set(0, 1, 0);
      if (Math.abs(u.lightDir.value.y) > 0.99) sc.up.set(0, 0, 1);
      sc.lookAt(c);
      sc.updateMatrixWorld();
      sc.updateProjectionMatrix();
      u.shadowMatrix.value.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse);
      scene.overrideMaterial = this.mats.shadow;
      const bg = scene.background; scene.background = null;
      r.setRenderTarget(this.shadowRT);
      r.setClearColor(0xffffff, 1);
      r.clear(true, true, false);
      r.render(scene, sc);
      scene.overrideMaterial = null;
      scene.background = bg;
    }

    // 3. opaque scene into HDR target with the sky behind it
    r.setRenderTarget(this.hdrRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    this.mats.background.uniforms.skyTex.value = this.skyRT.texture;
    this.quad.material = this.mats.background;
    r.render(this.quadScene, this.quadCam);
    cam.layers.set(0);
    r.render(scene, cam);

    // 4. copy colour + linear depth, then water/translucents (layer 2) on top
    const cm = this.mats.copy.uniforms;
    cm.colorTex.value = this.hdrRT.texture;
    cm.depthTex.value = this.hdrRT.depthTexture;
    cm.cNear.value = cam.near; cm.cFar.value = cam.far;
    this.pass(this.mats.copy, this.copyRT);
    this.mats.water.uniforms.copyTex.value = this.copyRT.texture;
    this.mats.water.uniforms.viewSize.value.set(W, Hh);
    cam.layers.set(2);
    r.setRenderTarget(this.hdrRT);
    r.render(scene, cam);
    cam.layers.set(0);
    cam.layers.enable(2);

    // 5. first-person hand
    if (game.mode === 'play' && (!game.ui || game.ui.camMode === 0)) {
      r.setRenderTarget(this.hdrRT);
      r.clearDepth();
      r.render(game.handScene, game.handCamera);
    }

    // 6. god rays + underwater → post (mipmapped for bloom)
    const c1 = this.mats.comp1.uniforms;
    c1.colorTex.value = this.hdrRT.texture;
    c1.copyTex.value = this.copyRT.texture;
    c1.invProj.value.copy(cam.projectionMatrixInverse);
    c1.camWorld.value.copy(cam.matrixWorld);
    const lp = cam.position.clone().addScaledVector(u.lightDir.value, 1000).project(cam);
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    c1.lightVisible.value = camFwd.dot(u.lightDir.value) > 0 ? 1 : 0;
    c1.lightUV.value.set(lp.x * 0.5 + 0.5, lp.y * 0.5 + 0.5);
    this.pass(this.mats.comp1, this.postRT);

    // 7. bloom
    const bm = this.mats.bloom.uniforms;
    bm.srcTex.value = this.postRT.texture;
    bm.srcSize.value.set(W, Hh);
    this.pass(this.mats.bloom, this.bloomRT);

    // 8. final grade to the screen
    const fm = this.mats.final.uniforms;
    fm.colorTex.value = this.postRT.texture;
    fm.bloomTex.value = this.bloomRT.texture;
    this.pass(this.mats.final, null);
  }
}

// Entities use MeshBasicMaterial: in HDR mode their textures are linearised so they
// match the terrain's lighting model.
THREE.ShaderChunk.map_fragment = THREE.ShaderChunk.map_fragment.replace(
  'diffuseColor *= sampledDiffuseColor;',
  '#ifdef HDR_LINEAR\n\tsampledDiffuseColor.rgb = pow(sampledDiffuseColor.rgb, vec3(2.2));\n#endif\n\tdiffuseColor *= sampledDiffuseColor;',
);
