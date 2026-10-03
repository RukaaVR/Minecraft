// Halcyon Shaders, ported from the Iris/OptiFine pack (shaders/lib/*.glsl) to WebGL2.
// The math is kept as close to the original as possible; Iris uniforms are replaced
// with uniforms this renderer sets every frame. See js/halcyon.js for the passes.
'use strict';

const HALCYON_PRESETS = {
  LOW: {
    shadowRes: 1024, shadowDistance: 64, SHADOW_SAMPLES: 4, VOLUMETRIC_CLOUDS: false, CLOUD_STEPS: 8, CLOUD_LIGHT_STEPS: 2,
    SSR: false, SSR_STEPS: 12, GODRAYS: false, GODRAY_STEPS: 12, WATER_CAUSTICS: false, AURORA: false, CONSTELLATIONS: false,
    renderScale: 0.75, skyScale: 0.34,
  },
  MEDIUM: {
    shadowRes: 2048, shadowDistance: 96, SHADOW_SAMPLES: 8, VOLUMETRIC_CLOUDS: true, CLOUD_STEPS: 12, CLOUD_LIGHT_STEPS: 3,
    SSR: false, SSR_STEPS: 16, GODRAYS: true, GODRAY_STEPS: 16, WATER_CAUSTICS: true, AURORA: true, CONSTELLATIONS: true,
    renderScale: 1, skyScale: 0.5,
  },
  HIGH: {
    shadowRes: 2048, shadowDistance: 128, SHADOW_SAMPLES: 12, VOLUMETRIC_CLOUDS: true, CLOUD_STEPS: 18, CLOUD_LIGHT_STEPS: 4,
    SSR: true, SSR_STEPS: 24, GODRAYS: true, GODRAY_STEPS: 24, WATER_CAUSTICS: true, AURORA: true, CONSTELLATIONS: true,
    renderScale: 1, skyScale: 0.5,
  },
  ULTRA: {
    shadowRes: 4096, shadowDistance: 160, SHADOW_SAMPLES: 16, VOLUMETRIC_CLOUDS: true, CLOUD_STEPS: 24, CLOUD_LIGHT_STEPS: 5,
    SSR: true, SSR_STEPS: 32, GODRAYS: true, GODRAY_STEPS: 32, WATER_CAUSTICS: true, AURORA: true, CONSTELLATIONS: true,
    renderScale: 1, skyScale: 0.75,
  },
};

function halcyonSettings(p) {
  const b = (k, on) => (on ? `#define ${k}\n` : '');
  return `
#define SUN_INTENSITY 1.00
#define AMBIENT_LIGHT 1.00
#define BLOCKLIGHT_INTENSITY 1.00
#define MIN_LIGHT 0.006
#define EXPOSURE 1.00
#define AUTO_EXPOSURE
#define SHADOW_SOFTNESS 1.00
#define SHADOW_SAMPLES ${p.SHADOW_SAMPLES}
#define SHADOW_DISTORT 0.85
#define SHADOW_BRIGHTNESS 0.00
#define AO_STRENGTH 1.00
#define VANILLA_AO_STRENGTH 0.65
#define SKY_SAMPLES 10
#define SKY_LIGHT_SAMPLES 3
#define SUN_SIZE 1.00
#define SUN_BRIGHTNESS 1.00
#define SKY_BRIGHTNESS 1.00
#define SKY_VIBRANCE 1.00
#define STARS
#define STAR_AMOUNT 1.00
#define STAR_BRIGHTNESS 1.00
#define TWINKLE
#define MILKY_WAY
#define MILKY_WAY_STRENGTH 1.00
${b('CONSTELLATIONS', p.CONSTELLATIONS)}#define CONSTELLATION_STRENGTH 1.00
#define SHOOTING_STARS
#define SHOOTING_STAR_RATE 0.60
${b('AURORA', p.AURORA)}#define AURORA_STRENGTH 0.70
#define NIGHT_GLOW 1.00
#define MOON_SIZE 1.00
#define MOON_GLOW 1.00
#define ATMOSPHERE_STRENGTH 1.00
#define FOG_DENSITY 1.00
#define FOG_START 0.70
#define FOG_END 1.00
#define HORIZON_HAZE 1.00
${b('VOLUMETRIC_CLOUDS', p.VOLUMETRIC_CLOUDS)}#define CLOUD_STEPS ${p.CLOUD_STEPS}
#define CLOUD_LIGHT_STEPS ${p.CLOUD_LIGHT_STEPS}
#define CLOUD_DENSITY 1.00
#define CLOUD_COVERAGE 0.45
#define CLOUD_SPEED 1.00
#define CLOUD_HEIGHT 280
#define CLOUD_THICKNESS 260
#define CLOUD_SCALE 1.00
#define CLOUD_SHADOWS
${b('SSR', p.SSR)}#define SSR_STEPS ${p.SSR_STEPS}
#define WATER_REFLECTION_STRENGTH 1.00
#define WATER_WAVE_STRENGTH 1.00
#define WATER_WAVE_SPEED 1.00
#define WATER_REFRACTION 1.00
#define WATER_CLARITY 1.00
${b('WATER_CAUSTICS', p.WATER_CAUSTICS)}#define WAVING_PLANTS
#define WAVING_LEAVES
#define WIND_STRENGTH 1.00
#define SUBSURFACE_STRENGTH 1.00
#define GRASS_VARIATION 1.00
${b('GODRAYS', p.GODRAYS)}#define GODRAY_STEPS ${p.GODRAY_STEPS}
#define GODRAY_STRENGTH 1.00
#define BLOOM
#define BLOOM_STRENGTH 1.00
#define SATURATION 1.00
#define CONTRAST 1.00
#define WHITE_BALANCE 0.00
#define SHADOW_TINT 1.00
#define VIGNETTE 0.30
#define TONEMAP 0
const float shadowDistance = ${p.shadowDistance.toFixed(1)};
const float shadowMapResolution = ${p.shadowRes.toFixed(1)};
`;
}

