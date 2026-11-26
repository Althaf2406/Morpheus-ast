// Zombie variable: putrid green flesh, surface rotted through by noise holes.
#include <fog_pars_fragment>

void main() {
  float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 3.0);
  float energy = uIntensity * vIntensity;
  float pulse = 0.5 + 0.5 * sin(uTime * uFlicker + vSeed * 6.2831);
  float rot = fbm(vObjPos * 3.4 + vec3(vSeed * 17.0));
  float decay = 0.16 + 0.1 * pulse;
  float patches = smoothstep(0.35, 0.65, fbm(vObjPos * 5.0 + vec3(4.0)));

  vec3 flesh = mix(uColor, uColor * 0.25 + vec3(0.12, 0.06, 0.02), patches) * (0.35 + 0.5 * rot);
  vec3 ooze = vec3(0.65, 0.8, 0.15) * (1.0 - smoothstep(0.0, 0.07, rot - decay)) * 1.4;
  vec3 sheen = uColor * fres * 0.9 * energy;

  gl_FragColor = applyLifecycle(flesh + ooze + sheen, 1.0, rot, decay);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
