// Instanced stone floor vertex stage: passes the world position to the fragment stage.
#include <fog_pars_vertex>
void main() {
  vec4 world = instanceMatrix * vec4(position, 1.0);
  vec4 mvPosition = modelViewMatrix * world;
  vObjPos = world.xyz;
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