// ---- lib/common.glsl ----
const HG_COMMON = `
#define PI 3.14159265359
#define TAU 6.28318530718
#define saturate(x) clamp(x, 0.0, 1.0)
#define MAT_DEFAULT  0
#define MAT_FOLIAGE  1
#define MAT_LEAVES   2
#define MAT_HAND     3
#define MAT_EMISSIVE 4
#define MAT_ENTITY   5
#define MAT_GRASS    6
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float pow2(float x) { return x * x; }
float pow4(float x) { x *= x; return x * x; }
float pow5(float x) { float x2 = x * x; return x2 * x2 * x; }
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c)   { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float ign(vec2 fragCoord) { return fract(52.9829189 * fract(0.06711056 * fragCoord.x + 0.00583715 * fragCoord.y)); }
float noise2D(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float noise3D(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1, 0, 0)), n010 = hash13(i + vec3(0, 1, 0)), n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1)), n101 = hash13(i + vec3(1, 0, 1)), n011 = hash13(i + vec3(0, 1, 1)), n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
// Halcyon frame uniforms (Iris equivalents)
uniform float frameTimeCounter;
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform vec3 lightDir;
uniform vec3 sunColor;
uniform vec3 lightColor;
uniform vec3 skyAmbient;
uniform vec4 heldLight;
uniform int moonPhase;
uniform float rainStrength;
uniform float far;
uniform int isEyeInWater;
uniform float eyeSky;
uniform int dimension;   // 0 overworld, 1 nether
uniform vec3 fogColorLin;
`;

