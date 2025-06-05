precision highp float;
precision highp int;

out vec2 vUv;
out vec3 vNormal;

void main() {
    vUv = uv;
    
    // vNormal = normalize(normalMatrix * vec3(normal));
    //vNormal = normalize( mat3(modelMatrix) * vec3(normal) );
    vNormal = vec3(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}