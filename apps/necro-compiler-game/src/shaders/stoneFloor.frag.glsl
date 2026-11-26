// Procedural dark flagstone: tiled slabs, mortar seams and mottled grain, tinted by uColor.
#include <fog_pars_fragment>
void main() {
  vec2 cell = vObjPos.xz * 0.9;
  vec2 id = floor(cell);
  vec2 local = fract(cell);
  float edge = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
  float mortar = 1.0 - smoothstep(0.02, 0.07, edge);
  float slab = hash31(vec3(id, 3.0));
  float grain = fbm(vec3(vObjPos.xz * 3.0, slab * 10.0));
  float tone = 0.55 + 0.45 * slab;
  vec3 stone = uColor * tone * (0.6 + 0.8 * grain);
  vec3 color = mix(stone, uColor * 0.15, mortar);
  float top = clamp(normalize(vNormal).y, 0.0, 1.0);
  color *= 0.5 + 0.5 * top;
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