// ---- lib/atmosphere.glsl (getSky is only evaluated in the sky LUT pass) ----
const HG_ATMOSPHERE = `
#define SUN_ILLUMINANCE  (16.0 * SUN_INTENSITY)
#define MOON_ILLUMINANCE 0.06
const float PLANET_R = 6360e3;
const float ATMOS_R  = 6420e3;
const float H_RAY    = 8000.0;
const float H_MIE    = 1200.0;
const vec3  BETA_RAY = vec3(5.802e-6, 15.0e-6, 29.5e-6);
const float BETA_MIE_S = 3.996e-6;
const float BETA_MIE_E = 4.440e-6;
const vec3  BETA_OZO = vec3(0.650e-6, 1.881e-6, 0.085e-6);
const float MIE_G    = 0.80;
float phaseRayleigh(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float phaseHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float phaseCS(float c, float g) { float g2 = g * g; return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float raySphereExit(vec3 ro, vec3 rd, float r) { float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float d = b * b - c; return d < 0.0 ? 0.0 : -b + sqrt(d); }
vec3 atmosDensity(float h) { h = max(h, 0.0); float ozone = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0); return vec3(exp(-h / H_RAY), exp(-h / H_MIE), ozone); }
vec3 extinctionFromDensity(vec3 od) { return BETA_RAY * od.x + BETA_MIE_E * od.y + BETA_OZO * od.z * 1.5; }
vec3 lightOpticalDepth(vec3 p, vec3 l, int steps) {
  float len = raySphereExit(p, l, ATMOS_R); float ds = len / float(steps); vec3 od = vec3(0.0);
  for (int i = 0; i < steps; i++) { vec3 s = p + l * ds * (float(i) + 0.5); od += atmosDensity(length(s) - PLANET_R); }
  return od * ds;
}
float observerHeight() { return 350.0; }
vec3 scatterSky(vec3 v, vec3 l, float illuminance) {
  vec3 ro = vec3(0.0, PLANET_R + observerHeight(), 0.0);
  v.y = max(v.y, 0.0) + 0.012; v = normalize(v);
  float len = raySphereExit(ro, v, ATMOS_R);
  float c = dot(v, l); float pr = phaseRayleigh(c); float pm = phaseCS(c, MIE_G);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0), odView = vec3(0.0);
  for (int i = 0; i < SKY_SAMPLES; i++) {
    float f = (float(i) + 0.5) / float(SKY_SAMPLES);
    float t = f * f * len;
    float dt = (pow2((float(i) + 1.0) / float(SKY_SAMPLES)) - pow2(float(i) / float(SKY_SAMPLES))) * len;
    vec3 p = ro + v * t;
    vec3 d = atmosDensity(length(p) - PLANET_R) * dt;
    odView += d;
    vec3 odLight = lightOpticalDepth(p, l, SKY_LIGHT_SAMPLES);
    vec3 T = exp(-extinctionFromDensity(odView + odLight));
    sumR += T * d.x; sumM += T * d.y;
  }
  vec3 single = (sumR * BETA_RAY * pr + sumM * BETA_MIE_S * pm);
  vec3 multi = sumR * BETA_RAY * (0.25 / PI) * 0.35;
  return (single + multi) * illuminance;
}
vec3 dimSkyColor() { return fogColorLin * 1.6 + vec3(0.010, 0.003, 0.002); }
vec3 nightGradient(vec3 v) {
  float up = max(v.y, 0.0);
  vec3 zenith = vec3(0.0024, 0.0034, 0.0100), horizonC = vec3(0.0060, 0.0050, 0.0140);
  vec3 col = mix(horizonC, zenith, smoothstep(0.0, 0.6, up));
  vec2 hd = normalize(v.xz + vec2(1e-5));
  float side = dot(hd, normalize(vec2(0.75, -0.65))) * 0.5 + 0.5;
  float glow = exp(-up * 5.0) * (0.55 + 0.45 * noise2D(hd * 3.0 + 7.0));
  col += mix(vec3(0.036, 0.010, 0.070), vec3(0.004, 0.034, 0.046), smoothstep(0.25, 0.85, side)) * glow * NIGHT_GLOW;
  return col;
}
vec3 getSkyFull(vec3 v) {
  if (dimension >= 1) return dimSkyColor();
  vec3 sky = scatterSky(v, sunDir, SUN_ILLUMINANCE);
  sky += scatterSky(v, moonDir, MOON_ILLUMINANCE * 4.0) * vec3(0.55, 0.7, 1.0);
  float up = max(v.y, 0.0);
  float horizon = pow(1.0 - up, 4.0);
  sky *= mix(vec3(1.0), vec3(0.86, 1.04, 1.10), horizon * 0.6 * SKY_VIBRANCE);
  float sunset = (1.0 - smoothstep(0.0, 0.30, sunDir.y)) * smoothstep(-0.12, 0.02, sunDir.y);
  float awaySun = 0.5 - 0.5 * dot(v, sunDir);
  sky += vec3(0.42, 0.10, 0.62) * 0.09 * sunset * SKY_VIBRANCE * smoothstep(0.0, 0.4, up) * (0.4 + 0.6 * awaySun);
  float l = luma(sky);
  sky = max(mix(vec3(l), sky, 1.0 + 0.30 * SKY_VIBRANCE), 0.0);
  float night = 1.0 - smoothstep(-0.22, 0.02, sunDir.y);
  if (night > 0.0) sky += nightGradient(v) * night;
  return sky * 1.15 * SKY_BRIGHTNESS;
}
// Everyone else reads the sky from the equirect LUT rendered once per frame.
uniform sampler2D skyLUT;
vec2 skyLUTuv(vec3 v) { return vec2(atan(v.z, v.x) / TAU + 0.5, asin(clamp(v.y, -1.0, 1.0)) / PI + 0.5); }
vec3 getSky(vec3 v) { return texture(skyLUT, skyLUTuv(v)).rgb; }
vec3 sunDisk(vec3 v, vec3 sd, vec3 sc) {
  float c = dot(v, sd);
  float r = 0.9995 - 0.0008 * (SUN_SIZE - 1.0);
  float disk = smoothstep(r, r + 0.00025, c);
  float limb = sqrt(saturate((c - r) / (1.0 - r)));
  return sc * disk * mix(0.55, 1.0, limb) * 90.0 * SUN_BRIGHTNESS;
}
vec4 getAerialPerspective(vec3 relPos, float camY, vec3 skyInDir, vec3 sd, vec3 sc, float farPlane, float rain) {
  float dist = length(relPos);
  vec3 dir = relPos / max(dist, 1e-4);
  if (dimension >= 1) {
    float Td = exp(-dist * 0.010 * FOG_DENSITY) * (1.0 - smoothstep(farPlane * FOG_START, farPlane * FOG_END, dist));
    return vec4(skyInDir * (1.0 - Td), Td);
  }
  float hScale = 1.0 / 90.0;
  float y0 = max(camY - 62.0, 0.0);
  float dy = dir.y * dist;
  float heightTerm;
  if (abs(dy) > 0.01) heightTerm = (exp(-y0 * hScale) - exp(-(y0 + dy) * hScale)) / (dy * hScale);
  else heightTerm = exp(-y0 * hScale);
  heightTerm = max(heightTerm, 0.0);
  float density = 0.0019 * ATMOSPHERE_STRENGTH * (1.0 + rain * 2.0);
  float distRamp = dist * dist / (dist + 150.0);
  float odAtmos = density * distRamp * heightTerm;
  float gScale = 1.0 / 14.0;
  float gTerm;
  if (abs(dy) > 0.01) gTerm = (exp(-y0 * gScale) - exp(-(y0 + dy) * gScale)) / (dy * gScale);
  else gTerm = exp(-y0 * gScale);
  float odGround = 0.0005 * FOG_DENSITY * distRamp * max(gTerm, 0.0);
  float T = exp(-(odAtmos + odGround));
  float horizon = (1.0 - abs(dir.y)) * HORIZON_HAZE;
  T *= mix(1.0, exp(-distRamp * 0.0010), horizon * horizon);
  float horizDist = length(relPos.xz);
  float border = smoothstep(farPlane * FOG_START, farPlane * FOG_END, horizDist);
  T *= 1.0 - border;
  float c = dot(dir, sd);
  vec3 haze = skyInDir + sc * phaseHG(c, 0.72) * 0.035 * (1.0 - border);
  return vec4(haze * (1.0 - T), T);
}
`;

