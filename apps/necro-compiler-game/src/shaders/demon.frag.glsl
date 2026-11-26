// Poltergeist demon (and boss): glowing crystal with fire-like flicker.
#include <fog_pars_fragment>

void main() {
  float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 2.2);
  float energy = uIntensity * vIntensity;
  float flick = mix(0.5, 1.3, fbm(vec3(uTime * uFlicker, vSeed * 40.0, 3.0)));
  float heat = fbm(vObjPos * 2.4 + vec3(0.0, -uTime * 0.9, vSeed * 20.0));
  float vein = smoothstep(0.07, 0.0, abs(heat - 0.5));

  vec3 body = uColor * (0.12 + 0.3 * heat);
  vec3 glow = mix(uColor, vec3(1.0, 0.78, 0.3), fres) * fres * 2.4 * flick * energy;
  vec3 cracks = mix(uColor, vec3(1.0, 0.85, 0.4), 0.5) * vein * 1.8 * flick * energy;

  float dissolveNoise = fbm(vObjPos * 3.0 + vec3(11.0));
  gl_FragColor = applyLifecycle(body + glow + cracks, 1.0, dissolveNoise, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
