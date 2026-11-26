// Uniforms and varyings shared by every monster shader (both stages).
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uDisplace;
uniform float uBobAmp;
uniform float uBobSpeed;
uniform float uFlicker;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vObjPos;
varying float vSeed;
varying float vIntensity;
varying vec2 vState;