// ---- lib/clouds.glsl ----
const HG_CLOUDS = `
#define CLOUD_BOTTOM float(CLOUD_HEIGHT)
#define CLOUD_TOP    (float(CLOUD_HEIGHT) + float(CLOUD_THICKNESS))
#define CLOUD_CURVE_R 14000.0
vec2 cloudWind(float time) { return vec2(1.0, 0.35) * time * 3.0 * CLOUD_SPEED; }
float cloudCoverage(vec2 xz, float time) {
  vec2 p = (xz + cloudWind(time)) / (560.0 * CLOUD_SCALE);
  float n = noise2D(p) * 0.46 + noise2D(p * 2.43 + 11.7) * 0.31 + noise2D(p * 5.11 - 3.1) * 0.16 + noise2D(p * 10.3 + 5.3) * 0.07;
  float cov = CLOUD_COVERAGE;
  return saturate((n - (1.0 - cov)) / max(cov, 0.05) * 3.2);
}
float cloudDensity(vec3 wp, float time, bool detail) {
  float h = (wp.y - CLOUD_BOTTOM) / float(CLOUD_THICKNESS);
  if (h < 0.0 || h > 1.0) return 0.0;
  float cov = cloudCoverage(wp.xz, time);
  if (cov <= 0.0) return 0.0;
  float top = mix(0.35, 1.0, cov);
  float shape = smoothstep(0.0, 0.10, h) * (1.0 - smoothstep(top * 0.45, top, h));
  float d = cov * shape;
  if (detail && d > 0.0) {
    vec3 q = (wp + vec3(cloudWind(time).x, 0.0, cloudWind(time).y) * 1.6) / (105.0 * CLOUD_SCALE);
    float n = noise3D(q) * 0.55 + noise3D(q * 2.9 + 3.7) * 0.30 + noise3D(q * 7.3 - 1.9) * 0.15;
    d = saturate((d - n * 0.42 * (1.0 - d * 0.55)) * 1.9);
  }
  return d * CLOUD_DENSITY;
}
float cloudLayerHit(float y0, vec3 dir, float H) {
  float a = dot(dir.xz, dir.xz) / (2.0 * CLOUD_CURVE_R);
  float c = y0 - H;
  float disc = dir.y * dir.y - 4.0 * a * c;
  return -2.0 * c / (dir.y + sqrt(max(disc, 0.0)));
}
vec4 renderClouds(vec3 camPos, vec3 dir, float maxDist, vec3 ld, vec3 lc, vec3 amb, float time, float dither) {
  float tMin, tMax;
  if (camPos.y < CLOUD_BOTTOM) {
    tMin = cloudLayerHit(camPos.y, dir, CLOUD_BOTTOM);
    tMax = cloudLayerHit(camPos.y, dir, CLOUD_TOP);
    if (tMin < 0.0 || tMax < 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    if (abs(dir.y) < 1e-4) return vec4(0.0, 0.0, 0.0, 1.0);
    float t0 = (CLOUD_BOTTOM - camPos.y) / dir.y;
    float t1 = (CLOUD_TOP - camPos.y) / dir.y;
    tMin = max(min(t0, t1), 0.0);
    tMax = max(t0, t1);
  }
  tMax = min(tMax, maxDist);
  tMax = min(tMax, tMin + 750.0);
  if (tMax <= tMin || tMin > 4200.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float stepLen = (tMax - tMin) / float(CLOUD_STEPS);
  float c = dot(dir, ld);
  float phase = mix(phaseHG(c, 0.72), phaseHG(c, -0.18), 0.35);
  const float sigma = 0.065;
  float curve = 1.0 / (2.0 * CLOUD_CURVE_R);
  vec3 scatter = vec3(0.0);
  float T = 1.0;
  float t = tMin + stepLen * dither;
  for (int i = 0; i < CLOUD_STEPS; i++) {
    vec3 p = camPos + dir * t;
    vec2 dxz = p.xz - camPos.xz;
    p.y += dot(dxz, dxz) * curve;
    float d = cloudDensity(p, time, true);
    if (d > 0.002) {
      float od = 0.0;
      float ls = float(CLOUD_THICKNESS) * 0.16;
      for (int j = 1; j <= CLOUD_LIGHT_STEPS; j++) od += cloudDensity(p + ld * ls * float(j), time, j < 3);
      od *= ls * sigma;
      float beer = exp(-od) * 0.75 + exp(-od * 0.18) * 0.25;
      float powder = 1.0 - exp(-d * stepLen * sigma * 2.0);
      float h = (p.y - CLOUD_BOTTOM) / float(CLOUD_THICKNESS);
      vec3 direct = lc * beer * phase * mix(0.6, 1.0, powder) * 4.5;
      vec3 ambient = amb * (0.45 + 0.45 * h) + lc * 0.010 * saturate(ld.y) * (1.0 - h);
      float stepT = exp(-d * sigma * stepLen);
      scatter += (direct + ambient) * (1.0 - stepT) * T;
      T *= stepT;
      if (T < 0.02) break;
    }
    t += stepLen;
  }
  float fade = exp(-max(tMin - 400.0, 0.0) / 1800.0) * (1.0 - smoothstep(2600.0, 4200.0, tMin));
  return vec4(scatter * fade, mix(1.0, T, fade));
}
vec4 renderClouds2D(vec3 camPos, vec3 dir, vec3 ld, vec3 lc, vec3 amb, float time) {
  if (dir.y <= 0.01) return vec4(0.0, 0.0, 0.0, 1.0);
  float mid = (CLOUD_BOTTOM + CLOUD_TOP) * 0.5;
  float t = (mid - camPos.y) / dir.y;
  if (t < 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 p = camPos + dir * t;
  float cov = cloudCoverage(p.xz, time);
  float cov2 = cloudCoverage(p.xz + ld.xz * 120.0, time);
  float alpha = saturate(cov * 1.6 * CLOUD_DENSITY);
  float c = dot(dir, ld);
  float phase = mix(phaseHG(c, 0.72), phaseHG(c, -0.18), 0.35);
  vec3 col = lc * exp(-cov2 * 2.2) * phase * 4.5 * 0.55 + amb * 0.45;
  float fade = exp(-max(t - 400.0, 0.0) / 1800.0) * (1.0 - smoothstep(2600.0, 4200.0, t));
  alpha *= fade;
  return vec4(col * alpha, 1.0 - alpha);
}
float cloudShadow(vec3 wp, vec3 ld, float time) {
  if (dimension >= 1 || ld.y < 0.05) return 1.0;
  float mid = (CLOUD_BOTTOM + CLOUD_TOP) * 0.5;
  vec3 p = wp + ld * ((mid - wp.y) / ld.y);
  float cov = cloudCoverage(p.xz, time);
  return mix(1.0, exp(-cov * 3.0 * CLOUD_DENSITY), 0.85);
}
`;

