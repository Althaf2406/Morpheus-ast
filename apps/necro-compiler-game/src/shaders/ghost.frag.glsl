// Shadow lint ghost: translucent purple-blue wisp with strong fresnel and blinking alpha.
#include <fog_pars_fragment>

void main() {
  float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 1.6);
  float energy = uIntensity * vIntensity;
  float blink = mix(0.35, 1.0, fbm(vec3(uTime * uFlicker, vSeed * 30.0, 7.0)));
  float wisp = fbm(vObjPos * 2.0 + vec3(0.0, -uTime * 0.4, vSeed * 9.0));

  vec3 color = mix(uColor * 0.5, vec3(0.62, 0.7, 1.0), fres) * (0.6 + 0.6 * wisp) * (0.6 + 0.6 * energy);
  float alpha = clamp((0.1 + 0.9 * fres) * blink * (0.5 + 0.5 * wisp) * energy, 0.0, 1.0);

  float dissolveNoise = fbm(vObjPos * 3.0 + vec3(5.0));
  gl_FragColor = applyLifecycle(color, alpha, dissolveNoise, 0.0);
  #include <fog_fragment>
}
