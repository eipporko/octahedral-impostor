precision highp float;
precision highp int;

in vec2 vUv;
in vec3 vNormal;

layout(location = 0) out vec4 gAlbedo;
layout(location = 1) out vec4 gNormalDepth;

uniform sampler2D u_albedo_tex;

void main() {

    vec4 albedo = texture(u_albedo_tex, vUv);
    vec3 normal = normalize(vNormal);
    float depth = gl_FragCoord.z;

    if (albedo.a < 0.5) {
        discard;
    }

    gAlbedo = albedo;
    gNormalDepth = vec4(normal, depth);
}