// ---- lib/nightsky.glsl ----
const HG_NIGHTSKY = `
float fbm3(vec3 p) { return noise3D(p) * 0.50 + noise3D(p * 2.03 + 1.7) * 0.25 + noise3D(p * 4.11 - 3.3) * 0.15 + noise3D(p * 8.27 + 5.1) * 0.10; }
mat3 celestialFrame(vec3 sd) { vec3 a = sd; vec3 b = normalize(cross(vec3(0.0, 0.0, 1.0), a) + vec3(0.0, 1e-4, 0.0)); vec3 c = cross(a, b); return mat3(a, b, c); }
vec3 starColor(float t) {
  vec3 c = mix(vec3(0.65, 0.78, 1.0), vec3(1.0), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(1.0, 0.86, 0.62), smoothstep(0.55, 0.85, t));
  return mix(c, vec3(1.0, 0.66, 0.42), smoothstep(0.9, 1.0, t));
}
vec3 starLayer(vec3 v, float scale, float density, float seed, float pixelAngle, float time) {
  vec3 p = v * scale; vec3 cell = floor(p);
  float h = hash13(cell + seed);
  if (h > density) return vec3(0.0);
  vec3 pos = vec3(hash13(cell + seed + 1.31), hash13(cell + seed + 2.77), hash13(cell + seed + 5.13)) * 0.6 + 0.2;
  float dAng = length(fract(p) - pos) / scale;
  float m = hash13(cell + seed + 3.37);
  float mag = pow(m, 9.0) * 6.0 + pow(m, 2.0) * 0.4 + 0.05;
  float size = (0.6 + 1.6 * pow(m, 6.0)) * 0.00025;
  float sigma = max(size, pixelAngle * 0.65);
  float energy = pow(size / sigma, 2.0);
  float core = exp(-dAng * dAng / (sigma * sigma)) * energy;
  float halo = exp(-dAng / (sigma * 4.0)) * 0.04 * pow(m, 6.0);
  float tw = 0.65 + 0.35 * sin(time * (1.5 + h * 6.0) + h * 91.0) * sin(time * (0.7 + m * 3.0) + m * 37.0);
  return starColor(hash13(cell + seed + 7.71)) * (core + halo) * mag * tw;
}
vec4 milkyWay(vec3 c) {
  vec3 n = normalize(vec3(0.32, 0.58, 0.75));
  float b = dot(c, n);
  float band = exp(-b * b / 0.035);
  if (band < 0.01) return vec4(0.0);
  float structure = fbm3(c * 5.0);
  float dust = fbm3(c * 13.0 + 4.0);
  float lanes = 1.0 - 0.80 * smoothstep(0.42, 0.62, dust) * exp(-b * b / 0.006);
  float core = pow(saturate(dot(c, normalize(vec3(-0.6, 0.15, 0.78))) * 0.5 + 0.5), 4.0);
  float intensity = band * (0.35 + 0.9 * structure) * lanes * (0.6 + 1.6 * core);
  vec3 col = mix(vec3(0.30, 0.42, 1.00), vec3(0.85, 0.45, 1.00), noise3D(c * 3.0));
  col = mix(col, vec3(1.0, 0.80, 0.70), core * 0.6);
  return vec4(col * intensity * 0.010 * MILKY_WAY_STRENGTH, band);
}
vec2 constCell(vec2 c) { return c + hash22(c) * 0.7 + 0.15; }
float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = saturate(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
vec3 constellations(vec3 c, float pixelAngle) {
#ifdef CONSTELLATIONS
  if (abs(c.y) > 0.92) return vec3(0.0);
  const float G = 7.0;
  vec2 g = vec2(atan(c.z, c.x), asin(clamp(c.y, -1.0, 1.0))) * G;
  vec2 base = floor(g);
  float lineW = pixelAngle * G * 0.8;
  float lines = 0.0, anchors = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    vec2 cell = base + vec2(x, y);
    if (noise2D(cell * 0.35 + 3.0) < 0.60) continue;
    vec2 a = constCell(cell);
    vec2 hl = hash22(cell + 17.0);
    float da = length(g - a);
    anchors += exp(-da * da / max(lineW * lineW * 2.0, 1e-6));
    if (hl.x > 0.40) {
      vec2 b = constCell(cell + vec2(1.0, 0.0));
      lines += (1.0 - smoothstep(0.0, lineW, segDist(g, a, b))) * smoothstep(0.08, 0.16, min(da, length(g - b)));
    }
    if (hl.y > 0.55) {
      vec2 b = constCell(cell + vec2(hl.x > 0.7 ? 1.0 : 0.0, 1.0));
      lines += (1.0 - smoothstep(0.0, lineW, segDist(g, a, b))) * smoothstep(0.08, 0.16, min(da, length(g - b)));
    }
  }
  return vec3(0.55, 0.70, 1.0) * (saturate(lines) * 0.012 + anchors * 0.10) * CONSTELLATION_STRENGTH;
#else
  return vec3(0.0);
#endif
}
vec3 shootingStars(vec3 v, float time, float pixelAngle) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float period = 5.0 + fi * 3.7;
    float tShift = time + fi * 2.13;
    float slot = floor(tShift / period);
    float tt = tShift - slot * period;
    const float dur = 0.85;
    if (tt > dur) continue;
    vec2 r1 = hash22(vec2(slot, fi * 7.0 + 1.0));
    vec2 r2 = hash22(vec2(slot + 13.0, fi * 3.0 + 5.0));
    if (r2.y > SHOOTING_STAR_RATE) continue;
    float az = r1.x * TAU, el = 0.30 + r1.y * 0.85;
    vec3 start = vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el));
    vec3 side = normalize(cross(start, vec3(0.0, 1.0, 0.0)));
    vec3 down = cross(side, start);
    float ang = (r2.x - 0.5) * 2.2;
    vec3 travel = normalize(side * cos(ang) + down * (0.6 + 0.4 * abs(sin(ang))));
    float prog = tt / dur;
    float len = 0.30 + r2.x * 0.2;
    vec3 head = normalize(start + travel * len * prog);
    if (dot(v, head) < 0.96) continue;
    vec3 dv = v - head;
    float along = dot(dv, travel);
    float across = abs(dot(dv, normalize(cross(head, travel))));
    float tail = 0.24 * smoothstep(0.0, 0.25, prog) + 0.002;
    float w = max(0.0009, pixelAngle * 1.1);
    float fade = sin(prog * PI);
    float streak = along < 0.0 && along > -tail ? pow(1.0 + along / tail, 1.2) : 0.0;
    float body = exp(-across * across / (w * w)) * streak;
    float headGlow = exp(-dot(dv, dv) / (w * w * 4.0));
    col += vec3(0.85, 0.92, 1.0) * (body * 1.8 + headGlow * 1.5) * fade;
  }
  return col;
}
vec3 aurora(vec3 v, float time) {
#ifdef AURORA
  if (v.y < 0.02) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float h = 1.0 + float(i) * 0.12;
    vec2 uv = v.xz / (v.y + 0.12) * h * 0.55;
    float flow = noise2D(uv * 0.35 + vec2(time * 0.015, 0.0)) * 5.0;
    float curtain = abs(sin(uv.x * 0.9 + uv.y * 0.35 + flow));
    float ribbon = 1.0 - smoothstep(0.0, 0.22, curtain);
    float streaks = 0.55 + 0.45 * noise2D(vec2(uv.x * 9.0 + flow, float(i)));
    float fadeH = float(i) / 6.0;
    vec3 c = mix(vec3(0.05, 0.95, 0.65), vec3(0.55, 0.20, 1.0), fadeH);
    acc += c * ribbon * streaks * (1.0 - fadeH * 0.5);
  }
  float mask = smoothstep(0.02, 0.18, v.y) * (1.0 - smoothstep(0.55, 0.95, v.y));
  float region = smoothstep(0.20, 0.60, noise2D(normalize(v.xz + 1e-5) * 1.6 + time * 0.003));
  return acc * mask * region * 0.020 * AURORA_STRENGTH;
#else
  return vec3(0.0);
#endif
}
vec3 renderMoon(vec3 v, vec3 md, float pixelAngle) {
  float radius = 0.080 * MOON_SIZE;
  float c = dot(v, md);
  float ang = acos(clamp(c, -1.0, 1.0));
  vec3 col = vec3(0.0);
  float visible = smoothstep(-0.04, 0.04, md.y);
  col += vec3(0.45, 0.58, 1.0) * (exp(-max(ang - radius, 0.0) / (radius * 0.6)) * 0.035 + exp(-ang / (radius * 5.0)) * 0.010) * MOON_GLOW;
  if (ang < radius * 1.05) {
    vec3 right = normalize(cross(md, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
    vec3 upv = cross(right, md);
    vec2 uv = vec2(dot(v, right), dot(v, upv)) / radius;
    float r = length(uv);
    float edge = 1.0 - smoothstep(1.0 - pixelAngle / radius * 1.5, 1.0, r);
    vec3 n = vec3(uv, sqrt(max(1.0 - r * r, 0.0)));
    float maria = smoothstep(0.48, 0.62, noise2D(uv * 1.7 + 4.0) * 0.65 + noise2D(uv * 3.9) * 0.35);
    float crat = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 q = uv * (5.0 + float(i) * 6.0);
      vec2 id = floor(q);
      vec2 f = fract(q) - 0.5 - (hash22(id + float(i) * 11.0) - 0.5) * 0.5;
      float cr = hash12(id + 3.0 + float(i)) * 0.32;
      float d = length(f);
      crat += ((1.0 - smoothstep(cr * 0.6, cr, d)) * -0.18 + (1.0 - smoothstep(cr, cr * 1.25, d)) * smoothstep(cr * 0.8, cr, d) * 0.22) * step(0.45, hash12(id + 9.0 + float(i)));
    }
    float albedo = 0.86 - maria * 0.30 + crat * 0.5 + (noise2D(uv * 24.0) - 0.5) * 0.08;
    float pa = float(moonPhase) / 8.0 * TAU;
    vec3 L = vec3(sin(pa), 0.0, cos(pa));
    float lit = smoothstep(-0.05, 0.12, dot(n, L));
    float limb = mix(0.70, 1.0, n.z);
    vec3 surface = vec3(0.92, 0.95, 1.0) * albedo * (lit * limb + 0.025);
    col = mix(col, surface * 0.42, edge);
  }
  return col * visible;
}
vec3 nightSkyDetail(vec3 v, float pixelAngle, float time, float night) {
  vec3 col = vec3(0.0);
  if (night > 0.001 && v.y > -0.05) {
    vec3 c = transpose(celestialFrame(sunDir)) * v;
    float horizonDim = smoothstep(-0.02, 0.12, v.y);
    vec4 mw = milkyWay(c);
    float densBoost = 1.0 + mw.a * 2.0;
    vec3 s = starLayer(c, 110.0, 0.45 * STAR_AMOUNT, 0.0, pixelAngle, time);
    s += starLayer(c, 230.0, 0.30 * STAR_AMOUNT * densBoost, 17.0, pixelAngle, time) * 0.7;
    s += starLayer(c, 470.0, 0.16 * STAR_AMOUNT * densBoost, 43.0, pixelAngle, time) * 0.45;
    col += s * 0.13 * STAR_BRIGHTNESS;
    col += mw.rgb;
    col += constellations(c, pixelAngle);
    col *= horizonDim;
    col += aurora(v, time);
    col += shootingStars(v, time, pixelAngle) * 0.25 * horizonDim;
    col *= night;
  }
  col += renderMoon(v, moonDir, pixelAngle);
  return col;
}
`;

