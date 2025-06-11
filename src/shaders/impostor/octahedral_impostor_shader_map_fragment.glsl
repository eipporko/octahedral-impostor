//#include <map_fragment>
float spriteSize = 1.0 / u_sprites_per_side;
vec2 spriteUv = spriteSize * (vSprite + vUV);
#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D(map, spriteUv);
    diffuseColor *= sampledDiffuseColor;
#endif