import * as THREE from 'three'

// Shader patches for the standard materials of the scene.
// 1. Two-zone sun shadows: a high-resolution shadow map around the lander (near light) and a map of
//    the whole patch (far light). Each fragment takes the near light inside the zone, the far light
//    outside, with a blend band, so the surface is lit exactly once.
// 2. Regolith detail (terrain only): triplanar world-space bump at three scales and brightness variation.
// 3. Distance haze: a slight darkening towards the horizon.

export interface SharedUniforms {
  uNearC: { value: THREE.Vector2 }
  uNearR: { value: number }
  uDetail: { value: THREE.Texture | null }
  /** Haze start and end distance (m) and maximum mix. */
  uHaze: { value: THREE.Vector3 }
  /** Haze colour in display space (not colour managed). */
  uHazeColor: { value: THREE.Vector3 }
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uNearC: { value: new THREE.Vector2() },
    uNearR: { value: 300 },
    uDetail: { value: null },
    uHaze: { value: new THREE.Vector3(1500, 14000, 0.7) },
    uHazeColor: { value: new THREE.Vector3(0.085, 0.088, 0.1) },
  }
}

const SHADOW_NEEDLE =
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;'

const SHADOW_REPLACEMENT = `
{
  float cw = ( UNROLLED_LOOP_INDEX == 0 ) ? cascNear : 1.0 - cascNear;
  float sh = 0.0;
  if ( cw > 0.002 ) {
    sh = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
  }
  directLight.color *= cw * sh;
}`

/** False when the installed three.js no longer has the line this patch replaces (the scene then uses one light). */
export const CASCADE_PATCH_OK: boolean = THREE.ShaderChunk.lights_fragment_begin.includes(SHADOW_NEEDLE)

export function cascadedLightsChunk(): string {
  return THREE.ShaderChunk.lights_fragment_begin.replace(SHADOW_NEEDLE, SHADOW_REPLACEMENT)
}

const COMMON_PARS = `
#include <common>
uniform vec2 uNearC;
uniform float uNearR;
uniform vec3 uHaze;
uniform vec3 uHazeColor;
varying vec3 vWPos;
`

const TERRAIN_PARS = `
uniform sampler2D uDetail;
varying vec3 vWNrm;
const vec3 DETAIL_PERIOD = vec3(2.4, 19.0, 130.0);
// Slope strength per scale: fine grain, small relief, broad undulation.
const vec3 DETAIL_SLOPE = vec3(0.35, 0.28, 0.2);
vec2 gradAt( vec2 uv ) {
  return ( texture2D( uDetail, uv ).rg - 0.5 ) * 8.0;
}
// Triplanar height gradient along the world axes.
vec3 triG( vec3 p, vec3 w ) {
  vec2 gxz = gradAt( p.xz );
  vec2 gzy = gradAt( p.zy );
  vec2 gxy = gradAt( p.xy );
  return vec3( w.y * gxz.x + w.z * gxy.x, w.x * gzy.y + w.z * gxy.y, w.y * gxz.y + w.x * gzy.x );
}
`

const TERRAIN_DETAIL = `
#include <normal_fragment_maps>
{
  float dCam = length( vViewPosition );
  vec3 nw = normalize( vWNrm );
  vec3 tw = pow( abs( nw ), vec3( 4.0 ) );
  tw /= ( tw.x + tw.y + tw.z );
  float fadeF = 1.0 - smoothstep( 25.0, 130.0, dCam );
  float fadeC = 1.0 - smoothstep( 140.0, 900.0, dCam );
  float fadeM = 1.0 - smoothstep( 500.0, 5000.0, dCam );
  vec3 g = triG( vWPos / DETAIL_PERIOD.x, tw ) * DETAIL_SLOPE.x * fadeF
         + triG( vWPos / DETAIL_PERIOD.y, tw ) * DETAIL_SLOPE.y * fadeC
         + triG( vWPos / DETAIL_PERIOD.z, tw ) * DETAIL_SLOPE.z * fadeM;
  nw = normalize( nw - ( g - dot( g, nw ) * nw ) );
  normal = normalize( ( viewMatrix * vec4( nw, 0.0 ) ).xyz );
  float vA = texture2D( uDetail, vWPos.xz / 85.0 ).b;
  float vB = texture2D( uDetail, vWPos.xz / 610.0 + 0.37 ).b;
  float vC = texture2D( uDetail, vWPos.xz / 6.0 ).b;
  float tn = texture2D( uDetail, vWPos.xz / 330.0 ).a;
  float vary = 0.62 + 0.38 * ( vA + vB ) + 0.3 * ( vC - 0.5 ) * fadeC;
  vec3 tint = mix( vec3( 1.02, 1.0, 0.96 ), vec3( 0.96, 0.99, 1.03 ), tn );
  diffuseColor.rgb *= vary * tint;
}
`

const HAZE = `
{
  float hzD = length( vViewPosition );
  float hz = smoothstep( uHaze.x, uHaze.y, hzD ) * uHaze.z;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uHazeColor, hz );
}
`

export type PatchKind = 'terrain' | 'prop'

/** Install the patches on a MeshStandardMaterial. `cascades` is false when the scene runs a single light. */
export function installPatches(
  material: THREE.MeshStandardMaterial,
  shared: SharedUniforms,
  kind: PatchKind,
  cascades: boolean,
): void {
  const terrain = kind === 'terrain'
  material.customProgramCacheKey = () => `viz3d-${kind}-${cascades ? 'c' : 's'}`
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNearC = shared.uNearC
    shader.uniforms.uNearR = shared.uNearR
    shader.uniforms.uHaze = shared.uHaze
    shader.uniforms.uHazeColor = shared.uHazeColor
    if (terrain) shader.uniforms.uDetail = shared.uDetail

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + (terrain ? 'varying vec3 vWNrm;\n' : ''))
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 wpC = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
wpC = instanceMatrix * wpC;
#endif
vWPos = ( modelMatrix * wpC ).xyz;
${terrain ? 'vWNrm = normalize( mat3( modelMatrix ) * objectNormal );' : ''}`,
      )

    let frag = shader.fragmentShader.replace('#include <common>', COMMON_PARS + (terrain ? TERRAIN_PARS : ''))
    if (terrain) frag = frag.replace('#include <normal_fragment_maps>', TERRAIN_DETAIL)
    if (cascades) {
      frag = frag.replace(
        '#include <lights_fragment_begin>',
        'float cascNear = 1.0 - smoothstep( uNearR * 0.7, uNearR, distance( vWPos.xz, uNearC ) );\n' +
          cascadedLightsChunk(),
      )
    }
    frag = frag.replace('#include <fog_fragment>', HAZE)
    shader.fragmentShader = frag
  }
  material.needsUpdate = true
}