// ---- lib/shadows.glsl ----
const HG_SHADOWS = `
uniform sampler2D shadowtex;
uniform mat4 shadowMatrix;   // shadow projection * shadow view (world space in)
float shadowDistortFactor(vec2 p) { return length(p) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT); }
vec2 vogelDisk(int i, int n, float phi) { float r = sqrt((float(i) + 0.5) / float(n)); float theta = float(i) * 2.39996323 + phi; return r * vec2(cos(theta), sin(theta)); }
vec3 getShadow(vec3 playerPos, vec3 normalW, vec3 ld, float dither, float softnessMul) {
  float dist = length(playerPos);
  if (dist > shadowDistance * 0.98) return vec3(1.0);
  float NdotL = dot(normalW, ld);
  float texelWorld = 2.0 * shadowDistance / shadowMapResolution;
  float distF = 1.0 + dist / 48.0;
  vec3 offsetPos = playerPos + normalW * texelWorld * (0.6 + 1.4 * (1.0 - abs(NdotL))) * distF;
  vec4 sp4 = shadowMatrix * vec4(offsetPos + cameraPosition, 1.0);
  vec3 sp = sp4.xyz;
  float f = shadowDistortFactor(sp.xy);
  vec3 spd = vec3(sp.xy / f, sp.z) * 0.5 + 0.5;
  spd.z -= 0.0004 * f;
  float worldRadius = 0.11 * SHADOW_SOFTNESS * softnessMul * (1.0 + dist / 96.0);
  float radius = worldRadius / (2.0 * shadowDistance) / (f * f) * (1.0 - SHADOW_DISTORT);
  radius = max(radius, 1.2 / shadowMapResolution);
  float phi = dither * TAU;
  float vis = 0.0;
  for (int i = 0; i < SHADOW_SAMPLES; i++) {
    vec2 o = vogelDisk(i, SHADOW_SAMPLES, phi) * radius;
    float d = texture(shadowtex, spd.xy + o).r;
    vis += spd.z <= d ? 1.0 : 0.0;
  }
  return vec3(vis / float(SHADOW_SAMPLES));
}
`;

