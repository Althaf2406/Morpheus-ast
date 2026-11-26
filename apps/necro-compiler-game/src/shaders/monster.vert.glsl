// Instanced monster vertex stage: noise displacement and floating.
attribute float aSeed;
attribute float aIntensity;
attribute vec2 aState;

#include <fog_pars_vertex>

void main() {
  // Dissolved or purified entities are fully gone: skip all further work.
  if (aState.x >= 1.0 || aState.y >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t = uTime + aSeed * 31.0;
  float n = fbm(position * 1.7 + vec3(0.0, t * 0.55, 0.0));
  vec3 p = position + normal * (n - 0.5) * 2.0 * uDisplace * aIntensity;
  p.y += sin(t * uBobSpeed) * uBobAmp;

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vObjPos = position;
  vSeed = aSeed;
  vIntensity = aIntensity;
  vState = aState;
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
