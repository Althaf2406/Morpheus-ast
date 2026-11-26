// Life-cycle shared by every monster fragment shader.
//   n     dissolve noise in [0, 1]
//   base  permanent decay threshold (0 = intact surface)
// vState.x = dissolve progress (dying), vState.y = purify progress.
// Discards dissolved fragments, adds a burning rim while dying and a
// gold-white gleam while purified.
vec4 applyLifecycle(vec3 color, float alpha, float n, float base) {
  float dissolve = vState.x * 0.8;
  float purify = vState.y;
  float life = max(dissolve, smoothstep(0.5, 1.0, purify));
  float threshold = max(base, life);
  if (n < threshold) discard;

  float rim = (1.0 - smoothstep(0.0, 0.1, n - threshold)) * smoothstep(0.0, 0.03, life);
  vec3 rimColor = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.9, 0.55), smoothstep(0.0, 0.2, purify));

  float gleam = smoothstep(0.0, 0.4, purify);
  float sparkle = step(0.8, vnoise(vObjPos * 14.0 + vec3(uTime * 3.0))) * gleam;
  color = mix(color, vec3(1.0, 0.86, 0.5) * 1.3, gleam);
  color += vec3(1.0, 0.95, 0.8) * sparkle * 1.6;
  color += rimColor * rim * (2.2 + 2.0 * purify);
  return vec4(color, alpha);
}