// ---- lib/lighting.glsl ----
const HG_LIGHTING = `
#define BLOCKLIGHT_COLOR vec3(1.0, 0.58, 0.28)
vec3 shadeSurface(vec3 albedo, vec3 normal, vec3 viewDir, float skylight, float blocklight, float ao, int material,
                  vec3 shadow, vec3 sssShadow, vec3 ld, vec3 lc, vec3 amb) {
  bool foliage = material == MAT_FOLIAGE;
  bool leaves = material == MAT_LEAVES;
  bool translucentPlant = foliage || leaves;
  float NdotL = dot(normal, ld);
  float diffuse;
  if (foliage) diffuse = 0.55 + 0.25 * saturate(NdotL + 0.5);
  else if (leaves) diffuse = saturate(NdotL * 0.65 + 0.35);
  else diffuse = saturate(NdotL);
  vec3 direct = lc * diffuse * shadow;
  vec3 sss = vec3(0.0);
  if (translucentPlant) {
    float VdotL = saturate(dot(viewDir, ld));
    float forward = pow(VdotL, 7.0) * 1.6 + pow(VdotL, 2.0) * 0.25;
    float thin = leaves ? 0.22 : 0.35;
    sss = lc * sssShadow * albedo * (thin + forward) * 0.55 * SUBSURFACE_STRENGTH;
  }
  float skyLM = skylight * skylight;
  if (dimension >= 1) skyLM = 1.0;
  float upness = normal.y * 0.5 + 0.5;
  float skyVis = mix(0.55, 1.0, upness);
  if (translucentPlant) skyVis = 0.85;
  vec3 ambient = amb * skyVis * skyLM * 1.5 * AMBIENT_LIGHT;
  float bounceVis = saturate(0.6 - normal.y * 0.4);
  vec3 bounce = lc * vec3(0.30, 0.34, 0.22) * 0.075 * bounceVis * skyLM * saturate(ld.y + 0.2) * AMBIENT_LIGHT;
  float bl = blocklight;
  vec3 block = BLOCKLIGHT_COLOR * (bl * bl * bl * 1.1 + bl * 0.06) * 2.2 * BLOCKLIGHT_INTENSITY;
  vec3 minLight = vec3(0.8, 0.9, 1.0) * MIN_LIGHT;
  vec3 indirect = (ambient + bounce + block + minLight) * ao;
  vec3 col = albedo / PI * (direct + indirect + vec3(SHADOW_BRIGHTNESS) * lc * 0.05) + sss / PI;
  if (material == MAT_EMISSIVE) col += albedo * pow(luma(albedo), 1.5) * 6.0 * BLOCKLIGHT_INTENSITY;
  return col;
}
`;

// ---- lib/wind.glsl ----
const HG_WIND = `
vec3 windOffset(vec3 wp, float t) {
  float gust = noise2D(wp.xz * 0.035 + vec2(t * 0.22, t * 0.13));
  float w = sin(t * 1.7 + wp.x * 0.55 + wp.z * 0.35) * 0.6 + sin(t * 3.1 + wp.x * 1.30 - wp.z * 0.90) * 0.25 + sin(t * 5.3 - wp.x * 2.10 + wp.z * 1.70) * 0.10;
  float v = sin(t * 2.3 + wp.z * 0.8 + wp.x * 0.2) * 0.5;
  return vec3(w, v * 0.15, w * 0.55 + v * 0.3) * 0.075 * WIND_STRENGTH * (0.35 + gust * 1.1);
}
`;

// ---- lib/water.glsl ----
const HG_WATER = `
#define WATER_ABSORPTION (vec3(0.55, 0.19, 0.12) / WATER_CLARITY)
#define WATER_SCATTER    (vec3(0.010, 0.050, 0.085) / WATER_CLARITY)
#define WATER_SCATTER_COLOR vec3(0.04, 0.28, 0.60)
float waterHeight(vec2 p, float time) {
  float t = time * WATER_WAVE_SPEED;
  float h = 0.0, amp = 1.0, freq = 0.55;
  vec2 dir = vec2(1.0, 0.3);
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    vec2 q = p * freq + dir * t * (0.55 + 0.25 * float(i));
    h += (noise2D(q) - 0.5) * amp;
    h += (1.0 - abs(noise2D(q * 1.7 + 4.0) * 2.0 - 1.0)) * amp * 0.25;
    amp *= 0.5; freq *= 2.1; dir = rot * dir; p = rot * p;
  }
  return h;
}
vec3 waterNormal(vec2 xz, float time, float distanceToCam) {
  const float e = 0.06;
  float h0 = waterHeight(xz, time), hx = waterHeight(xz + vec2(e, 0.0), time), hz = waterHeight(xz + vec2(0.0, e), time);
  float strength = 0.040 * WATER_WAVE_STRENGTH / (1.0 + distanceToCam / 24.0);
  vec2 slope = vec2(h0 - hx, h0 - hz) / e * strength;
  return normalize(vec3(slope.x, 1.0, slope.y));
}
float waterCaustics(vec3 wp, float time) {
  vec2 p = wp.xz + wp.y * 0.2;
  float t = time * WATER_WAVE_SPEED * 0.8;
  float a = noise2D(p * 1.3 + vec2(t, t * 0.6));
  float b = noise2D(p * 1.3 * 1.7 - vec2(t * 0.7, t));
  float c = 1.0 - abs(a - b) * 2.0;
  return 0.45 + pow(saturate(c), 6.0) * 1.6;
}
vec3 waterInscatter(float dist, vec3 lightInWater) {
  vec3 ext = WATER_ABSORPTION + WATER_SCATTER;
  return lightInWater * WATER_SCATTER_COLOR * (WATER_SCATTER / ext) * (1.0 - exp(-ext * dist)) * 0.08;
}
float ggxSpecular(vec3 N, vec3 V, vec3 L, float roughness) {
  vec3 H = normalize(V + L);
  float NdotH = saturate(dot(N, H)), NdotL = saturate(dot(N, L)), NdotV = saturate(dot(N, V));
  float a2 = pow4(roughness);
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  float k = roughness * roughness * 0.5;
  float G = (NdotL / (NdotL * (1.0 - k) + k)) * (NdotV / (NdotV * (1.0 - k) + k));
  return D * G / max(4.0 * NdotV, 1e-3);
}
`;

// Face index (0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z, 6 up for plants) -> normal
const HG_FACE = `
vec3 faceNormal(float f) {
  if (f < 0.5) return vec3(-1.0, 0.0, 0.0);
  if (f < 1.5) return vec3(1.0, 0.0, 0.0);
  if (f < 2.5) return vec3(0.0, -1.0, 0.0);
  if (f < 3.5 || f > 5.5) return vec3(0.0, 1.0, 0.0);
  if (f < 4.5) return vec3(0.0, 0.0, -1.0);
  return vec3(0.0, 0.0, 1.0);
}
`;
